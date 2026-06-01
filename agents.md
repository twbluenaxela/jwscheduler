# agents.md — AI Integration Notes

This file documents where and how AI agents (Claude API) are used or planned in this project, and guidelines for Claude Code when working on this codebase.

---

## Current AI usage

### None in production yet

The app is live at https://jwscheduler.fly.dev/ but has no Claude API calls in production. All core features are deterministic:
- EPUB parser (`app/lib/epubParser.js`) — JSZip + DOMParser, no LLM
- Assignment suggestions — hash-based fairness weighting, no LLM
- LINE notifications — rule-based diff logic, no LLM

---

## Planned: Vision import (image / PDF)

When an admin uploads a **JPG/PNG photo of the schedule** or a **PDF scan**, the structured content cannot be parsed deterministically. This is where the Claude API comes in.

### What it does

Send the image/PDF page to `claude-sonnet-4-6` with a vision prompt. The model extracts the schedule as structured JSON, which then goes through the same review screen as EPUB import.

### Proposed API call (server-side)

```js
// POST /api/import/vision
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

async function parseScheduleImage(imageBase64, mediaType) {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: imageBase64 },
          },
          {
            type: 'text',
            text: VISION_PROMPT,
            cache_control: { type: 'ephemeral' }, // cache the static prompt
          },
        ],
      },
    ],
  });
  return JSON.parse(message.content[0].text);
}
```

### Vision prompt

```
你是一個聚會編排資料擷取助手。請從這張圖片中擷取傳道與生活聚會的節目資訊，以 JSON 格式回傳。

欄位說明：
- date: 聚會日期（如 "6月 3日"）
- reading: 聖經閱讀（如 "耶利米書 1-3 章"）
- openSong / midSong / closeSong: 詩歌號碼（字串）
- chairman / openPrayer / closePrayer: 擔任者姓名（字串，如不清楚留空）
- treasures: 上帝話語的寶藏各項，陣列格式 [{title, dur, cat, assign:[]}]
  cat 值: "treasures" | "gems" | "reading"
- ministry: 用心準備傳道工作各項，陣列格式 [{title, dur, cat:"ministry", assign:[]}]
- living: 基督徒的生活各項，陣列格式 [{title, dur, cat, assign:[]}]
  cat 值: "living" | "cbs"

dur 格式: "10 分鐘"（數字 + 空格 + 分鐘）
辨識不清楚的欄位請留空字串，不要猜測。

只回傳 JSON，不要有任何其他文字。
```

### Reliability expectation

| Input | Expected accuracy | Notes |
|---|---|---|
| Clean printed schedule photo | ~90% | Main risk: handwritten corrections |
| Scanned PDF with text layer | ~95% | Use text layer first; fall back to vision |
| Handwritten sheet | ~70% | Always flag for manual review |

The review screen (already built) is the safety net — the admin confirms before anything is committed.

---

## Planned: Assignment suggestions via Claude

Once historical assignments are stored in Postgres (they are, as of Phase 2B), an optional "ask Claude" button could explain *why* a candidate is recommended or flag edge cases the algorithm misses (e.g. a brother is scheduled for the same role two weekends in a row due to a manual override).

This is a UX enhancement, not a core feature — the weighted hash algorithm already does the heavy lifting.

**Qualification model an agent must respect:** candidate eligibility comes from
`CATS[catKey].tag` matching a `Person.tags` entry (see CLAUDE.md). The chairman
role is **not** one qualification — it is split into three independent ones that
do not imply each other: `傳道與生活主席` (midweek), `週末聚會主席` (weekend
chair), and `守望台主持人` (Watchtower conductor). Do not assume a brother
qualified for one is qualified for the others. 職務 (appt) for brothers may also
be `分區監督` (circuit overseer) in addition to the standard appointments.

---

## Claude Code development guidelines

These apply when Claude Code works on this repo.

### State ownership

All interactive state stays flat in `app/page.js`. Do not introduce React Context, Zustand, or any other state manager. Two local-state exceptions are fine:
- `ImportPage` owns `stage` / `parsedWeeks` / `error` — transient import state
- `WeekPicker` (inside `MeetingsPage.js`) owns its `open` boolean — ephemeral UI state

### CSS convention

All styles go in `app/globals.css`. No CSS Modules, no Tailwind, no `style={}` props except for one-off positioning. Token names are in `globals.css :root`. When adding new component styles, append them above the final `@media (max-width: 860px)` block.

### Layout: midweek card alignment

The midweek view wraps the toolbar, nav strip, and card in a single `.mw-container` (max-width 880px). If you add new toolbar controls for the midweek view, place them **inside** the `.mw-container` block in `MeetingsPage.js`, not outside it.

### EPUB parser is client-only

`app/lib/epubParser.js` uses `DOMParser` and `JSZip`. It must only be imported from `'use client'` components. Do not add it to any server component or API route.

