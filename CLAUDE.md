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
  globals.css          — full design system (tokens, all component styles).
                         Breakpoints: ≤720px mobile (topbar+tabbar), 721–1080px
                         tablet (sidenav collapses to a 68px icon rail so iPad
                         portrait fits), plus height-based density tiers
                         (max-height 1150px / 820px) that compress the midweek
                         card so a full week fits an iPad screen with no scroll
  login/
    page.js            — Firebase login UI (email/password + Google popup);
                         redirects to / once useAuth().firebaseUser is set
  join/[token]/
    page.js            — Legacy invite-link handler (joins congregation via token → VIEWER).
                         Primary join is now the onboarding code-entry in page.js
  admin/
    page.js            — SYSADMIN-only control panel (separate route): create/rename/delete
                         congregations + list all users (set role + congregation, delete user).
                         Client-gated on dbUser.role==='SYSADMIN'; all writes hit app/api/admin/*
  api/
    auth/sync/         — POST: upsert Firebase user into Postgres (does NOT
                         overwrite displayName on update — only sets it on create)
    congregations/list/— GET: {id,name,code}[] for the onboarding dropdown (logged-in)
    congregations/join/— POST: { code } (enter congregation code → VIEWER) or { congregationId }
                         (dropdown) or { inviteToken } (legacy). 409 if already in a congregation
                         (congregation is set once; only SYSADMIN can move a user)
    congregations/settings/ — GET/PATCH: congregation settings (canManageCongregation = ADMIN/SYSADMIN)
    congregations/members/ — PATCH: set a member's role (ADMIN/VIEWER; not self) — ADMIN/SYSADMIN
    congregations/data/— GET: load all congregation data (weeks, people, weekend rows)
    admin/data/        — GET: all congregations (+counts) + all users (SYSADMIN only)
    admin/congregations/ — POST create; [id] PATCH rename / DELETE (cascade) (SYSADMIN only)
    admin/users/[id]/  — PATCH: set role + congregationId / DELETE: remove user (DB + Firebase
                         auth via deleteAuthUser); SYSADMIN only, not self
    midweek-weeks/import/ — POST: save imported weeks + parts to DB
    people/            — GET: list members, POST: create member
    people/[id]/       — PATCH: update member, DELETE: remove member
    users/me/          — PATCH: update current user's displayName
    assignments/       — POST: upsert/delete a single midweek assignment by slotId;
                         also writes a ChangeLog row (最近變更) via logChange
    midweek-weeks/[id]/— PATCH: update week fields + all parts in one transaction
                         (called on edit-mode exit); DELETE: remove week + cascade
    weekend-rows/      — POST: create a new WeekendRow (date defaults to last row + 7 days)
    weekend-rows/[id]/ — PATCH: update one or more fields on a WeekendRow (speaker,
                         chair, wt, read, host, away, topic, no, cong, note, label,
                         date, type); name-field changes also write a ChangeLog row
                         (最近變更); DELETE: remove a WeekendRow
    suggest/weekend-row/   — POST: suggest speaker/chair/wt/read for a new row
                             (recency-scoring algorithm, no AI)
    suggest/midweek-week/  — POST: suggest all empty slots in a week
                             body: { weekId, assignments: {[slotId]:name} }
    meetings/publish/  — POST: diff current vs publishedSnapshot (future weeks only),
                         push LINE messages for changed assignments (midweek + weekend),
                         save new snapshot (LINE-linked people only)
    changelog/         — GET: recent assignment changes for the caller's congregation
                         (newest first, take 100) — powers 總覽 ▸ 最近變更
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
                         `triggerDownload()` = blob → download anchor; `captureBox(node)` =
                         html-to-image size opts pinned to the node's real box (shared with
                         MeetingsPage and AssignmentHeatmap so captures don't drift); `downloadWeekXlsx` /
                         `exportWeeksXlsx` = Excel — the workbook itself now lives in
                         `midweekXlsxLayout.mjs` (re-exported here so import sites don't move).
                         `buildXlsxBuffer()` (now in `xlsx.mjs`) remains the plain builder used
                         by weekendExport.js. Multi-week visual
                         exports are DOM-screenshot based: `exportNodes{Jpeg,Pdf,PdfGrid}` +
                         `openNodesPrintWindow` take rendered MidweekWeek card nodes and
                         capture them via html-to-image, so the output matches the live card
                         exactly. (The old hand-drawn `renderWeekToCanvas` exporters were
                         removed — they had drifted from the real card; see "What NOT to do".)
                         `exportNodesPdfGrid(nodes, weeks, layout)` = the 版面 export: N week
                         cards per A4 page, geometry from `pdfLayout.mjs`, bytes from
                         `pdfWriter.mjs`
                         All download filenames carry the actual date range, not a generic
                         count: `getMidweekExportFilename(week, ext)` uses the week's label;
                         `getMultiWeekExportFilename(weeks, ext)` (xlsx/zip/pdf) joins the
                         first and last week's label with `~`, e.g.
                         `週中_9月7-13日~10月5-11日.xlsx`
    weekType.mjs       — THE definition of "this week's midweek meeting is cancelled".
                         `MIDWEEK_TYPES` (normal/special/assembly/suspended — `type` is a free
                         String column, so 'suspended' needed no migration),
                         `isMidweekSuspended(week)` (assembly OR suspended — 總覽 already
                         treated assembly that way), `suggestTypeFromLabel(label)` (a DEFAULT
                         for the chip, applied only while the week is still 一般; the admin's
                         chip always wins) and `suspendedNotice(week)`. The card, the Excel
                         exporter and the PDF exporter all import it, so a week that prints as
                         a notice is also skipped by both page packers
    xlsx.mjs           — low-level OOXML: `escapeXml`, `cellRef`, `zipXlsx`, `buildXlsxBuffer`
                         (the plain builder weekendExport/heatmapExport use). `.mjs` so the
                         styled workbook above it can be built and printed outside the browser
    midweekXlsxLayout.mjs — the styled midweek workbook: row building (`weekRows`), the row
                         HEIGHT model, page packing and the OOXML. Pure + `.mjs`, so
                         `node --test` pins the pagination and
                         `scripts/check-xlsx-pagination.mjs` prints it through LibreOffice.
                         `buildSheetPlan` packs TWO SCHEDULED weeks per page — always, whatever
                         the heights; a cancelled week collapses to a 2-row notice and does NOT
                         consume a slot. It measures every page and applies one workbook-wide
                         `rowScaleFor` squeeze so even a very long pair still shares the sheet
                         (`MIN_ROW_SCALE` is a backstop against corrupt data, not a preference).
                         `padRows` then fills every page but the last to within less than one
                         header row of the sheet height, so readers that ignore `<rowBreaks>`
                         (phone print dialogs, Google Sheets) break in the same places. Printed
                         at 100% with no fit-to-page — see "What NOT to do"
    pdfLayout.mjs      — geometry for the N-weeks-per-page PDF, shared by the picker's ghost
                         preview and the emitted PDF so they cannot disagree.
                         `normalizeLayout/setCount/addBox/removeBox` — **2×2 is the ceiling**
                         (`MAX_ROWS`/`MAX_COLS`), because a week card smaller than a quarter of
                         A4 is unreadable; stacked rows win while they fit, so only the third
                         box forces a second column. `paginate` (cancelled weeks become
                         full-width notice bands that don't use a box) and `placeCells`.
                         **`placeCells` scales a whole page by ONE factor**: each band gets the
                         height its content wants at full column width, then every band —
                         cancelled weeks included — is multiplied by the same shrink, so every
                         block ends up `cellW * shrink` wide and they share left and right
                         edges. Shrinking only the week bands left a one-line notice WIDER than
                         the cards above it. A notice is still THIN (capped at `NOTICE_H`) and
                         spans the page only at ONE column; at two it is one column wide
    pdfWriter.mjs      — `writePdf(pages)`: pages of placed JPEGs, object numbers allocated as
                         written (the old fixed stride of 3 only worked at one image per page).
                         `singleImagePages()` keeps the original one-card-per-page behaviour
                         that `jpegImagesToPdfBlob` and the 指派分布 PDF rely on
    weekendExport.js   — `getWeekendExportFilename(rows, ext, label)` mirrors the midweek
                         helper for weekend downloads: joins the first/last exported row's
                         `date` with `~` (e.g. `週末_7-12~9-14.xlsx`); `downloadWeekendXlsx`
                         falls back to it when no explicit filename is passed
    suggest.js         — pure recency-scoring suggestion engine (no DB, no fetch);
                         exports suggestWeekendRow(people, pastRows, existing) and
                         suggestMidweekWeek(people, week, existingAssignments, pastHistory).
                         History input covers ALL other weeks/rows — past AND FUTURE — and
                         the fairness gap is BIDIRECTIONAL (distance to the nearest
                         assignment in either direction), so editing an earlier week never
                         suggests someone already booked in an upcoming week. Crowd
                         demotion: anyone with an assignment in ANY category within ±7
                         days of the slot ranks below everyone free (still pickable as a
                         fallback so slots always fill). Monthly repeat demotion (member
                         feedback: 學生練習安排整個月份內人員盡量不要重複): ministry
                         student-practice cats (`ministry`, `ministrytalk`) additionally
                         demote anyone with a ministry-cat assignment within ±28 days —
                         wider than the general 7-day crowd window, scoped to those two
                         cats only (chairman/prayer/etc. are unaffected), still a demotion
                         not an exclusion so a small pool still fills every slot.
                         **Assignment families** (`FAMILIES` — defined in partTypes.mjs so
                         the picker shares them): family cats rank on the UNION of the
                         family's history plus a monthly (±28d) repeat demotion computed PER
                         FAMILY (`monthlyByFamily`, NOT one lumped set — a 朗讀 turn must not
                         demote a ministry pick). Eligibility is UNCHANGED — a family shares
                         history, not candidates. The per-title distinction survives in
                         `type` (records + rotation tiebreak only).
                         **學生／助手 pair variety**: history entries carrying a `pairId`
                         (weekId+partKey) let the engine recover who served WITH whom; when
                         filling either half of a 傳道示範 demo, anyone paired with the
                         counterpart inside `PAIR_REPEAT_WINDOW_DAYS` (180) is demoted —
                         applied AFTER the crowd/monthly filter, because spreading LOAD
                         outranks spreading partnerships. Demotion, not exclusion.
                         Part-type rotation: history entries may carry {type, role}; within
                         the top-5 fairness window the candidate who has gone longest
                         without that specific (part type, 學生/助手 role) wins — a future
                         booking counts as the MOST recent holder of a type, never as
                         "never did it". The window may only reorder candidates whose own
                         gap is within `ROTATE_GAP_TOLERANCE_DAYS` (7 = one meeting cycle)
                         of the best available gap — without that guard a new title pulled
                         someone back the very next week, undoing the spacing the gap
                         ranking had just produced. Ministry demo helper slots prefer the
                         student's gender (S-38); that preference outranks crowd demotion
    cnDate.mjs         — THE date layer. Everything that asks "what day is this week/row?"
                         goes through here, so a date can never mean two things on two
                         screens. Two tiers: (1) `isoDate` — a real "YYYY-MM-DD" stored on
                         the row, unambiguous; (2) the legacy display string ("6月 3日" /
                         "8/9"), which carries NO year, so one is inferred from "now" with a
                         ±6-month window — only ~12 months wide and unable to hold two
                         service years. `resolveRowDate(rowOrString, ref)` is the resolver:
                         stored date wins, inference is the fallback (a malformed isoDate
                         falls back rather than returning null). Also `parseIsoDate` /
                         `toIsoDate` (LOCAL parts — `toISOString()` shifts the day for UTC+8),
                         `toCnLabel`, and `resolveSequenceYears(rows, {anchorIndex, anchorYear})`
                         which recovers real years for an ordered run by rolling at each
                         month decrease (used by the EPUB import, where the anchor year is
                         known and one issue's weeks ARE in order — NOT safe for a whole
                         table, see the backfill script). This module replaced FOUR
                         divergent copies of the inference (page.js, OverviewPage,
                         PeoplePage, assignments.mjs, icalExport)
    pairHistory.mjs    — pure 學生／助手 pairing history: `buildPairIndex(pairs)`,
                         `recentPairing(index, a, b, ref)` (bidirectional — a pairing
                         booked next month counts like one last month; a pairing ON ref is
                         the assignment being edited and is ignored),
                         `partnersWithin(index, name, ref)` (the engine's demotion set),
                         `collectMidweekPairs(weeks, assignments)` and
                         `counterpartName(slotId, weeks, assignments)` (client side).
                         Scoped to 傳道示範 demos — the 研經班 主持/朗讀 pools are far
                         smaller, so warning about repeats there would be noise
    candidates.mjs     — `buildCandidates(people, catKey, jitter, spread, pastHistory,
                         pair)`: the manual picker's ranking, extracted from AssignSheet so
                         it is unit-testable ALONGSIDE the ✦ engine it must agree with.
                         Uses `familyCats` for recency (so 研經班朗讀 counts toward
                         經文朗讀) and flags `viaFamily` + `paired`. `spread` is the exponent
                         the fairness gap is raised to; AssignSheet passes a fixed `SPREAD = 2`
                         (it used to be a 公平強度 slider nobody moved off the default)
    partTypes.mjs      — pure slot/cat classifiers shared by suggest, the suggest route,
                         pastHistory and MidweekWeek: partTypeOf(title) (初次交談/再次交談/
                         教導人成為門徒/解釋自己的信仰/演講), effectiveCat(part)
                         (single-slot ministry 演講 parts → 'ministrytalk', brothers-only;
                         roleLabel with '/' overrides the title → mixed demo pool), and
                         slotCat(part, idx) (CBS _1 → 'cbsread' reader pool). ALSO the
                         home of `FAMILIES` / `FAMILY_OF` / `familyCats(catKey)` — the
                         "same kind of turn" table (`ministry`+`ministrytalk`,
                         `reading`+`cbsread`). It lives here, not in suggest.js, so the ✦
                         engine and the manual picker share one definition
    appointments.mjs   — 職務 options (`OFFICE_OPTIONS`, `DEFAULT_OFFICE`) + the one rule
                         that depends on them: `isPioneer` / `pioneerBonus` /
                         `PIONEER_GAP_BONUS_DAYS` (7). 先驅 is a privilege, not really an
                         appointment, but the congregation asked for ONE flat dropdown, so
                         it is a value available to 弟兄 and 姊妹 alike. The preference is
                         expressed in the rankers' own unit — a 先驅 ranks as though they
                         had been free a week longer — so it wins ties and near-ties but
                         never outranks someone genuinely much less used, and the crowd/
                         monthly demotions and S-38 gender filters are untouched. Lives in
                         its own module because PeoplePage, suggest.js and candidates.mjs
                         all have to agree (same reason FAMILIES lives in partTypes.mjs)
    icalExport.js      — pure iCal (.ics) generator; exports generateIcal(assignments,
                         personName, congCode) → RFC-5545 string and downloadIcal(str, filename)
    heatmapExport.js   — download layer for the 指派分布 匯出 menu (mirrors weekendExport.js):
                         `downloadHeatmapGridXlsx` / `downloadHeatmapPersonXlsx` /
                         `getHeatmapExportFilename`, wrapping the pure row builders in
                         heatmap.mjs with `buildXlsxBuffer` + `triggerDownload`
    heatmap.mjs        — pure, DB-free 指派分布 (assignment distribution heatmap) helpers for
                         OverviewPage's 指派分布 tab.
                         **It does NOT parse dates itself** — it imports `parseCnDate` from
                         `cnDate.mjs` like pastHistory/suggest/pairHistory do. An earlier
                         version had its own service-year parser; it disagreed with cnDate
                         (reading "10月 8日" as LAST October while the rest of the app read
                         it as NEXT October), which silently sorted a real member's whole
                         指派記錄 backwards and put a future booking at the top as the
                         oldest entry. `heatmap.test.mjs` now pins the two together.
                         **Window** (`buildMonthWindow`): schedule dates carry no year, so
                         cnDate's ±6-month inference resolves only ~5 months back but ~7
                         forward — there is no reliable 12-month PAST. Rolling windows are
                         therefore CENTRED on the current month (`back = floor(range/2)`),
                         which is also what a scheduler needs and mirrors the ✦ engine's
                         bidirectional fairness gap. `mode: 'serviceYear'` gives the fixed
                         Sept–Aug block instead (arrows step whole years; rolling arrows
                         step by `range`).
                         **Coverage** (`coveredMonths`): a month with no meetings imported
                         is NOT a month with zero assignments. Uncovered months are excluded
                         from idle runs — without this every person got a phantom
                         `12 個月未派` purely because those months had no data, which
                         corrupted the attention ranking — and render as 無資料 rather than
                         as an empty ramp cell.
                         **Export rows** (`buildGridExportRows` / `buildGridText` /
                         `buildPersonExportRows` / `attentionNote`): pure, so the on-screen
                         grid, the copied text and the spreadsheet cannot drift — the same
                         reason `buildPersonSummary` lives here. `windowLabel` prints YEARS
                         (`2026年3月 – 2027年2月`): rolling windows are centred, so 12 months
                         almost always cross a year boundary and the year-less form read as
                         a meaningless "3月 – 2月".
                         Flag rules: 姊妹 flag on ANY two parts in a month; 弟兄 only on two
                         within 用心準備傳道工作 (傳道示範/傳道演講/助手/經文朗讀, matched by
                         substring on the assembled label), so a brother's 寶藏演講 +
                         生活演講 in one month is not a double. Sort rank = doubles, then
                         idle, then roster order. `buildPersonDetail` takes the SAME window
                         as the grid so the two views can't disagree, and
                         `buildPersonSummary` / `windowLabel` are pure so the on-screen,
                         copied and exported text can never drift
    assignments.mjs    — pure, DB-free date + assignment helpers shared by line/webhook
                         and meetings/publish: parseCnDate, collectAssignments
                         (skipSuspended option — webhook passes true, publish keeps its
                         original behaviour), itemKey. `.mjs` so Node can unit-test it
    changelog.mjs      — 最近變更 helpers: describeMidweekSlot / weekendFieldLabel /
                         WEEKEND_NAME_FIELDS / changeAction (pure, unit-tested) + logChange(db,
                         entry) (best-effort ChangeLog write, never throws). `.mjs`
    mutations.mjs      — framework-free cores for the assignment-mutating routes:
                         applyMidweekAssignment(db, user, slotId, name) and
                         applyWeekendPatch(db, user, existing, body) — db injected so they're
                         integration-tested with an in-memory fake. Routes wrap these with auth
    line-webhook.mjs   — framework-free LINE handlers (handleFollow / handleMessage) + keyword
                         and help-text constants; db + reply (+ now) injected for testing
    test-support/fake-db.mjs — in-memory Prisma stand-in (a "fake", not a mock) used by the
                         integration tests; only the methods the routes use. NOT for app code
  components/
    Sidebar.js         — desktop left nav (shows congregation name + scheduleStats vacancy card)
    TopBar.js          — mobile top bar
    TabBar.js          — mobile bottom tab bar (5 items: grid-template-columns: repeat(5, 1fr))
    MeetingsPage.js    — midweek/weekend tab switcher; both tabs share same toolbar
                         pattern (edit toggle, add row, 發布通知); export menu on midweek only
                         (匯出 JPG / 複製圖片 / 複製文字 / 匯出 Excel / 下載 PDF — PDF
                         downloads silently, no print popup); ✦ suggest button in midweek
                         navstrip + weekend per-row; batch 接受全部/清除建議 toolbar
                         buttons when ghost suggestions exist
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
    OverviewPage.js    — three tabs, [安排]/[最近變更]/[指派分布] canEdit-gated the same way
                         (最近變更 and 指派分布 both hidden from viewers — same precedent as
                         人員): [安排] overview list with sort (最近/最緊迫/最早), past-items
                         toggle (hidden by default), swipe/button dismiss with undo toast +
                         reset; [最近變更] the change-log panel (ChangesPanel fetches
                         GET /api/changelog and renders assign/reassign/clear rows with
                         timestamp + actor); [指派分布] renders `AssignmentHeatmap`
    AssignmentHeatmap.js — 指派分布 (assignment distribution heatmap), read-only. Two views
                         toggled by local state (`selected`), no routing: `OverviewGrid` and
                         `PersonDetail`. Both share ONE `view` state ({gender, rangeKey,
                         offset}) so opening a person shows the same period the grid was on.
                         Range chips: 3 個月 / 6 個月 / 12 個月 / 本服務年度 (see heatmap.mjs
                         for why rolling windows are centred). All derivation is in
                         `lib/heatmap.mjs`; the component only renders and holds UI state.
                         **Names are never truncated** — the name column is sized to the
                         longest name present and the table scrolls sideways instead (sticky
                         name + 件數 columns). Squares are fit-to-width via `ResizeObserver`,
                         floored at a size that keeps the month label on one line (a smaller
                         floor made "10月" wrap to two lines and spill out of the header).
                         When the grid does overflow, the current month is scrolled into
                         view and its header label is accented.
                         **Tooltip**: rendered once, `position: fixed`, placed from a
                         measured rect (`useBubble` + `BubbleLayer`) — above by preference,
                         flipped below when there is no room, clamped horizontally. It
                         cannot be a child of the cell: `.hm-tablewrap` scrolls and
                         `.hm-grid52-scroll`'s `overflow-x` makes `overflow-y` compute to
                         auto too, so an absolutely-positioned bubble was clipped on the top
                         row and at both edges. Hover-to-open is gated on
                         `(hover: hover) and (pointer: fine)` — on a touchscreen a tap fires
                         mouseenter AND click, so wiring both made the bubble flash open and
                         shut. Touch gets click-to-toggle; any press outside a cell, plus any
                         scroll or resize, dismisses it.
                         **Export**: `HeatmapExportMenu` serves BOTH views (匯出 JPG / 複製
                         圖片 / 複製文字 / 匯出 Excel / 下載 PDF) — they differ only in the
                         `buildText` / `buildXlsx` they hand it and the filename. Reuses
                         `captureBox` / `triggerDownload` / `jpegDataUrlToImage` /
                         `jpegImagesToPdfBlob` from `midweekExport.js` and the row builders
                         in `heatmap.mjs`; Excel goes through `heatmapExport.js`.
                         The grid card is height-capped (`.hm-root { max-height }`) so
                         `.hm-tablewrap` is a real scrollport and the sticky month header
                         actually follows you down the roster — see "What NOT to do".
                         There is NO 列印一頁 — `window.print()` produced a two-page PDF whose
                         first page was just the name. Capture adds `is-capturing` to the
                         card, which unpins every inner scroll area so html-to-image gets the
                         whole card rather than the scrolled slice, and hides the toolbar.
                         The 匯出 dropdown uses `AnchoredMenu` (`position: fixed`, clamped to
                         the viewport, opening rightwards from the button) because an
                         absolutely-positioned `.menu` was clipped by the card and opened
                         leftwards off-screen on narrow phones
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
                         output matches the live card (Excel uses the styled data path in
                         `buildMidweekXlsxBlob` — two weeks per printed A4 page). A fifth card,
                         **PDF 版面**, opens `PdfLayoutSheet` instead of exporting directly
    PdfLayoutSheet.js  — the 版面 picker (匯入/匯出 only): a Word-style rows × cols grid that is
                         2×2 — the real ceiling, so there are no greyed-out cells — an
                         A4-proportioned ghost skeleton preview with the first `count` boxes
                         filled, and a ＋/− stepper capped at 4. Mobile first — bottom sheet with
                         generous tap targets, two columns from 721px up; reuses the
                         `.sheet-backdrop`/`.sheet` pattern rather than adding a second modal
                         primitive. The choice persists in localStorage (`mwPdfLayout`),
                         default 2 stacked
    SettingsPage.js    — ⚙ settings. Admins: 我的資訊 + 會眾資訊 + 邀請檢視者 (share the
                         congregation CODE, not an invite link) in the left grid column, 聚會排程
                         settings top-right, 成員列表 (2-col card grid, role <select> per member)
                         below. Viewers: profile + role badge only. isAdmin includes SYSADMIN
    AssignSheet.js     — bottom-sheet candidate picker; uses real `people` state (not seed
                         data); "✕ 留空此項" button clears a slot (leaves it unassigned).
                         Ranking lives in `lib/candidates.mjs` (pure, tested). For a
                         傳道示範 slot the header shows `搭檔：X` and any candidate paired
                         with X inside 180 days is flagged `● N 天前曾與 X 搭檔` and
                         weighted down (×0.25) — repeats are allowed, just not back-to-back.
                         Family recency shows as `● N 天前擔任研經班朗讀`.
                         Candidate weight uses the bidirectional gap from pastHistory.mjs
                         (min of daysSince/daysUntil) and warns "N 天後已排此項" /
                         "前後一週內另有安排", so manual reassignment can't silently
                         double-book someone already scheduled in an upcoming week.
                         There is NO 公平強度 slider and NO 重新推薦 button — both were removed
                         as noise. `SPREAD` is fixed at the value it always shipped with, and
                         `jitter` is always false, so the ranking is deterministic and unchanged
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
  fix-ministry-talks.mjs — one-time (idempotent): ministry 演講 parts → roleLabel 學生,
                         delete phantom _1 assignments, tag talk-giving brothers 傳道演講
                         (node --env-file=.env scripts/fix-ministry-talks.mjs)
  add-ministry-disc-qual.mjs — one-time (idempotent): seed 傳道討論主持 qual (conducts
                         節目包括討論 ministry parts) to active 生活演講 brothers
                         (node --env-file=.env scripts/add-ministry-disc-qual.mjs)
  sim-family-rotation.mjs — diagnostic (read-only DB): replays the last 8 real week
                         structures forward 26 weeks, auto-accepting every ✦ suggestion,
                         and reports per FAMILY (用心準備傳道工作 / 朗讀) the spacing
                         between a person's consecutive turns, same-month repeats, and
                         who never gets a turn — split by gender (the 傳道示範 pool is
                         42 sisters to 4 brothers, so a whole-pool average hides the
                         sisters' rotation). Drop a copy of a previous engine at
                         `app/lib/suggest.old.js` (e.g. `git show HEAD:app/lib/suggest.js >
                         app/lib/suggest.old.js`) and it reports both side by side, so an
                         algorithm change is measured rather than asserted. Delete the copy
                         afterwards — it is a scratch file, not part of the app
  sim-suggest.mjs      — diagnostic: simulates N weeks of auto-accepted ✦ suggestions
                         against real DB history and reports part-type/role distribution
                         per person (used to tune the rotation algorithm; read-only DB)
  check-xlsx-pagination.mjs — verifies the midweek workbook really prints two weeks per A4
                         page, by building it and converting it with LibreOffice
                         (`node scripts/check-xlsx-pagination.mjs`). No DB, no network. Run it
                         after changing row heights, column widths or the page setup — the unit
                         tests are self-consistent with the height model and cannot catch a
                         model that disagrees with a real renderer
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

**Roles:** `SYSADMIN` (global control) > `ADMIN` (the only per-congregation editor) > `VIEWER`
(read-only; sees schedule + people). This is an **admin tool**: only ADMIN/SYSADMIN edit; everyone
else views. One source of truth: `app/lib/roles.mjs` — `canEdit` (ADMIN|SYSADMIN),
`canManageCongregation` (ADMIN|SYSADMIN — settings/members/changelog), `isAdmin`, `isSysadmin`,
`ASSIGNABLE_MEMBER_ROLES` (ADMIN|VIEWER — what a congregation admin may grant). `auth/sync` never
overwrites `role`, so roles persist across logins. (Legacy MEMBER/GUEST rows were migrated to VIEWER
via `scripts/set-roles.mjs`, which also sets the first SYSADMIN by email.)

- **Write/admin guards take the role helpers, never a literal `'ADMIN'`** — write routes use
  `canEdit` (ADMIN|SYSADMIN); settings/members/changelog/publish use `canManageCongregation`
  (ADMIN|SYSADMIN); `admin/*` use `isSysadmin`. `roles.test.mjs` asserts every write route and
  every `admin/*` route enforces its check. (There must be NO `user.role === 'ADMIN'` left in any
  route — sysadmins would be wrongly blocked.)
- **Viewers** see 聚會 / 週末 / 總覽 (read-only) + a profile-only Settings. They do NOT get the
  人員 page: nav hides 匯入 + 人員, `congregations/data` returns `people: []` and `people` GET 403s
  for non-editors. All edit/assign/publish controls are hidden and `openSheet` is a no-op.
- **Per-congregation role mgmt:** `PATCH /api/congregations/members { userId, role }`
  (canManageCongregation; ADMIN/VIEWER only, not self, and cannot change a SYSADMIN) — per-member
  `<select>` in Settings.
- **Sysadmin panel** (`/app/admin/page.js`, gated to SYSADMIN; `app/api/admin/*`): create/rename/
  delete congregations + list all users and set each user's role (incl. ADMIN/SYSADMIN), move them
  between congregations, and **delete a user** (`DELETE /api/admin/users/[id]` → removes the DB row
  + the Firebase auth account via `deleteAuthUser`, not self). A congregation-less SYSADMIN is
  redirected from `/` to `/admin`; otherwise a 系統管理 nav link appears.

**Joining:** a logged-in user with no congregation (e.g. after Google sign-in — no separate
register step) lands on onboarding and **enters the congregation code** (or picks from the
`GET /api/congregations/list` dropdown) → `POST /api/congregations/join { code }` → joins as
read-only VIEWER. **Congregation is set once** — the join route 409s if already joined, so an admin
can't switch to peek at another congregation; only SYSADMIN moves a user (`admin/users/[id]`).
Only SYSADMIN creates congregations. Web join + the LINE webhook registration both look congregations
up in the same `congregation` table, so adding one in `/admin` reflects everywhere. Settings shows
the **code** to share (the old invite-link cards were removed). Legacy `/join/{token}` still grants VIEWER.

**All data API routes are congregation-scoped** — every route verifies `user.congregationId` from the Firebase token and constrains all DB queries to that congregation. The LINE webhook is the only unauthenticated route; it scopes name lookups to the congregation chosen during the two-step registration flow.

---

## Prisma schema (key models)

| Model | Key fields |
|---|---|
| `Congregation` | `name`, `code` (unique slug), `inviteToken` (UUID), `guestInviteToken` (read-only join link; DB default `gen_random_uuid()::text` so adding it backfilled existing rows), `meetingDayOffset`, `meetingTime`, `exceptions` (JSON), `publishedSnapshot` (JSON — future-only assignments per person, for diff) |
| `User` | `firebaseUid`, `email`, `displayName`, `role` (SYSADMIN/ADMIN/VIEWER, default VIEWER), `congregationId` (nullable — sysadmins may have none) |
| `MidweekWeek` | `congregationId`, `date` (display label, no year), **`isoDate`** (real "YYYY-MM-DD" — authoritative), **`weekStartIso`** (real Monday), `dateLabel`, `weekStart` (legacy label), `weekdayPill`, songs, times. `@@unique([congregationId, isoDate])` — the display string repeats every year, so keying on it made two service years collide |
| `Part` | `weekId`, `partKey`, `section`, `partNum`, `title`, `dur`, `cat`, `roleLabel`, `cbsRef` |
| `Assignment` | `slotId` (unique string key), `weekId`, `name` |
| `WeekendRow` | `congregationId`, `sortOrder`, `date` (display label), **`isoDate`** (real date — authoritative), `type`, `no`, `topic`, `cong`, `speaker`, `chair`, `wt`, `read`, `host`, `away`, `label`, `note` |
| `Person` | `congregationId`, `name`, `gender`, `appointment`, `tags[]`, `status`, `lineUserId` (nullable — opt-in LINE notifications) |
| `LinePendingLink` | `lineUserId` (PK), `congregationId` — stores mid-flow state during two-step LINE registration; deleted once linking completes |
| `ChangeLog` | `congregationId`, `slotId`, `date`, `label`, `name`, `prevName`, `action` (assign/clear/reassign), `actorName`, `createdAt` — append-only recent-changes log (`@@index([congregationId, createdAt])`). New table → run `prisma db push` manually after deploy |

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
  ministrytalk:{ tag: "傳道演講",      g: "M",   name: "傳道訓練（演講）" },
  ministrydisc:{ tag: "傳道討論主持",  g: "M",   name: "傳道討論主持" },
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

QUAL_OPTIONS in PeoplePage.js: `傳道與生活主席`, `週末聚會主席`, `守望台主持人`, `禱告`, `寶藏演講`, `經文寶石`, `經文朗讀`, `傳道示範`, `傳道演講`, `傳道討論主持`, `助手`, `生活演講`, `研經班主持`, `研經班朗讀`, `守望台朗讀`, `公眾演講`.

Ministry-section 演講 parts (e.g. `解釋自己的信仰 — 演講`, `演講 — 《愛心》附錄`) are
brothers-only student talks with NO assistant (S-38). They are detected via
`partTypeOf`/`effectiveCat` in `app/lib/partTypes.mjs` and use the `ministrytalk` cat
(tag `傳道演講`) everywhere — the AssignSheet picker, the ✦ suggest engine, and
pastHistory stats. `scripts/fix-ministry-talks.mjs` (one-time, idempotent) repaired
existing parts (roleLabel → `學生`, deleted phantom `_1` assignments) and tagged the
brothers who had given these talks.

**The admin's roleLabel is authoritative over the title.** The EPUB can't always tell
pair-vs-single, so `epubParser.ministryRoleLabel(title, durText)` reads the description
line: `示範`-prefixed → `學生/助手`; `演講`-prefixed or 演講 in title → `學生`;
`節目包括討論` (你會怎麼說？ discussion parts) → no roleLabel (single slot). In edit
mode EVERY ministry part shows the ＋/− toggle: for ministry it rewrites `roleLabel`
itself (`學生` ↔ `學生/助手`, persisted via the week PATCH which now includes
`roleLabel`) rather than just `hideHelper` — because eligibility follows roleLabel
(`effectiveCat` in partTypes.mjs): `/` in roleLabel → mixed 傳道示範 pool even if the
title says 演講; single `學生` + 演講 title → `ministrytalk` (brothers-only); **no
roleLabel at all → `ministrydisc`** (discussion parts are conducted by an elder or
qualified MS per S-38 ¶6 — NOT the chairman, whose absorb-rule in ¶24 covers only
video-without-discussion parts; pool = dedicated `傳道討論主持` qual, seeded from the
生活演講 brothers by `scripts/add-ministry-disc-qual.mjs`). CBS keeps the `hideHelper`
mechanism. S-38 also confirms: helpers
same gender as the student (or family), 解釋自己的信仰 gender depends on 示範 vs 演講
variant, ministry 演講 brothers-only — all encoded in suggest.js + partTypes.mjs.

職務 (appt) options for brothers (M): `分區監督`, `長老`, `助理僕人`, `先驅`, `傳道員`,
`未受浸傳道員`. For sisters (F): `先驅`, `傳道員`, `未受浸傳道員`. The list lives in
`app/lib/appointments.mjs`, not in PeoplePage — the ✦ engine and the manual picker both give
先驅 a small ranking nudge and must read the same table.

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
- **下載 PDF** — `toJpeg` → `jpegDataUrlToImage` → `jpegImagesToPdfBlob([img])` → `triggerDownload`.
  Built entirely client-side and downloaded directly — **no print dialog/popup** (browsers block
  those). Each PDF page is sized to the image's aspect ratio (no A4 letterbox). Do not reintroduce
  the `window.open(...).print()` flow.
- **Excel** — `buildMidweekXlsxBlob()` in `midweekExport.js` (JSZip, hand-built OOXML): styled
  like the card (section-colour bands, grey time/role columns, bold names), A4 portrait page
  setup with a manual page break after every 2nd week → printing from Excel yields two weeks
  per page for the bulletin board

**Import/匯出 page (multi-week, range-scoped)** — the 匯出與分享 cards call `exportNodesJpeg`
(single → JPG, many → zip), `exportWeeksXlsx` (one styled workbook, two weeks per printed A4
page), `exportNodesPdf` (one PDF page per week), and `openNodesPrintWindow`. The visual exporters
screenshot REAL MidweekWeek cards rendered off-screen (cardRefs) via `html-to-image`, so they
match the live card exactly — they do NOT hand-redraw on canvas (the old `renderWeekToCanvas`
path was removed). Excel uses the styled `buildMidweekXlsxBlob` data path (`weekRows` mirrors
the card's row order). The 範圍 selector (全部/本月/自訂) filters
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

`line/webhook` and `meetings/publish` import their date + assignment helpers from one pure,
DB-free module — `parseCnDate`, `collectAssignments`, `itemKey`. (These were previously
copy-pasted into each route, which let the role-label format drift.) The module is `.mjs` so
it's importable by both Next and Node. `now`/`today` are injectable for deterministic tests.

`parseCnDate()` handles:
- Chinese format: `"6月 3日"`
- Slash format: `"8/9"` (used by weekend rows)

Year is inferred relative to today with a ±6-month window to handle year boundaries.
`collectAssignments` always skips `event` weekend rows and tags roles with their role label
(學生/助手/主持/朗讀) + CBS textbook reference. `suspended` rows are skipped only when
`skipSuspended` is passed: the webhook query passes `true`; publish keeps its original behaviour
(includes them) — **do not change publish's behaviour here**.

### Tests

`npm test` runs `node --test` (Node's built-in runner, no extra deps). All test files are `.mjs`
next to their module. **Route logic is tested by dependency injection, never against Neon:** the
mutating cores live in framework-free libs (`mutations.mjs`, `line-webhook.mjs`) that take the
Prisma client as an argument; tests pass an in-memory fake (`app/lib/test-support/fake-db.mjs`) and,
for the webhook, a `reply` spy + injectable `now`. Coverage:
- `assignments.test.mjs` — `collectAssignments` (incl. skipSuspended), date parsing, wiring guards.
- `changelog.test.mjs` — label resolvers + `logChange` behaviour (assign/reassign/clear/no-op,
  best-effort never-throws).
- `mutations.test.mjs` — `applyMidweekAssignment` / `applyWeekendPatch` end-to-end against the fake
  DB: assignment state + the right ChangeLog row, 400/403 paths.
- `line-webhook.test.mjs` — `handleMessage`: `我的安排` query (post-revert), suspended-row exclusion,
  help text, and the two-step registration flow.
- `roles.test.mjs` — `canEdit`/`isAdmin`/`isGuest` policy + a regression guard asserting every
  schedule-mutating route enforces `canEdit`.
- `suggest.test.mjs` — the ✦ engine: fairness/bidirectional gap, crowd + monthly demotion,
  assignment families, part-type rotation and its gap guard, S-38 gender rules, 學生／助手
  pair variety.
- `pairHistory.test.mjs` — pair keys, window boundaries (inclusive at 180 days), pairing ON
  refDate ignored, `collectMidweekPairs` / `counterpartName`.
- `candidates.test.mjs` — the manual picker's ranking, including the assertion that it and
  `suggestMidweekWeek` return the SAME person for a 朗讀-family slot, and that both apply the
  先驅 nudge identically.
- `heatmap.test.mjs` — the 指派分布 derivation: agreement with the shared `cnDate` parser,
  centred windows, coverage/idle rules, the slot-ID guard (a live `getAssign` override must beat
  the `part.assign` snapshot), `windowLabel`, and the export row/text builders.
- `weekType.test.mjs` — the cancelled-week predicate and the label→type keyword defaults
  (including that 分區監督探訪 suggests 特別, NOT 暫停 — that meeting still happens).
- `midweekXlsxLayout.test.mjs` — the print pagination: the wrapped-title height model, two
  scheduled weeks per page with cancelled weeks riding along, `ceil(n/2)` pages, breaks landing
  on a week header, and every page fitting `PAGE_BUDGET_PT` across a matrix of month shapes
  (September-shaped weeks must stay uncompressed; October-shaped ones must squeeze).
- `pdfLayout.test.mjs` — the 版面 grid: the ≤4-box invariants, ＋/− growth, cells staying inside
  the margins without overlapping, aspect preserved, bands sized to the cards, and full-width
  notice bands.

Tests are non-vacuous (verified by mutation: breaking a label produced the expected failures;
reverting the row-height rule fails `midweekXlsxLayout.test.mjs`).

`scripts/check-xlsx-pagination.mjs` is the renderer-level companion: it builds the workbook and
converts it with LibreOffice, asserting the real page count. The unit tests derive the page
budget from the same height model they build rows with, so only a real renderer can catch a
height or WIDTH model that disagrees with what a spreadsheet actually prints — which is how the
column-overflow half of the October bug was found. Needs `soffice` with `libreoffice-calc`; it
skips with a message when that is missing.

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
- Do not hardcode `roleLabel: '學生/助手'` for ministry parts in `epubParser.js` — 演講-type ministry parts are single-slot talks (`學生` only, no assistant) and 你會怎麼說 discussion parts are single-slot with no label; `ministryRoleLabel(title, durText)` decides from the description line and `assignTimes` must pass it through (`p.roleLabel`), not overwrite it
- Do not pass one `catKey` to both slots of a pair — use `slotCat(part, idx)` from `partTypes.mjs`: the CBS reader (`_1`) draws from `cbsread` (研經班朗讀), and single-slot ministry 演講 parts use `ministrytalk` (brothers-only), not the mixed `ministry` pool
- Do not let the ✦ suggest engine (`lib/suggest.js`) and the manual picker (`lib/candidates.mjs`)
  rank on different notions of recency. They are two entry points to ONE decision, so the family
  table lives in `partTypes.mjs` and both import it — a review caught them diverging, with the
  engine ranking 經文朗讀 on the whole 朗讀 family while the picker still called a brother who
  read at 研經班 six weeks ago 從未擔任此項. `candidates.test.mjs` asserts they agree
- Do not test the ±28-day monthly demotion with a case where plain fairness already gives the
  asserted answer — that is how it went untested for a release. A pin must put the
  monthly-window candidate AHEAD on fairness so only the demotion can flip the pick (see
  "monthly demotion outranks a merely-crowded rival")
- Do not backfill `isoDate` by walking the schedule table and rolling the year whenever the
  month decreases. Rows are NOT in chronological order — issues are imported when they are
  published, so a real table reads Sept–Oct (next issue) then May–Aug (months just past), and
  the walk reads 10月 → 5月 as a year boundary and dates the upcoming September a year into the
  past. `scripts/backfill-iso-dates.mjs` dates each row independently and skips what it cannot
  place. (The walk — `resolveSequenceYears` — IS correct inside one EPUB issue, where the
  anchor year comes from the OPF title and the weeks really are in order.)
- Do not read a date off `week.date` / `row.date` directly, and do not write another year
  inference. Call `resolveRowDate(row)` from `cnDate.mjs` and pass the ROW, not the string, so a
  stored `isoDate` is actually used. There were four divergent copies of that inference; one of
  them silently mis-sorted a member's 指派記錄
- Do not give the 指派分布 heatmap its own date parser. `app/lib/cnDate.mjs` is the ONE parser;
  `heatmap.mjs` must import `parseCnDate` from it. A private service-year parser read
  "10月 8日" as LAST October while the rest of the app read it as NEXT October, so a member's
  指派記錄 silently listed a future booking first as though it were the oldest, and their
  monthly bars and 平均間隔 were wrong. `heatmap.test.mjs` pins the two together — keep that test
- Do not treat a month with no imported meetings as a month with zero assignments in the heatmap.
  `coveredMonths` marks which months have data; uncovered ones are excluded from idle runs and
  render as 無資料. Without this every person gets a phantom `12 個月未派`, which ruins the
  attention ranking the whole view exists for
- Do not build a midweek slot ID from the bare `part.id` — it is the `partKey` (`t0`), and
  the real key is `mw{weekId}_{partKey}_{n}`. `heatmap.mjs` did exactly this, so its lookup
  never matched a live assignment and every part silently fell back to `part.assign`, the
  snapshot loaded at mount: edits to 人員 or the meetings page only appeared in 指派分布 after
  a page refresh. A fixture that sets only `assign` cannot catch it — `heatmap.test.mjs` now
  asserts a `getAssign` override BEATS the snapshot. (`OverviewPage` is safe because its local
  `ga` prepends the week prefix.)
- Do not remove the height cap on `.hm-root`. `.hm-tablewrap` has `overflow: auto` and so is
  its own scrollport; without a bounded card height it never scrolls vertically, the document
  scrolls instead, and `position: sticky` on `.hm-colhead` never engages — the month labels
  scrolled away and a screenshot of the middle of the roster had no header.
- Do not give the 指派分布 exports their own row builders or filename rules. The builders are
  pure and live in `heatmap.mjs` (shared with 複製文字, unit-tested); `heatmapExport.js` only
  turns them into a file, and images use the SAME `getHeatmapExportFilename` as the spreadsheet
- Do not turn the 先驅 preference into an exclusion or a separate filter. It is a bonus on the
  fairness gap (`pioneerBonus`, 7 days) applied inside both rankers, so it can win a tie and
  lose to a genuinely wider gap; the S-38 gender rules and crowd/monthly demotions run after it
  and still decide. `suggest.test.mjs` pins both directions
- Do not put the heatmap tooltip (or the 匯出 dropdown) back to `position: absolute`. Both live
  inside scrolling, rounded containers that clip them — the bubble was cut off on the top row and
  the menu opened off-screen. Both are `position: fixed` and placed from a measured rect
- Do not wire both `onMouseEnter` and `onClick` to open the heatmap tooltip unconditionally — a
  tap fires both, so the bubble opened and closed in the same gesture. Hover-open is gated on
  `(hover: hover) and (pointer: fine)`
- Do not give the 52-week grid's month-label row a width without putting it inside
  `.hm-grid52-scroll`. Its per-month widths are explicit; outside a scroller it stretched the
  document to ~937px on a 390px phone, which also dragged the fixed tab bar out to that width
- Do not add `window.print()` back to the person view — it produced a two-page PDF whose first
  page was just the name. Use the 匯出 menu (JPG / 複製圖片 / 複製文字 / PDF), which captures the
  card with `is-capturing` so the whole card is in the shot
- Do not derive ministry-talk eligibility from the title alone — a `/` in `roleLabel` (admin added a 助手 via the edit-mode toggle) means it IS a demo and must use the mixed pool; `effectiveCat(part)` already encodes this precedence
- Do not remove `fitToWidth="1"` (or turn `fitToPage` off) in the midweek workbook's
  `<pageSetup>`. The five columns total 91 character units, which only fits A4 when the
  workbook's Normal font really IS Calibri; wherever it is substituted (Linux, LibreOffice,
  many Macs) the same widths come out ~28% wider, the 指派 column falls off the right edge and
  EVERY page grows a second, near-empty column-page. That was half of the "October printed on
  three pages" report, and a real renderer found it — the unit tests could not, because the
  page budget is derived from the same height model the rows are built with. Also do not set a
  `scale`: Excel ignores it whenever fitToPage is on. Height is controlled by compressing row
  heights (`rowScaleFor`) instead. `scripts/check-xlsx-pagination.mjs` prints the workbook
  through LibreOffice and asserts `ceil(scheduledWeeks / 2)` pages — run it after touching the
  row heights, the column widths or the page setup
- Do not assume a fixed number of spreadsheet rows per week, or go back to breaking after every
  2nd week regardless of height. A week is `10 + parts` rows and every row's height is explicit,
  so two long weeks really can exceed the 791pt printable height; the old builder had no budget
  at all and let Excel resolve the overflow with an automatic break mid-week. `buildSheetPlan`
  measures the real rows and packs against `PAGE_BUDGET_PT`
- Do not give a cancelled week (`assembly`/`suspended`) a full programme in an export. It
  collapses to a one-line notice and does NOT consume one of the N boxes in either the Excel
  spread or the PDF grid — otherwise one 大會 week knocks every following spread out of phase
  and the rest of the month prints one week per page. `isMidweekSuspended` in `weekType.mjs` is
  the only definition; do not re-test `type === ...` inline
- Do not let the cancelled-week card grow back into a card-shaped block. It is ONE thin strip
  (`.mw-susp`: date, rule, notice, on a single line), and the PDF grid captures that same node
  as its notice band — a block-sized version put a pink slab in the middle of the page and
  looked like a broken card. The band spans the page only at ONE column; with two columns it
  takes one column's width, or it cuts the grid in half and reads as a section divider
- Do not scale a PDF page's week bands without scaling its notice bands by the SAME factor.
  `placeCells` applies one shrink to every band precisely so all blocks come out `cellW * shrink`
  wide and line up; shrinking only the weeks (to fit the page height) left the one-line
  cancelled-week band wider than the week cards above it, which looked absurd
- Do not reintroduce a "one week on this page" fallback for a tall pair in the Excel export.
  TWO MEANS TWO: the answer to a pair that will not fit is to squeeze the row heights further
  (`rowScaleFor`), not to reprint the month at one week a sheet. Packing does not look at
  heights at all
- Do not raise the 版面 picker above 2×2. Four boxes is the ceiling: a week card smaller than a
  quarter of A4 is unreadable, and a larger picker grid is mostly greyed-out cells. Stacked rows
  are preferred while they fit (2 weeks stack full-width; only the third box needs a second
  column)
- Do not let `pdfLayout.mjs` and the 版面 picker's preview drift apart. The picker shows the
  grid shape and the export places the cards; both go through `normalizeLayout`, and the page
  count in the picker comes from the same `paginate` the exporter uses
- Do not `.filter(Boolean)` the ImportPage `cardRefs` into a shorter array before handing them
  to the grid PDF. It places cards by week INDEX, so a dropped null shifts every later card into
  the wrong box; keep `nodes[i]` aligned with `selectedWeeks[i]` (and truncate `cardRefs.current`
  when the selection shrinks, or stale refs from a wider range linger)

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
| **Phase 6 — PWA + UX polish** | Done — installable PWA (`app/manifest.js` + `public/sw.js` network-first worker + `PWARegister`, themeColor/apple-web-app meta in `layout.js`). Plus: clear/留空 button in AssignSheet; serialized people writes (quals no longer self-deselect); mobile people detail renders inline under the tapped card; mobile row dot+partnum no longer squished; silent client-side PDF + 複製文字 in meetings export menu; wired ImportPage 匯出 cards with 全部/本月/自訂 range. Ministry/CBS parts always show two assignment slots (student + helper) with correct role labels; edit-mode ＋/− toggle to add/remove helper slot per part; LINE notifications include role labels (學生/助手/主持/朗讀) and CBS textbook references. 匯出 page JPG/PDF/列印 now screenshot real off-screen MidweekWeek cards (`exportNodes*`) instead of the removed hand-drawn canvas; PDF pages sized to the card; PeoplePage cards toggle-to-deselect with an animated recenter when nothing is selected. 總覽 has a 最近變更 tab backed by a `ChangeLog` table written best-effort on every assignment edit (assignments + weekend-rows routes) — decoupled from 發佈通知 (which is unchanged). |
| **Phase 7 — Assignment heatmap** | Done — 總覽 ▸ 指派分布 (canEdit-only): a contributions-style grid (`AssignmentHeatmap.js` + `lib/heatmap.mjs`), one row per person, one cell per month (or per week at 3 個月), shaded by assignment count. Range chips 3/6/12 個月 + 本服務年度; rolling windows are **centred on the current month** because schedule dates carry no year and the shared `cnDate` parser resolves ~5 months back but ~7 forward — so half past / half upcoming is both what the data supports and what a scheduler needs (mirrors the ✦ engine's bidirectional fairness gap). Months with no imported meetings render as 無資料 and are excluded from idle detection. Gender filter, attention-first sort (same-month doubles, then idle runs). Tapping a row opens 個人檢視 over the same window: week grid, monthly bars, dated record list with year dividers, 助手搭配 tally, plain-language summary, and the meetings-page export set (JPG / 複製圖片 / 複製文字 / PDF). Squares are fit-to-width; names are never truncated. Read-only by design. Encodes the member-feedback rules: 姊妹 flag on any two parts in a month, 弟兄 only within the 用心準備傳道工作 bucket. Exports (JPG / 複製圖片 / 複製文字 / Excel / PDF) are available on BOTH the grid and the person view via one shared `HeatmapExportMenu`; the month header stays pinned while the roster scrolls, so a screenshot of any part of the list carries its labels. |
| **Phase 8 — Print layout** | Done — the Excel export prints exactly two weeks per A4 page for every month. It had THREE independent faults. (1) It broke after every 2nd week without measuring the printed height, so a pair of long weeks overflowed and the renderer inserted an automatic break mid-week. (2) `<pageSetup>` carried no fit setting and the columns totalled 91 character units, which only fits A4 when the Normal font really is Calibri — substituted, the 指派 column fell off the right edge and every page grew a second, near-empty column-page. (3) **Manual `<rowBreaks>` are honoured by Excel and almost nothing else**: phone print dialogs and Google Sheets drop them and paginate automatically, leaving ~140pt of slack for the next week's header to creep into. Now the columns are narrow enough (72 units) to print at a known 100%, `buildSheetPlan` (in `lib/midweekXlsxLayout.mjs`, pure and unit-tested) measures every page and applies one workbook-wide row-height squeeze — **two means two**, a tall pair is never split across pages — and `padRows` fills each page but the last to within less than one header row of the sheet height so automatic pagination lands on the same boundaries. `scripts/check-xlsx-pagination.mjs` builds each case twice (as shipped and with the breaks stripped) and asserts both the page count and that every page opens with a week header; that renderer check found faults 2 and 3, which the unit tests structurally cannot. Plus **PDF 版面** in 匯入/匯出: a mobile-first slide-out with a 2×2 Word-style picker (4 boxes is the ceiling) and an A4 ghost-skeleton preview, exporting 1–4 real MidweekWeek card captures per A4 page via `lib/pdfLayout.mjs` + `lib/pdfWriter.mjs`. A cancelled week (new 暫停 type alongside 大會; `lib/weekType.mjs` is the one predicate) collapses to a one-line strip in the card AND every export, and never consumes a layout slot. `placeCells` scales a whole page by ONE factor so every card and band shares the same width and edges. Also removed the 公平強度 slider and 重新推薦 button from AssignSheet (both noise; ranking unchanged), fixed `ALLOWED_WEEKEND_FIELDS` missing `type` (the weekend 正常/特別/暫停 toggle was 400ing and losing the change on reload), and made the EPUB import's `mapWeek` return `type`/`label`. |
