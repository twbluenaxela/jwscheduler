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
- **Deploy target:** fly.io (Phase 3+)

---

## Project structure

```
app/
  page.js              — root component; auth gating + all shared state
  layout.js            — AuthProvider wrapper, font loading, html/body
  globals.css          — full design system (tokens, all component styles)
  login/
    page.js            — Firebase login UI (email/password + Google)
  join/[token]/
    page.js            — Invite link handler (joins congregation via token)
  api/
    auth/sync/         — POST: upsert Firebase user into Postgres
    congregations/     — POST: create congregation (caller becomes ADMIN)
    congregations/join/— POST: join via inviteToken
    congregations/settings/ — GET/PATCH: congregation settings (admin only)
    congregations/data/— GET: load all congregation data (weeks, people, weekend rows)
    midweek-weeks/import/ — POST: save imported weeks + parts to DB
    people/            — GET: list members, POST: create member
    people/[id]/       — PATCH: update member
    users/me/          — PATCH: update current user's displayName
  data/
    index.js           — seed/demo data: midweekWeeks, weekendData, peopleData,
                         overviewData, POOL, CATS
                         CATS is used by AssignSheet; POOL is seed-only demo data
  lib/
    db.js              — Prisma singleton (PrismaClient, reused across hot reloads)
    firebase-client.js — Firebase client SDK (auth, googleProvider)
    firebase-admin.js  — Firebase Admin SDK (lazy init, verifyIdToken helper)
    auth-context.js    — AuthProvider + useAuth() hook + getToken() helper
    epubParser.js      — client-side EPUB parser; exports parseEpub(file) → week[]
    midweekExport.js   — JPG/Excel/print export functions
  components/
    Sidebar.js         — desktop left nav (shows congregation name + scheduleStats vacancy card)
    TopBar.js          — mobile top bar
    TabBar.js          — mobile bottom tab bar
    MeetingsPage.js    — midweek/weekend tab switcher + export menu
    MidweekWeek.js     — single midweek week card (WhoSlot / PairSlot)
    WeekendView.js     — weekend schedule table
    OverviewPage.js    — month overview list
    PeoplePage.js      — congregation member list; name input uses local state + onBlur to avoid race conditions on every-keystroke API calls
    ImportPage.js      — EPUB import + congregation schedule settings
    SettingsPage.js    — ⚙ congregation info, invite link, members, schedule
    AssignSheet.js     — bottom-sheet candidate picker; uses real `people` state (not seed data)
    Toast.js           — undo toast notification
prisma/
  schema.prisma        — Prisma schema (Congregation, User, MidweekWeek, Part,
                         Assignment, WeekendRow, Person)
sample/
  mwb_CH_202609.epub   — sample EPUB for local dev/testing
```

---

## Auth & multi-tenancy

Every user belongs to one `Congregation`. The flow:

1. Not logged in → `/login` (Firebase email/password or Google)
2. Logged in, no congregation → Onboarding screen (create or join)
3. Logged in, has congregation → Main app

**`AuthProvider`** (in `layout.js`) listens to `onAuthStateChanged`, calls `POST /api/auth/sync` on every login to upsert the User row in Postgres, and exposes `{ firebaseUser, dbUser, setDbUser }` via `useAuth()`.

**`getToken()`** — async helper that returns the current Firebase ID token. Used in every API call: `headers: { Authorization: 'Bearer <token>' }`.

**Roles:** `ADMIN` (full access + settings) or `MEMBER` (assign only). First user to create a congregation is ADMIN.

**Invite link:** `{origin}/join/{inviteToken}` — clicking joins the congregation after login.

---

## Prisma schema (key models)

