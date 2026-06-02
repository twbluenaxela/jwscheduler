# CLAUDE.md — 新屋會眾聚會編排 Scheduler

Touch-friendly web app replacing the Excel scheduling workflow for 新屋 (Xinwu) congregation midweek and weekend meeting assignments. See `meeting-scheduler-plan.md` for full architecture decisions and phasing. See `agents.md` for planned Claude API integrations and AI-assisted workflows.

---

## Stack

- **Framework:** Next.js 16 (app router, `'use client'` root), React 19
- **Language:** JavaScript (no TypeScript)
- **Styling:** Single global CSS file (`app/globals.css`) — no CSS modules, no Tailwind
- **Font:** Noto Sans TC via `next/font/google`
- **Auth:** Firebase (email/password + Google OAuth) — client SDK + Admin SDK
- **Database:** Neon Postgres via Prisma 6 (`prisma-client-js`)
- **EPUB parsing:** `jszip` (client-side unzip) + browser `DOMParser` — no server needed
- **Image export:** `html-to-image` (DOM screenshot → JPG/PNG)
- **Deploy:** fly.io — live at https://jwscheduler.fly.dev/

---

## Project structure

```
app/
  page.js              — root component; auth gating + all shared state
  layout.js            — AuthProvider wrapper, font loading, html/body; PWA
                         metadata (manifest, themeColor viewport, apple-web-app)
                         + <PWARegister/> for service-worker registration
  manifest.js          — PWA web app manifest (name, icons, standalone display,
                         theme/background colour) — Next 16 app-router convention
  globals.css          — full design system (tokens, all component styles)
  login/
    page.js            — Firebase login UI (email/password + Google popup);
                         redirects to / once useAuth().firebaseUser is set
  join/[token]/
    page.js            — Invite link handler (joins congregation via token)
  api/
    auth/sync/         — POST: upsert Firebase user into Postgres (does NOT
                         overwrite displayName on update — only sets it on create)
    congregations/     — POST: create congregation (caller becomes ADMIN)
    congregations/join/— POST: join via inviteToken
    congregations/settings/ — GET/PATCH: congregation settings (admin only)
    congregations/data/— GET: load all congregation data (weeks, people, weekend rows)
    midweek-weeks/import/ — POST: save imported weeks + parts to DB
    people/            — GET: list members, POST: create member
    people/[id]/       — PATCH: update member, DELETE: remove member
    users/me/          — PATCH: update current user's displayName
    assignments/       — POST: upsert/delete a single midweek assignment by slotId
    midweek-weeks/[id]/— PATCH: update week fields + all parts in one transaction
                         (called on edit-mode exit); DELETE: remove week + cascade
    weekend-rows/      — POST: create a new WeekendRow (date defaults to last row + 7 days)
    weekend-rows/[id]/ — PATCH: update one or more fields on a WeekendRow (speaker,
                         chair, wt, read, host, away, topic, no, cong, note, label,
                         date, type); DELETE: remove a WeekendRow
    suggest/weekend-row/   — POST: suggest speaker/chair/wt/read for a new row
                             (recency-scoring algorithm, no AI)
    suggest/midweek-week/  — POST: suggest all empty slots in a week
                             body: { weekId, assignments: {[slotId]:name} }
    meetings/publish/  — POST: diff current vs publishedSnapshot (future weeks only),
                         push LINE messages for changed assignments (midweek + weekend),
                         save new snapshot. Snapshot covers ALL assigned names (not just
                         LINE-linked people) so meetings/changes has a complete baseline.
    meetings/changes/  — GET: read-only group-wide change summary (admin only). Diffs the
                         current schedule against publishedSnapshot (future-only) for every
                         assigned-or-previously-snapshotted name; returns
                         { text, addedCount, removedCount, hasBaseline }. Sends nothing,
                         saves nothing. Powers the 複製更新文字 export-menu item.
    line/webhook/      — POST: LINE Messaging API webhook; two-step registration flow
                         (congregation name → person name) + user commands (see below)
  data/
    index.js           — seed/demo data: midweekWeeks, weekendData, peopleData,
                         overviewData, POOL, CATS
                         CATS is used by AssignSheet; POOL is seed-only demo data.
                         All names in demo data are fictional — no real congregation
                         member names are hardcoded in app code.
  lib/
    db.js              — Prisma singleton (PrismaClient, reused across hot reloads)
    firebase-client.js — Firebase client SDK (auth, googleProvider)
    firebase-admin.js  — Firebase Admin SDK (lazy init, verifyIdToken helper);
                         credentials from FIREBASE_SERVICE_ACCOUNT JSON blob
    auth-context.js    — AuthProvider + useAuth() hook + getToken() helper
    epubParser.js      — client-side EPUB parser; exports parseEpub(file) → week[]
    midweekExport.js   — JPG/Excel/PDF/text export. `jpegImagesToPdfBlob()` builds
                         a multi-page PDF entirely in-browser (baseline-JPEG embed via
                         DCTDecode) — each page is sized to its image's aspect ratio so the
                         card fills the page edge-to-edge (no A4 letterbox), no print dialog;
                         `buildWeekText()` = plain-text week schedule for pasting into LINE;
                         `triggerDownload()` = blob → download anchor; `downloadWeekXlsx` /
                         `exportWeeksXlsx` = Excel (single / multi-week). Multi-week visual
                         exports are DOM-screenshot based: `exportNodes{Jpeg,Pdf}` +
                         `openNodesPrintWindow` take rendered MidweekWeek card nodes and
                         capture them via html-to-image, so the output matches the live card
                         exactly. (The old hand-drawn `renderWeekToCanvas` exporters were
                         removed — they had drifted from the real card; see "What NOT to do".)
    suggest.js         — pure recency-scoring suggestion engine (no DB, no fetch);
                         exports suggestWeekendRow(people, pastRows, existing) and
                         suggestMidweekWeek(people, week, existingAssignments, pastHistory)
    icalExport.js      — pure iCal (.ics) generator; exports generateIcal(assignments,
                         personName, congCode) → RFC-5545 string and downloadIcal(str, filename)
    assignments.mjs    — pure, DB-free date + assignment helpers shared by line/webhook,
                         meetings/publish, meetings/changes (parseCnDate, collectAssignments,
                         collectAssignedNames, itemKey, diffChanges, buildChangesText).
                         `.mjs` so Node can unit-test it (assignments.test.mjs / `npm test`)
  components/
    Sidebar.js         — desktop left nav (shows congregation name + scheduleStats vacancy card)
    TopBar.js          — mobile top bar
    TabBar.js          — mobile bottom tab bar (5 items: grid-template-columns: repeat(5, 1fr))
    MeetingsPage.js    — midweek/weekend tab switcher; both tabs share same toolbar
                         pattern (edit toggle, add row, 發布通知); export menu on midweek only
                         (匯出 JPG / 複製圖片 / 複製文字 / 複製更新文字 / 匯出 Excel / 下載 PDF
                         — PDF downloads silently, no print popup; 複製更新文字 fetches
                         GET /api/meetings/changes and copies the group-wide diff since last
                         發布); ✦ suggest button in midweek navstrip + weekend per-row; batch
                         接受全部/清除建議 toolbar buttons when ghost suggestions exist
    MidweekWeek.js     — single midweek week card (WhoSlot / PairSlot); WhoSlot renders
                         ghost pill when getSuggestion(slotId) returns a name;
                         `isPair` driven by `roleLabel?.includes('/')` (NOT assign.length)
                         so ministry (學生/助手) and CBS (主持/朗讀) always show two slots
                         even when both are empty; PairSlot accepts `roleLabels` prop to
                         label each slot correctly; edit mode shows a `pair-toggle-btn`
                         (＋/−) per pair-capable part to add/remove the helper slot —
                         removing calls `clearSlot` (from page.js via MeetingsPage) to
                         clear the _1 assignment; `hiddenHelpers` Set in local state
                         tracks which parts show single slot (resets on week change)
    WeekendView.js     — weekend schedule table/cards; filter chips (未來/本月/半年/全部)
                         + year selector (auto-shown when multiple years present);
                         slot IDs use r._id (DB row id) not array index;
                         editMode prop enables inline editing of all text fields + row
                         type toggle (schedule/special/event/suspended) + ✦ suggest + delete;
                         NamePill renders ghost pill for unconfirmed suggestions;
                         ＋ 新增安排 / ＋ 新增事項 live at the BOTTOM as a `<tfoot>` row
                         (desktop) and dashed card (mobile) — NOT in the toolbar; new
                         rows auto-scroll into view via `bottomRef` + useEffect on
                         `weekendRows.length`
    OverviewPage.js    — overview list with sort (最近/最緊迫/最早), past-items toggle
                         (hidden by default), swipe/button dismiss with undo toast + reset
    PeoplePage.js      — congregation member list; 近期指派 shows 3 most-recent by default
                         with expand button for full history; detail panel is sticky +
                         scrollable on desktop. On mobile (useIsMobile via matchMedia) the
                         detail renders INLINE directly under the selected person's card,
                         not at the page bottom. Selection toggles: click a card to open,
                         click the same card again to deselect (selectedPerson has NO
                         auto-fallback — "nothing selected" is a real state that hides the
                         detail). When nothing is selected the list recenters via the
                         `.people-layout--solo` modifier (animated grid-template-columns).
                         Writes are serialized through a promise chain and the optimistic
                         local state is authoritative (server PATCH response is NOT applied —
                         see "What NOT to do"); delete button; "↓ iCal (N)" export button in
                         未來安排 section
    ImportPage.js      — EPUB import + congregation schedule settings; the 匯出與分享 cards
                         are wired (JPG/Excel/PDF/列印) and scoped by a 範圍 selector
                         (全部 / 本月 / 自訂 month-day range); needs `getAssign` prop so
                         exports reflect current assignments. JPG/PDF/列印 render the
                         selected weeks as REAL MidweekWeek cards in an off-screen container
                         (cardRefs) and screenshot them via the `exportNodes*` helpers, so
                         output matches the live card (Excel still uses the data path)
    SettingsPage.js    — ⚙ congregation info, invite link, members, schedule
    AssignSheet.js     — bottom-sheet candidate picker; uses real `people` state (not seed
                         data); "✕ 留空此項" button clears a slot (leaves it unassigned)
    PWARegister.js     — 'use client' component; registers /sw.js on window load
    Toast.js           — undo toast notification
prisma/
  schema.prisma        — Prisma schema (Congregation, User, MidweekWeek, Part,
                         Assignment, WeekendRow, Person, LinePendingLink)
                         binaryTargets = ["native", "linux-musl-openssl-3.0.x"]
                         required for Alpine-based Docker image on fly.io
scripts/
  import-people.mjs    — one-time: upsert congregation members from historical data
                         (node --env-file=.env scripts/import-people.mjs)
  import-assignments.mjs — one-time: upsert midweek assignments from historical schedule
                         (node --env-file=.env scripts/import-assignments.mjs)
  import-weekend.mjs   — one-time: clear + re-import weekend schedule rows
                         (node --env-file=.env scripts/import-weekend.mjs)
  merge-person.mjs     — one-time: rename/merge a person record + update all assignments
                         (node --env-file=.env scripts/merge-person.mjs)
  split-chairman-qual.mjs — one-time (idempotent): migrate legacy 主席 tag to the
                         three split quals (傳道與生活主席 / 週末聚會主席 / 守望台主持人)
                         (node --env-file=.env scripts/split-chairman-qual.mjs)
Dockerfile             — multi-stage build: deps → builder (prisma generate + next build) → runner
fly.toml               — fly.io config: primary_region=ams, internal_port=3000,
                         NEXT_PUBLIC_* build args. NO release_command — `prisma
                         db push` timed out on Neon cold-start; run it manually
public/
  sw.js                — PWA service worker (network-first; never caches /api/);
                         registered by components/PWARegister.js
  jwschedulerlogo.png  — app icon (used by manifest + favicon)
sample/
  mwb_CH_202609.epub   — sample EPUB for local dev/testing
```