### Adding new week fields

The `midweekWeeks` array shape is defined by the seed data in `app/data/index.js` and produced by `epubParser.js`. If you add a field, update both. The shape is consumed by `MidweekWeek.js` and `MeetingsPage.js`.

**Current optional fields** (absent on seed data, present on EPUB-parsed weeks):
- `dateLabel` — full week range string from the EPUB `<h1>`, e.g. `"9月7-13日"`. Used by `WeekPicker` to show the range.
- `cbsRef` — book+chapter string from the CBS DUR line. Rendered inline on the CBS row in `MidweekWeek.js`.

### Weekend slot IDs

Always use `r._id` (the DB row id) when generating slot IDs in `WeekendView.js`, not the array index. `persistAssignment` in `page.js` matches `we{id}_{field}` and routes to `PATCH /api/weekend-rows/[id]`. Using array index breaks persistence.

### Auth & deployment gotchas (learned the hard way)

Full detail is in `CLAUDE.md`; the short version:

- **Admin SDK credentials** come from `FIREBASE_SERVICE_ACCOUNT` JSON blob, never a bare `FIREBASE_PRIVATE_KEY`
- **Google sign-in must stay `signInWithPopup`** — redirect breaks cross-domain (fly.dev + firebaseapp.com)
- **`login/page.js` must redirect after auth** via an effect on `useAuth().firebaseUser` → `router.replace('/')`
- **No fly.io `release_command`** — `prisma db push` times out on Neon cold start
- **`auth/sync` must not overwrite `displayName` on update** — only set it on create; the settings page is authoritative

### Privacy: no real names in code

Real congregation member names must never be hardcoded in app source files. They live only in the DB. Import scripts (`scripts/*.mjs`) are one-time loaders — acceptable to have names there since they're not served to clients. All names in `app/data/index.js` (demo data) must be fictional.

### The review screen is non-negotiable

Per `meeting-scheduler-plan.md §3`: never auto-commit any import. EPUB, PDF, image — all go through the review UI. Do not add a "skip review" shortcut.

### Testing the parser

A real EPUB is at `sample/mwb_CH_202609.epub` (2026 Sept–Oct issue, Traditional Chinese). Use it to verify any parser changes. Run the dev server and test via the Import page UI — the parser runs in the browser so server-side scripts will not catch DOM-dependent bugs.

### Current backend shape

```
parseEpub(file) → review UI → onImportWeeks(weeks)
  → POST /api/midweek-weeks/import  (saves MidweekWeek + Part rows)
  → merged into midweekWeeks state

onPick(slotId, name)
  → if slotId starts with "mw": POST /api/assignments (upsert/delete)
  → if slotId starts with "we{id}_": PATCH /api/weekend-rows/{id} (update field)
  → name may be "" (AssignSheet "✕ 留空此項" / clear) → assignment row deleted,
    weekend field set to empty; toast reads 已清除指派

saveMidweekWeek(weekObj)            ← called on edit-mode exit (✓ 完成)
  → PATCH /api/midweek-weeks/{id}   (week fields + all parts in one transaction)
  → NOTE: sends p.dbId (numeric), NOT p.id (partKey string) for parts

deleteMidweekWeek(weekId)           ← admin only
  → DELETE /api/midweek-weeks/{id}

addWeekendRow(type)
  → POST /api/weekend-rows (create; date defaults to last row + 7 days)

deleteWeekendRow(rowId)
  → DELETE /api/weekend-rows/{rowId}

persistWeekendField(rowId, field, value)
  → PATCH /api/weekend-rows/{rowId} (called from edit mode for text fields + type toggle)

fetchMidweekSuggestions(weekId)     ← ✦ button in midweek navstrip
  → POST /api/suggest/midweek-week  (sends filtered assignments for that week)
  → setSuggestions(prev => ({ ...prev, ...result }))

fetchWeekendSuggestions(rowId, existing)  ← ✦ button per weekend row
  → POST /api/suggest/weekend-row
  → setSuggestions(prev => ({ ...prev, we{rowId}_speaker: ..., ... }))

acceptSuggestion(slotId, name)      ← ghost pill ✓ button
  → removes from suggestions state
  → calls onPick (persists to DB, shows undo toast)

acceptAllSuggestions(prefix)        ← toolbar 接受全部
  → batch: setAssignments + persist all + single undo toast

GET /api/congregations/data (on mount)
  → returns { midweekWeeks, weekendRows, people, congregation }
  → all set into React state; week auto-set via findCurrentWeekIndex
  → congregation.code stored in congCode state (used for iCal UIDs)
```

**All data is now persisted to DB.** No remaining "state only" items.

### WeekendRow `type` values

| type | Rendering |
|---|---|
| `schedule` | Normal white row (default) |
| `special` | Red-tinted row — for special talks, circuit overseer visits |
| `event` | Beige full-width banner — for conventions, special events (no speaker fields) |
| `suspended` | Red full-width banner — for 本週聚會暫停, cancelled meetings |