| Model | Key fields |
|---|---|
| `Congregation` | `name`, `code` (unique slug), `inviteToken` (UUID), `meetingDayOffset`, `meetingTime`, `exceptions` (JSON) |
| `User` | `firebaseUid`, `email`, `displayName`, `role` (ADMIN/MEMBER), `congregationId` |
| `MidweekWeek` | `congregationId`, `date`, `dateLabel`, `weekStart` (original EPUB Monday date), `weekdayPill`, songs, times |
| `Part` | `weekId`, `partKey`, `section`, `partNum`, `title`, `dur`, `cat`, `roleLabel`, `cbsRef` |
| `Assignment` | `slotId` (unique string key), `weekId`, `name` |
| `WeekendRow` | `congregationId`, `date`, `type`, `speaker`, `chair`, `wt`, `read`, etc. |
| `Person` | `congregationId`, `name`, `gender`, `appointment`, `tags[]`, `status` |

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
mw{weekId}_{section}      e.g. mw0_chairman, mw0_openPrayer
mw{weekId}_{partId}_0     e.g. mw0_t0_0  (single-person or student)
mw{weekId}_{partId}_1     e.g. mw0_m0_1  (helper of a pair)
```

Week prefix = `slotId.split('_')[0]` — used to detect same-week assignments.

---

## Data layer (`app/data/index.js`)

Seed/demo data only — not shown to new congregations by default. Accessible via "重置為示範資料" on the import page.

**`POOL`** — hardcoded demo members (used only by seed data reset, not by AssignSheet).

**`CATS`** — `catKey` → `{ tag, g, name }` mapping. This **is** used in production by `AssignSheet.js` to know which `quals` tag and gender filter to apply for each slot type.

`AssignSheet` builds candidates from the live `people` state (loaded from DB), not from `POOL`. The `buildCandidates(people, catKey, jitter, spread)` function inside `AssignSheet.js` filters by `status !== 'inactive'`, matches `people[].quals` against `CATS[catKey].tag`, and weights by a hash-derived fairness score (days since last / load count — placeholder until real assignment history is tracked).

**`people` shape** (from `/api/congregations/data`):
```js
{ id, name, g: "M"|"F", appt: "長老"|"助理僕人"|"傳道員"|"", quals: ["tag1",...], status: "active"|"inactive" }
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

---

## Export (JPG / PDF / Excel)

JPG and PDF both use `html-to-image` to screenshot the live `article.card` DOM element (`cardRef` passed into `MidweekWeek`). This guarantees the export matches exactly what's on screen.

- **JPG** — `toJpeg(cardRef.current, { quality: 0.95, pixelRatio: 2 })` → download
- **Copy** — `toPng` → `ClipboardItem`
- **PDF** — `toPng` → embedded in a print window → browser "Save as PDF"
- **Excel** — custom `buildXlsxBuffer()` in `midweekExport.js` (JSZip)

---

## What NOT to do

- Do not scrape jw.org / wol.jw.org (robots-disallowed, ToS prohibits)
- Do not auto-commit EPUB imports — always go through the review screen first
- Do not remove `'use client'` from `page.js` — it owns all interactive state
- Do not call `new PrismaClient()` without `datasourceUrl` or outside `db.js` — always import the singleton
- Do not initialize Firebase Admin SDK at module load time — `firebase-admin.js` uses lazy init inside `verifyIdToken()` to avoid build-time crashes
- Do not add `url = env(...)` to `prisma/schema.prisma` datasource — Prisma 6 reads from env automatically; Prisma 7 broke this and we downgraded

---

## Phase status

| Phase | Status |
|---|---|
| **Phase 1 — Frontend UI** | Done — full design system, all views, AssignSheet, EPUB import, week picker, export (JPG/PDF/Excel) |
| **Phase 2 — Auth + Multi-tenancy** | Done — Firebase auth, congregation model, invite links, ⚙ settings page, Prisma 6 + Neon Postgres schema live |
| **Phase 2B — Data persistence** | In progress — `GET /api/congregations/data` loads weeks/people/weekend on mount; `POST /api/midweek-weeks/import` persists EPUB import; people CRUD via `/api/people`; congregation schedule settings (dayOffset, time, exceptions) persist via `PATCH /api/congregations/settings`; user displayName editable via `PATCH /api/users/me`. Remaining: save/load assignments from DB (still React state only), save inline week/part edits to DB, delete week API |
| **Phase 3 — Notifications** | Not started — LINE Messaging API push, .ics calendar feeds |