---

## Auth & multi-tenancy

Every user belongs to one `Congregation`. The flow:

1. Not logged in → `/login` (Firebase email/password or Google popup)
2. Logged in, no congregation → Onboarding screen (create or join)
3. Logged in, has congregation → Main app

**`AuthProvider`** (in `layout.js`) listens to `onAuthStateChanged`, calls `POST /api/auth/sync` on every login to upsert the User row in Postgres, and exposes `{ firebaseUser, dbUser, setDbUser, dbSyncing, syncError }` via `useAuth()`. `dbSyncing` is true while the sync request is in flight; `syncError` holds the message if it fails. `page.js` gates on these: spinner while `dbSyncing`, error screen on `syncError` — so a backend failure never renders an empty shell.

**Login → app navigation:** the login page (`/login`) does not navigate on its own success callback. It watches `useAuth().firebaseUser` in an effect and `router.replace('/')` once set. Without this, a successful login leaves the user stuck on `/login` ("bounced back to login").

**Google sign-in uses `signInWithPopup`, not `signInWithRedirect`.** Because `authDomain` (`*.firebaseapp.com`) differs from the app origin (`*.fly.dev`), redirect relies on third-party cookies that browsers block, so it silently fails. Popup logs benign `Cross-Origin-Opener-Policy ... window.closed` warnings (Google's pages set strict COOP) but completes via a postMessage fallback — those warnings are noise, not the failure.

**`getToken()`** — async helper that returns the current Firebase ID token. Used in every API call: `headers: { Authorization: 'Bearer <token>' }`.

**Roles:** `ADMIN` (full access + settings) or `MEMBER` (assign only). First user to create a congregation is ADMIN.

**Invite link:** `{origin}/join/{inviteToken}` — clicking joins the congregation after login.

**All data API routes are congregation-scoped** — every route verifies `user.congregationId` from the Firebase token and constrains all DB queries to that congregation. The LINE webhook is the only unauthenticated route; it scopes name lookups to the congregation chosen during the two-step registration flow.

---

## Prisma schema (key models)

| Model | Key fields |
|---|---|
| `Congregation` | `name`, `code` (unique slug), `inviteToken` (UUID), `meetingDayOffset`, `meetingTime`, `exceptions` (JSON), `publishedSnapshot` (JSON — future-only assignments per person, for diff) |
| `User` | `firebaseUid`, `email`, `displayName`, `role` (ADMIN/MEMBER), `congregationId` |
| `MidweekWeek` | `congregationId`, `date`, `dateLabel`, `weekStart` (original EPUB Monday date), `weekdayPill`, songs, times |
| `Part` | `weekId`, `partKey`, `section`, `partNum`, `title`, `dur`, `cat`, `roleLabel`, `cbsRef` |
| `Assignment` | `slotId` (unique string key), `weekId`, `name` |
| `WeekendRow` | `congregationId`, `sortOrder`, `date`, `type`, `no`, `topic`, `cong`, `speaker`, `chair`, `wt`, `read`, `host`, `away`, `label`, `note` |
| `Person` | `congregationId`, `name`, `gender`, `appointment`, `tags[]`, `status`, `lineUserId` (nullable — opt-in LINE notifications) |
| `LinePendingLink` | `lineUserId` (PK), `congregationId` — stores mid-flow state during two-step LINE registration; deleted once linking completes |

All API routes export `dynamic = 'force-dynamic'` to prevent Next.js build-time execution.

---

## State (all in `app/page.js`)

| State | Type | Purpose |
|---|---|---|
| `page` | string | active nav page (`meetings` / `overview` / `people` / `import` / `settings`) |
| `view` | string | meetings sub-tab (`midweek` / `weekend`) |
| `week` | number | index into `midweekWeeks` — auto-set to current week on load/import |
| `midweekWeeks` | array | week objects — loaded from DB on mount, updated on EPUB import |
| `weekendRows` | array | weekend schedule rows — loaded from DB on mount |
| `people` | array | congregation members — loaded from DB on mount; passed to AssignSheet |
| `congSettings` | object | `{ dayOffset, time, exceptions[] }` — persisted to localStorage; loaded from DB on settings page |
| `editMode` | boolean | toggles inline contentEditable on WhoSlots |
| `assignments` | `{[slotId]: name}` | overrides for all slots |
| `sheet` | object\|null | open AssignSheet config |
| `toast` | object\|null | undo toast |
| `scheduleStats` | object\|null | derived (not state) — vacancy summary passed to Sidebar; `null` when no weeks loaded |

**`scheduleStats`** is computed inline (IIFE) from `midweekWeeks`, `week`, `assignments`, and `congSettings`. It slices `midweekWeeks` from the current week index to the end and counts empty primary-assignment slots: `chairman`, `openPrayer`, `closePrayer`, and each part's `_0` slot. Shape: `{ weekCount, nextDate, meetingTime, vacancies, upcomingWeeks }`.

**Congregation settings** live in two places: `localStorage` (fast, offline) and the `Congregation` DB row (authoritative). The ⚙ Settings page syncs them: loading reads from DB and updates local state; saving PATCHes the API.

---

## Congregation schedule settings

`congSettings.dayOffset` — days after Monday (EPUB always gives Monday dates):
- 0 = 星期一, 1 = 星期二, 2 = 星期三 (default), 3 = 星期四, etc.

`congSettings.exceptions[]` — override for a date range:
```js
{ id, fromMonth, fromDay, toMonth, toDay, dayOffset, time }
```

`getEffectiveSchedule(weekStart, congSettings)` — checks exceptions first, falls back to default.

`shiftDate(dateStr, offsetDays)` — adds N days to a Chinese date string using JS Date (handles month boundaries).

`parseChineseDate(dateStr)` — parses a Chinese date string to a JS `Date`, adjusting year for Dec/Jan boundary.

`findCurrentWeekIndex(weeks)` — returns the index of the week containing today (Mon–Sun). Falls back to the last week that started before today. Called on DB load, EPUB import, and seed reset so the picker always opens on the current week.

On EPUB import, each week's `date` is computed as `shiftDate(w.date, schedule.dayOffset)` and `weekStart` stores the original Monday date. "重新套用至所有週次" recomputes all imported weeks' dates from `weekStart`.

---

## Slot ID convention

```
mw{weekId}_{section}      e.g. mw42_chairman, mw42_openPrayer
mw{weekId}_{partId}_0     e.g. mw42_t0_0  (single-person or student)
mw{weekId}_{partId}_1     e.g. mw42_m0_1  (helper of a pair)

we{rowId}_{field}         e.g. we7_speaker, we7_chair, we7_wt, we7_read
```

Midweek week prefix = `slotId.split('_')[0]` — used to detect same-week assignments.

Weekend slots use the WeekendRow DB `id` (not array index) so `persistAssignment` can extract the row id and route to `PATCH /api/weekend-rows/[id]`.

---

## Data layer (`app/data/index.js`)

Seed/demo data only — not shown to new congregations by default. Accessible via "重置為示範資料" on the import page. **All names in this file are fictional** — real congregation member names must never be hardcoded in app code; they live only in the DB.

**`POOL`** — hardcoded demo members (used only by seed data reset, not by AssignSheet).

**`CATS`** — `catKey` → `{ tag, g, name }` mapping. This **is** used in production by `AssignSheet.js`. Tags must match `QUAL_OPTIONS` in `PeoplePage.js` exactly:

```js
export const CATS = {
  chairman:    { tag: "傳道與生活主席", g: "M",   name: "傳道與生活主席" },
  prayer:      { tag: "禱告",          g: "M",   name: "禱告" },
  treasures:   { tag: "寶藏演講",      g: "M",   name: "寶藏演講" },
  gems:        { tag: "經文寶石",      g: "M",   name: "經文寶石" },
  reading:     { tag: "經文朗讀",      g: "M",   name: "經文朗讀（學生）" },
  ministry:    { tag: "傳道示範",      g: "any", name: "傳道訓練" },
  living:      { tag: "生活演講",      g: "M",   name: "生活演講" },
  cbs:         { tag: "研經班主持",    g: "M",   name: "會眾研經班主持" },
  cbsread:     { tag: "研經班朗讀",    g: "M",   name: "研經班朗讀" },
  publictalk:  { tag: "公眾演講",      g: "M",   name: "公眾演講 講者" },
  weekendchair:{ tag: "週末聚會主席",  g: "M",   name: "週末聚會主席" },
  wt:          { tag: "守望台主持人",  g: "M",   name: "守望台主持" },
  wtread:      { tag: "守望台朗讀",    g: "M",   name: "守望台朗讀" },
};
```

The old single `主席` qualification was split into three distinct quals/cats:
`傳道與生活主席` (`chairman` cat — midweek chairman), `週末聚會主席`
(`weekendchair` cat — weekend `chair` field), and `守望台主持人` (`wt` cat —
weekend `wt` field). Previously weekend chair and WT conductor both used the
`wt` cat with tag `主席` and shared one candidate pool. Migration:
`scripts/split-chairman-qual.mjs` (one-time, idempotent) — gave every member
tagged `主席` all three new tags and removed the legacy tag.

QUAL_OPTIONS in PeoplePage.js: `傳道與生活主席`, `週末聚會主席`, `守望台主持人`, `禱告`, `寶藏演講`, `經文寶石`, `經文朗讀`, `傳道示範`, `助手`, `生活演講`, `研經班主持`, `研經班朗讀`, `守望台朗讀`, `公眾演講`.

職務 (appt) options for brothers (M): `分區監督`, `長老`, `助理僕人`, `傳道員`, `未受浸傳道員`. For sisters (F): `傳道員`, `未受浸傳道員`.

`AssignSheet` builds candidates from the live `people` state (loaded from DB), not from `POOL`.

**`people` shape** (from `/api/congregations/data`):
```js
{ id, name, g: "M"|"F", appt: "長老"|"助理僕人"|"傳道員"|"", quals: ["tag1",...], status: "active"|"inactive", lineUserId: "" }
```

---

## Design system (CSS tokens)

```css
--bg:          #ecebe7   /* page background */
--surface:     #ffffff   /* card background */
--surface-2:   #f7f6f3   /* subtle fills */
--line:        #e3e1db   /* borders */
--ink:         #211f1c   /* primary text */
--ink-2:       #57534d   /* secondary text */
--ink-3:       #8c877f   /* muted text */
--accent:      #2f6f8f   /* interactive / recommended */
--accent-soft: #e7f0f3
--special:     #c23123   /* warnings / errors */

--treasures: #6f6f6f  --ministry: #b58a08  --living: #8c2b22
```

Button variants: `.btn--primary`, `.btn--ghost`, `.btn--danger`, `.btn--sm`, `.btn--notify`

---

## Export (JPG / PDF / Excel / Text)

**Meetings page (current week)** — JPG, copy and PDF screenshot the live `article.card`
DOM element (`cardRef` passed into `MidweekWeek`) via `html-to-image`, so the export matches
exactly what's on screen:

- **JPG** — `toJpeg(cardRef.current, { quality: 0.95, pixelRatio: 2 })` → download
- **複製圖片** — `toPng` → `ClipboardItem`
- **複製文字** — `buildWeekText(week, getAssign)` → `navigator.clipboard.writeText` (plain-text
  schedule for manually pasting into a LINE group)
- **複製更新文字** — GET `/api/meetings/changes` → copies the group-wide change summary since
  the last 發布 (新增/取消 per name). Read-only; sends nothing, changes no snapshot.
- **下載 PDF** — `toJpeg` → `jpegDataUrlToImage` → `jpegImagesToPdfBlob([img])` → `triggerDownload`.
  Built entirely client-side and downloaded directly — **no print dialog/popup** (browsers block
  those). Each PDF page is sized to the image's aspect ratio (no A4 letterbox). Do not reintroduce
  the `window.open(...).print()` flow.
- **Excel** — custom `buildXlsxBuffer()` in `midweekExport.js` (JSZip)

**Import/匯出 page (multi-week, range-scoped)** — the 匯出與分享 cards call `exportNodesJpeg`
(single → JPG, many → zip), `exportWeeksXlsx` (one workbook, weeks concatenated), `exportNodesPdf`
(one PDF page per week), and `openNodesPrintWindow`. The visual exporters screenshot REAL
MidweekWeek cards rendered off-screen (cardRefs) via `html-to-image`, so they match the live card
exactly — they do NOT hand-redraw on canvas (the old `renderWeekToCanvas` path was removed). Excel
still uses the `formatRowsForExcel` data path. The 範圍 selector (全部/本月/自訂) filters
`existingWeeks` by parsed Chinese date before exporting.

---

## LINE Messaging API (Phase 3)

Env vars required: `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`. Disable auto-reply in LINE Official Account Manager (prevents duplicate messages when webhook replies).

### Registration flow (two-step, multi-congregation safe)

1. **Follow event** → bot replies asking for congregation name
2. **User sends congregation name** (e.g. "新屋") → lookup priority: exact → starts-with → contains. If one match: save `LinePendingLink` row and ask for person name. If multiple: list all with codes and ask to be more specific or enter a code directly.
3. **User sends person name** → look up within pending congregation → link `Person.lineUserId` → delete `LinePendingLink`

Name lookup is always scoped to the selected congregation — no cross-congregation collision. `LinePendingLink` is deleted on successful link.

### User commands (after linking)

| Message | Action |
|---|---|
| `我的安排` / `查詢安排` / `安排查詢` / `節目查詢` | Returns all upcoming assignments (midweek + weekend) sorted by date |
| `說明` / `幫助` / `指令` / `help` / `?` / `？` | Shows command list |
| Anything else | Reminds user they are linked and shows available commands |

Unlinked users who send `說明`/`help` etc. receive registration instructions instead of the linked help text.

### Shared assignment/date logic (`app/lib/assignments.mjs`)

`line/webhook`, `meetings/publish`, and `meetings/changes` all import their date + assignment
helpers from one pure, DB-free module — `parseCnDate`, `collectAssignments`, `collectAssignedNames`,
`itemKey`, `diffChanges`, `buildChangesText`. (These were previously copy-pasted into each route,
which let the role-label format drift; the changes route had the old format and would have flagged
unchanged assignments as changed.) The module is `.mjs` so it's importable by both Next and Node.
`now`/`today` are injectable for deterministic tests.

`parseCnDate()` handles:
- Chinese format: `"6月 3日"`
- Slash format: `"8/9"` (used by weekend rows)

Year is inferred relative to today with a ±6-month window to handle year boundaries.
`collectAssignments` skips both `event` and `suspended` weekend rows and tags roles with their
role label (學生/助手/主持/朗讀) + CBS textbook reference.

### Tests

`npm test` runs `node --test` (Node's built-in runner, no extra deps). `app/lib/assignments.test.mjs`
covers the individual LINE query (`collectAssignments`), the group-wide diff (`diffChanges` /
`buildChangesText`), date parsing, and wiring checks (複製更新文字 menu option + webhook query).

### Publish diff logic

`POST /api/meetings/publish` (admin only):
- `collectAssignments(name, weeks, weekendRows)` — includes both midweek and weekend rows, only dates ≥ today
- Compares `current` vs `prevSnapshot[name]` filtered to future dates only (prevents "false cancellation" notifications when a past meeting date rolls over between two publishes)
- First publish (`snapshot = null`): sends full upcoming list
- Subsequent: sends only ✚ added / ✖ removed items; skips if no change
- Saves new snapshot after sending. LINE messages go ONLY to linked active people, but the saved
  snapshot covers EVERY assigned name (`collectAssignedNames` fills the rest) so the read-only
  `GET /api/meetings/changes` group-wide diff has a complete baseline for non-LINE members too

### Group-wide change summary (複製更新文字)

`GET /api/meetings/changes` (admin only) — read-only sibling of publish. Reuses the same
`parseCnDate` / `collectAssignments` / `itemKey` logic to diff the current schedule against
`publishedSnapshot` (future-only) for every name in the current schedule OR the snapshot, then
returns `{ text, addedCount, removedCount, hasBaseline }`. Sends no LINE messages and does NOT
write a new snapshot, so it can be run any time without affecting publish state. The
複製更新文字 export-menu item copies `text` for pasting into a LINE group.

### Role labelling in notifications

Both `line/webhook` and `meetings/publish` use `part.roleLabel` when formatting assignment role strings:

```js
const rls = part.roleLabel?.split('/') ?? [];  // e.g. ['學生','助手'] or ['主持','朗讀']
const base = part.cbsRef ? `${part.title}（${part.cbsRef}）` : part.title;
// _0 slot: append (學生) / (主持) / nothing if no roleLabel
// _1 slot: append (助手) / (朗讀) / (助手) fallback
```

- CBS assignments include the textbook reference: `會眾研經班（利未記 第1-7章）（主持）`
- Reading/student parts show `（學生）`; helper slots show `（助手）` or the second roleLabel token
- This matches the `PairSlot` labels shown in the UI

---

## What NOT to do

- Do not scrape jw.org / wol.jw.org (robots-disallowed, ToS prohibits)
- Do not auto-commit EPUB imports — always go through the review screen first
- Do not remove `'use client'` from `page.js` — it owns all interactive state
- Do not call `new PrismaClient()` without `datasourceUrl` or outside `db.js` — always import the singleton
- Do not initialize Firebase Admin SDK at module load time — `firebase-admin.js` uses lazy init inside `verifyIdToken()` to avoid build-time crashes
- Do not feed the Admin SDK a private key from a standalone `FIREBASE_PRIVATE_KEY` env var — shells/secret stores mangle its `\n` newlines and `cert()` throws `error:1E08010C:DECODER routines::unsupported`. Use the full `FIREBASE_SERVICE_ACCOUNT` JSON blob (its `\n` are decoded correctly by `JSON.parse`). `loadServiceAccount()` still normalizes `\n` defensively
- Do not switch Google sign-in to `signInWithRedirect` — it needs third-party cookies that fail cross-domain (fly.dev app + firebaseapp.com authDomain). Keep `signInWithPopup`; the COOP `window.closed` console warnings it emits are benign
- Do not remove the `firebaseUser` → `router.replace('/')` effect from `login/page.js` — without it a successful login never leaves `/login`
- Do not add `url = env(...)` to `prisma/schema.prisma` datasource — Prisma 6 reads from env automatically; Prisma 7 broke this and we downgraded
- Do not remove `binaryTargets` from the Prisma generator — the fly.io runner uses Alpine (musl libc); without `linux-musl-openssl-3.0.x` all API routes crash at runtime
- Do not run `prisma migrate deploy` as the release command — no migration files exist; use `prisma db push` instead
- Do not rely on `prisma db push` as a fly.io `release_command` — Neon free-tier auto-suspend makes the release machine time out connecting, which aborts the whole deploy. The release command was removed; run `fly ssh console -C "npx prisma db push"` manually after a schema change
- `NEXT_PUBLIC_*` Firebase vars must be in `fly.toml [build.args]` — they are baked in at build time and are not available from fly.io secrets at runtime
- Do not use array index (`i`) for weekend slot IDs — always use `r._id` (DB row id) so `persistAssignment` can route to `PATCH /api/weekend-rows/[id]`
- Do not add real congregation member names to `app/data/index.js` — all demo/seed data must use fictional names; real data lives only in the DB
- Do not overwrite `displayName` in `/api/auth/sync` update block — only set it on `create`. The settings page (`PATCH /api/users/me`) is the authoritative way to change display names
- Do not apply the `PATCH /api/people/[id]` response back into local `people` state in `PeoplePage`. Rapid edits (e.g. toggling several quals quickly) fire overlapping PATCHes; an out-of-order/stale response would clobber newer optimistic state, making quals appear to "deselect on their own". Writes are serialized through a promise chain (`writeChainRef`) and the optimistic state is authoritative
- Do not bring back the `window.open(...).print()` popup for PDF export — browsers block it. PDF is generated client-side with `jpegImagesToPdfBlob` and downloaded directly
- Do not re-add a hand-drawn canvas renderer (`renderWeekToCanvas`) for the 匯出 page exports — it drifted from the real card (invented `週次資訊`/`會眾項目` bands, wrong section colours/blue accents). JPG/PDF/列印 must screenshot REAL off-screen `MidweekWeek` cards via `exportNodes{Jpeg,Pdf}` / `openNodesPrintWindow` so the output always matches the live card
- Do not re-add an auto-fallback to `selectedPerson` in `PeoplePage` (e.g. `?? filteredPeople[0]`) — "nothing selected" must stay a real state so clicking a selected card can deselect/hide the detail and the list recenters (`.people-layout--solo`)
- Do not move ＋ 新增安排 / ＋ 新增事項 back into the weekend toolbar — they belong at the bottom of the table (`<tfoot>`) and mobile card list so users can add rows without scrolling to the top
- Do not use `assign.length === 2` to determine `isPair` in `PartRow` — use `roleLabel?.includes('/')`. The assign array collapses to `[]` when no assignments exist (filter strips empty strings), which would incorrectly show only one slot for ministry/CBS parts
- Do not filter out empty strings in `mapPart` for parts where `roleLabel?.includes('/')` — those parts must always return `[s0, s1]` (with `''` for unassigned) so the helper slot is always visible

---

## Phase status

| Phase | Status |
|---|---|
| **Phase 1 — Frontend UI** | Done — full design system, all views, AssignSheet, EPUB import, week picker, export (JPG/PDF/Excel) |
| **Phase 2 — Auth + Multi-tenancy** | Done — Firebase auth, congregation model, invite links, ⚙ settings page, Prisma 6 + Neon Postgres schema live |
| **Phase 2B — Data persistence** | Done — midweek assignments persist via `POST /api/assignments`; week/part edits persist via `PATCH /api/midweek-weeks/[id]` (saves week fields + all parts in one transaction when edit mode is toggled off); delete week via `DELETE /api/midweek-weeks/[id]` (admin only); weekend rows: create via `POST /api/weekend-rows`, field edits via `PATCH /api/weekend-rows/[id]`, delete via `DELETE /api/weekend-rows/[id]`; all load on mount |
| **Phase 2C — Deployment** | Done — live at https://jwscheduler.fly.dev/ on fly.io (Amsterdam). Dockerfile + fly.toml committed. No release command (Neon cold-start timed it out); `prisma db push` run manually. Admin SDK creds via `FIREBASE_SERVICE_ACCOUNT` secret. |
| **Phase 3 — Notifications** | Done — LINE Messaging API integrated. Two-step registration (congregation name → person name) with multi-congregation safety. `LinePendingLink` table tracks mid-flow state. Webhook at `/api/line/webhook`; publish at `/api/meetings/publish` with future-only diff logic covering both midweek and weekend rows. User commands: `我的安排` (query), `說明` (help). Env vars: `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`. |
| **Phase 3B — Weekend edit mode** | Done — weekend view has a full matching toolbar (edit toggle, 發布通知). Add-row buttons (＋ 新增安排 / ＋ 新增事項) are in the table footer and mobile card list, not the toolbar. Edit mode: inline inputs for all text fields, type toggle chips (正常/特別/暫停) for row colour coding (special=red schedule row, suspended=red event row), delete buttons. All changes persist to DB. |
| **Phase 4 — Suggestions** | Done — recency-scoring algorithm in `app/lib/suggest.js` (no AI). Ghost pills (dashed blue border, italic) for unconfirmed suggestions. ✦ button in midweek navstrip fills all empty slots; ✦ button per weekend row fills speaker/chair/wt/read. 接受全部/清除建議 toolbar batch actions. Ghosts clear on edit-mode exit and week navigation. Part-ID bug fix (p.dbId not p.id). Weekend row default date = last row + 7 days. |
| **Phase 5 — iCal Export** | Done — `app/lib/icalExport.js` generates RFC-5545 `.ics` (Taiwan UTC+8, stable UIDs, 1h45m events). "↓ iCal (N)" button in PeoplePage 未來安排 section downloads `{name}-schedule.ics` for import into Outlook/Google Calendar/Apple Calendar. |
| **Phase 6 — PWA + UX polish** | Done — installable PWA (`app/manifest.js` + `public/sw.js` network-first worker + `PWARegister`, themeColor/apple-web-app meta in `layout.js`). Plus: clear/留空 button in AssignSheet; serialized people writes (quals no longer self-deselect); mobile people detail renders inline under the tapped card; mobile row dot+partnum no longer squished; silent client-side PDF + 複製文字 in meetings export menu; wired ImportPage 匯出 cards with 全部/本月/自訂 range. Ministry/CBS parts always show two assignment slots (student + helper) with correct role labels; edit-mode ＋/− toggle to add/remove helper slot per part; LINE notifications include role labels (學生/助手/主持/朗讀) and CBS textbook references. 匯出 page JPG/PDF/列印 now screenshot real off-screen MidweekWeek cards (`exportNodes*`) instead of the removed hand-drawn canvas; PDF pages sized to the card; 複製更新文字 export item (`GET /api/meetings/changes`) copies the group-wide diff since last 發布; PeoplePage cards toggle-to-deselect with an animated recenter when nothing is selected. |