Type is toggled via a chip button in weekend edit mode. Persists to DB via `persistWeekendField`.

### Suggestion engine (`app/lib/suggest.js`)

Pure function library — no DB, no fetch, no React. Two exports:

**`suggestWeekendRow(people, pastRows, existing = {})`**
- Suggests `{ speaker, chair, wt, read }` for a new weekend row
- `existing` names pre-populate `used` Set to avoid double-assigning already-filled slots
- History: scans `pastRows` per field to build recency data

**`suggestMidweekWeek(people, week, existingAssignments, pastHistory)`**
- `week` = frontend shape `{ id, treasures, ministry, living }` with parts having `.id` (partKey) and `.cat`
- `existingAssignments` = `{ [slotId]: name }` — slots already confirmed (skipped)
- `pastHistory` = `[{ name, cat, date }]` built in the API route by joining assignments → parts
- Returns `{ [slotId]: name }` for all empty slots

**Core algorithm (`rankCandidates`)**:
1. Filter active members by qualification tag + gender from `CAT_REQS`
2. Score each: `daysSince` = days since last assigned to this cat (9999 if never)
3. Sort: `daysSince` descending, total count ascending as tiebreaker
4. `pickOne` walks ranked list, skips names already in `used` Set

**`CAT_REQS` maps part category → `{ tag, g }`** — must stay in sync with `CATS` in `app/data/index.js`.

### Ghost suggestion state (`app/page.js`)

`suggestions: { [slotId]: name }` — separate from `assignments`. Rules:
- `getSuggestion(slotId)` returns null if `assignments[slotId]` exists (real assignment takes precedence)
- Accepting a ghost calls `onPick` (same DB persist + undo toast path as manual picks)
- Ghosts clear on edit-mode exit (`clearSuggestions(prefix)`) and week navigation
- `ghostProps = { getSuggestion, onAccept, onClear }` spread into `sharedProps` and through component tree

### iCal export (`app/lib/icalExport.js`)

Pure client-side generator. Key details:
- **Timezone:** `Asia/Taipei` (UTC+8, no DST) — hardcoded for Taiwan
- **Midweek time:** extracted from `weekdayPill` (e.g. `"星期三 · 19:30"`) → 19:30
- **Weekend time:** defaults to 10:00 (Sunday morning)
- **Duration:** 1h45m per event
- **UID:** `{YYYYMMDD}-{encodedRole}-{encodedName}@{congCode}` — stable across re-exports so Outlook deduplicates
- Triggered from PeoplePage 未來安排 section ("↓ iCal (N)"); downloads `{name}-schedule.ics`

### PeoplePage writes are serialized + optimistic

Member edits (`updateSelected` → `persistPerson`) are queued on a `writeChainRef`
promise chain so overlapping PATCHes apply in order. **Do not apply the PATCH
response back into `people` state** — the optimistic local update is authoritative.
Applying a stale/out-of-order response is what made qualifications "deselect on
their own" when toggled quickly. If you need server-canonical data, reload via
`/api/congregations/data`, not the per-write response.

### Export helpers (`app/lib/midweekExport.js`)

- **Silent PDF, no popup.** `jpegImagesToPdfBlob(images)` hand-builds a multi-page
  PDF in the browser (baseline JPEG embedded with `DCTDecode`, fit to A4) and
  `triggerDownload` saves it. Do **not** reintroduce a `window.open(...).print()`
  flow for PDF — browsers block it.
- **Text export.** `buildWeekText(week, getAssign)` returns a plain-text schedule
  for pasting into LINE manually (meetings 複製文字 menu item).
- **Multi-week / range.** `exportWeeks{Jpeg,Pdf,Xlsx}` and `openWeeksPrintWindow`
  build off `renderWeekToCanvas` (canvas, no DOM node) so ImportPage can export a
  range of weeks without a rendered card on screen. ImportPage filters
  `existingWeeks` by the 範圍 selector (全部/本月/自訂) and needs the `getAssign`
  prop so exports reflect current assignments.

### PWA / service worker

`app/manifest.js` (Next 16 app-router manifest convention) + `public/sw.js` +
`components/PWARegister.js` make the app installable. The worker is **network-first**
and must **never cache `/api/`** requests (fresh auth + data). Bump the `CACHE`
constant in `sw.js` when changing caching behaviour so old caches are purged on
`activate`.

### Dev-server gotcha (this environment)

`next dev` may fail with `--env-file is not allowed in NODE_OPTIONS` under Node 22 /
Next 16. This is an environment quirk, not a code bug. When you can't boot the dev
server, syntax-check changed files with `tsc --noEmit --allowJs --checkJs false --jsx
preserve --ignoreConfig <files>` instead.
