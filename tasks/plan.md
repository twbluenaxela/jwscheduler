# Implementation Plan: Phase 4 (Suggestions) + Phase 5 (iCal Export)

## Overview

### Phase 4 — Algorithm-based Assignment Suggestions
A rotation-fairness engine that suggests names for empty slots in both midweek and weekend views. Suggestions appear as **ghost pills** — visually distinct (dashed border, muted colour) with per-slot ✓ accept and ✕ clear, plus batch accept/clear in the toolbar. Pure recency + count scoring — no AI, no external calls.

Also fixes two pre-existing bugs found during planning:
- **`saveMidweekWeek` part-ID bug**: sends `p.id` (partKey string like `"t0"`) — route does `Number(p.id)` → NaN → silent fail. Must use `p.dbId`.
- **Default date for new weekend rows**: created with `date: ''`; should default to last row's date + 7 days.

### Phase 5 — iCalendar Export
Export any person's upcoming assignments as a `.ics` file directly importable into Outlook, Google Calendar, Apple Calendar, etc. Pure client-side generation — no server, no library, no token cost. Triggered from the People page detail panel.

---

## Architecture Decisions

### Phase 4

- **Ghost state in `page.js`** as `suggestions: { [slotId]: name }` alongside `assignments`. Ghost auto-hides when real assignment exists for that slot (`getSuggestion` checks `assignments[slotId]` first).
- **Accept flows through existing `onPick`** — same DB persist path, same undo toast. No new persist logic.
- **Suggest API is server-side** — DB queries stay off client, nothing leaks into the bundle.
- **`suggest.js` is pure** — no DB, no fetch, no React. Fully testable by reading the file.
- **Ghost props bundled** as `ghostProps = { getSuggestion, onAccept, onClear }` to limit prop-name changes.
- **Weekend ✦ per-row** (rows are independent). **Midweek ✦ per-week** (fill all empty slots at once).
- **Ghosts clear on edit-mode exit** — prevents stale suggestions appearing after an accept session.
- **Accept all** = single toast with batch undo (simpler than per-slot undo).

### Phase 5

- **Client-side `.ics` generation** in `app/lib/icalExport.js` — pure function, no dependencies.
- **Per-person export** from the People page detail panel — consistent with where assignments are already displayed.
- **Upcoming only** — past events clutter calendars; exclude dates before today.
- **Includes both midweek and weekend** assignments.
- **Taiwan timezone hardcoded** (`Asia/Taipei`, UTC+8, no DST) — congregation is in Taiwan.
- **Meeting times**:
  - Midweek: parse `weekdayPill` (e.g., `"星期三 · 19:30"`) for day + time; duration 1h45m.
  - Weekend: Sunday 10:00 by default; duration 1h45m.
- **UID format**: `jwscheduler-{slotId}@{congregationCode}` — stable across regenerations so Outlook deduplicates.

---

## Dependency Graph

```
Phase 4:
  app/lib/suggest.js            (pure — no deps)
        │
        ├── api/suggest/weekend-row    ─→  WeekendView ✦ button
        └── api/suggest/midweek-week   ─→  MeetingsPage ✦ button

  app/page.js  (suggestions state + callbacks)
        │
        ├── MidweekWeek.js  ─→  WhoSlot / PairSlot  (ghost rendering)
        └── WeekendView.js  ─→  NamePill             (ghost rendering)

Phase 5:
  app/lib/icalExport.js         (pure — no deps)
        │
        └── PeoplePage.js  (export button in detail panel)
```

Build order within each phase: pure lib → API/util → state/wiring → CSS → rendering → trigger UI.

---

## Task List

---

### Phase 0: Pre-requisite Fixes

#### Task 0a: Fix `saveMidweekWeek` part-ID bug

**Description:** `page.js` ~line 291 maps parts as `{ id: p.id, ... }` where `p.id` is the partKey string (e.g. `"t0"`). The PATCH route does `Number(p.id)` → `NaN` → `db.part.update` silently fails. Fix: send `{ id: p.dbId, ... }` (the numeric DB id stored in `p.dbId` by `mapPart`).

**Acceptance criteria:**
- [ ] `saveMidweekWeek` sends `id: p.dbId` (number) for each part in the `parts` array
- [ ] Part edits survive a hard reload after clicking ✓ 完成

**Verification:**
- [ ] `npm run build` passes
- [ ] Manual: edit a part title → ✓ 完成 → hard reload → title still shows changed value

**Files:** `app/page.js` (1 line)  
**Scope:** XS  
**Dependencies:** None

---

#### Task 0b: Default date for new weekend rows

**Description:** `addWeekendRow` creates rows with `date: ''`. Compute a default: find the last weekend row with a parseable `M/D` date, add 7 days, format as `M/D`. Fallback when none found: next Sunday from today. Add `weekendRows` to `useCallback` deps so the closure captures current state.

**Acceptance criteria:**
- [ ] New row date = last row's date + 7 days in `M/D` format
- [ ] When no rows have a parseable date, falls back to next Sunday
- [ ] Date is editable immediately after creation

**Verification:**
- [ ] `npm run build` passes
- [ ] Manual: add weekend row in edit mode → date pre-filled correctly

**Files:** `app/page.js` (`addWeekendRow` function)  
**Scope:** XS  
**Dependencies:** None

---

### Checkpoint 0
- [ ] Build passes clean
- [ ] Part title edit survives reload
- [ ] New weekend row has correct default date

---

### Phase 1: Suggestion Engine

#### Task 1: `app/lib/suggest.js`

**Description:** Pure function library. Exports `suggestWeekendRow` and `suggestMidweekWeek`.

Core algorithm (`rankCandidates`):
1. Filter active members by qualification tag + gender
2. For each candidate, find days since last assigned to this role (9999 if never)
3. Sort descending by days-since, ascending by total count as tiebreaker
4. `pickOne` walks the ranked list and returns the first name not in the `used` Set

Qualification map (`CAT_REQS`) mirrors `CATS` in `app/data/index.js`:
```
chairman → tag:'主席', g:'M'
prayer   → tag:'禱告', g:'M'
treasures→ tag:'寶藏演講', g:'M'
gems     → tag:'經文寶石', g:'M'
reading  → tag:'經文朗讀', g:'M'
ministry → tag:'傳道示範', g:'any'
living   → tag:'生活演講', g:'M'
cbs      → tag:'研經班主持', g:'M'
cbsread  → tag:'研經班朗讀', g:'M'
publictalk→tag:'公眾演講', g:'M'
wt       → tag:'主席', g:'M'
wtread   → tag:'守望台朗讀', g:'any'
```

`suggestWeekendRow(people, pastRows, existing={})` → `{ speaker, chair, wt, read }` (null for unresolvable)
`suggestMidweekWeek(people, week, existingAssignments, pastHistory)` → `{ [slotId]: name }`

People input: `{ name, g, quals: string[], status }`. History input: `{ name, date }[]`.

Date parsing handles both `"6月 3日"` (Chinese) and `"8/9"` (slash) with year inference (±6-month window).

**Acceptance criteria:**
- [ ] Member never assigned to a role ranks above member assigned 1 week ago
- [ ] `existing` names pre-populate `used` Set → not re-suggested
- [ ] `status !== 'active'` members excluded
- [ ] Gender filter: `g:'M'` excludes sisters; `g:'any'` includes all
- [ ] No name appears twice in the output for one row/week

**Verification:**
- [ ] `npm run build` passes
- [ ] Mental trace: 3 qualified brothers, last assignments 4w/2w/never → never-assigned picked first

**Files:** `app/lib/suggest.js` (new)  
**Scope:** S  
**Dependencies:** None

---

### Checkpoint 1
- [ ] Build passes
- [ ] Ranking logic verified by mental trace

---

### Phase 2: API Routes

#### Task 2a: `POST /api/suggest/weekend-row`

**Description:** Auth-gated. Loads active people + all non-event/non-suspended weekend rows. Normalises people to `{ name, g, quals, status }` (DB uses `gender`/`tags`). Accepts optional body `{ existing: { speaker, chair, wt, read } }`. Returns `{ suggestion: { speaker, chair, wt, read } }`.

**Acceptance criteria:**
- [ ] 403 when not in a congregation
- [ ] Filters out `type === 'event'` and `type === 'suspended'` from history
- [ ] At most 4 distinct names in result
- [ ] Names in `existing` not returned

**Verification:**
- [ ] `npm run build` passes
- [ ] `curl` with valid token returns `{ suggestion: {...} }`

**Files:** `app/api/suggest/weekend-row/route.js` (new)  
**Scope:** S  
**Dependencies:** Task 1

---

#### Task 2b: `POST /api/suggest/midweek-week`

**Description:** Auth-gated. Body: `{ weekId, assignments: { [slotId]: name } }`. Loads target week with parts, all other weeks with their parts+assignments, and active people. Builds `pastHistory: { name, cat, date }[]` by parsing slotIds against part maps (chairman/openPrayer/closePrayer handled separately). Returns `{ suggestions: { [slotId]: name } }`.

SlotId patterns:
- `mw{N}_chairman` → `cat: 'chairman'`
- `mw{N}_openPrayer` / `closePrayer` → `cat: 'prayer'`
- `mw{N}_{partKey}_{0|1}` → `cat` from `Part.cat` via partKey lookup

**Acceptance criteria:**
- [ ] 404 when weekId not found in congregation
- [ ] Only returns slots not present in `assignments` param
- [ ] `pastHistory` correctly resolves cat for all slot types
- [ ] No person appears twice in the returned suggestions

**Verification:**
- [ ] `npm run build` passes
- [ ] `curl` with real weekId returns slotId-keyed suggestions

**Files:** `app/api/suggest/midweek-week/route.js` (new)  
**Scope:** M  
**Dependencies:** Task 1

---

### Checkpoint 2
- [ ] Both routes return valid JSON with real auth
- [ ] No cross-congregation data

---

### Phase 3: Ghost State in `page.js`

#### Task 3: Suggestions state + all callbacks

**Description:** Add `const [suggestions, setSuggestions] = useState({})`. Define:

- `getSuggestion(slotId)` — returns `suggestions[slotId]` only when `!assignments[slotId]`
- `acceptSuggestion(slotId, name)` — remove from suggestions, call `onPick(slotId, name, assignments[slotId] ?? '')`
- `clearSuggestion(slotId)` — remove from suggestions only
- `acceptAllSuggestions(prefix)` — batch: setAssignments, setSuggestions, persist each, single toast with undo
- `clearAllSuggestions(prefix?)` — clear all suggestions matching prefix (or all)
- `fetchWeekendSuggestions(rowId, existing)` — POST suggest/weekend-row, set `we{rowId}_*` keys in suggestions
- `fetchMidweekSuggestions(weekId)` — POST suggest/midweek-week with filtered assignments, set returned suggestions

Bundle: `ghostProps = { getSuggestion, onAccept: acceptSuggestion, onClear: clearSuggestion }`.

Add to `sharedProps`: `...ghostProps`.
Add to `weekendProps`: `fetchWeekendSuggestions`.
Pass separately to MeetingsPage: `fetchMidweekSuggestions`, `acceptAllSuggestions`, `clearAllSuggestions`, `suggestions`.

Also: call `clearAllSuggestions()` when `setEditMode(false)` is triggered (both midweek and weekend).

**Acceptance criteria:**
- [ ] `getSuggestion` returns null when real assignment exists
- [ ] `acceptSuggestion` fires `onPick` (DB persist + toast)
- [ ] `fetchMidweekSuggestions` only sends `mw{weekId}_*` keys to API, not full assignments map
- [ ] Suggestions cleared on edit-mode exit

**Verification:**
- [ ] `npm run build` passes
- [ ] No runtime errors when actions called with empty suggestions

**Files:** `app/page.js`, `app/components/MeetingsPage.js` (edit-mode exit hook)  
**Scope:** M  
**Dependencies:** Tasks 2a, 2b

---

### Checkpoint 3
- [ ] Build passes
- [ ] State wiring confirmed in browser console

---

### Phase 4: Ghost Rendering

#### Task 4a: Ghost `WhoSlot` in `MidweekWeek.js`

**Description:** `WhoSlot` gains optional `getSuggestion`, `onAccept`, `onClear` props. When `getSuggestion(slotId)` returns a name and no real assignment exists, render:
```jsx
<span className="who who--ghost">
  <span className="who__ghost-name">{ghost}</span>
  <button className="who__ghost-btn" onClick={() => onAccept(slotId, ghost)}>✓</button>
  <button className="who__ghost-btn who__ghost-btn--clear" onClick={() => onClear(slotId)}>✕</button>
</span>
```
Thread `ghostProps` through `PairSlot`, `PartRow`, and `MidweekWeek` prop signatures.

**Acceptance criteria:**
- [ ] Ghost pill renders when suggestion exists and no real assignment
- [ ] ✓ → `onAccept` → normal `onPick` flow (assignment filled, toast)
- [ ] ✕ → `onClear` → reverts to 未指派
- [ ] Normal rendering unchanged when `getSuggestion` not provided or returns null

**Verification:**
- [ ] `npm run build` passes
- [ ] Manual: trigger midweek suggestion → ghost pills appear on empty slots → accept one → filled, toast appears

**Files:** `app/components/MidweekWeek.js`  
**Scope:** M  
**Dependencies:** Task 3

---

#### Task 4b: Ghost `NamePill` in `WeekendView.js`

**Description:** `NamePill` gains same optional ghost props. Ghost rendering matches WhoSlot pattern. Also update mobile card `getAssign(...)` calls for speaker/chair/wt/read to check ghost state and render ghost inline name + ✓/✕ when suggestion exists. Thread `ghostProps` through `WeekendView` signature.

**Acceptance criteria:**
- [ ] Ghost NamePill renders in desktop table
- [ ] Ghost also shows in mobile card view for same slot
- [ ] Accept/clear work in both table and card
- [ ] No ghost shown when real assignment exists

**Verification:**
- [ ] `npm run build` passes
- [ ] Manual: trigger weekend suggestion → ghost visible in table AND mobile card

**Files:** `app/components/WeekendView.js`  
**Scope:** M  
**Dependencies:** Task 3

---

#### Task 4c: Ghost CSS

**Description:** Add to `globals.css` (above final `@media` block):
- `.who--ghost` — inline-flex, dashed 1px `var(--accent)` border, `var(--accent-soft)` background, `var(--accent)` text
- `.who__ghost-name` — italic, font-size inherited
- `.who__ghost-btn` — small (18px), no border/bg, cursor pointer; ✓ hover → green tint; ✕ hover → red tint
- `.name-pill--ghost` — same visual treatment as `.who--ghost` but pill-shaped (matching NamePill layout)

**Acceptance criteria:**
- [ ] Ghost pills visually distinct from confirmed (solid) and empty (muted) slots
- [ ] Buttons readable but unobtrusive at rest, coloured on hover
- [ ] No layout shift when ghost replaces empty slot

**Verification:**
- [ ] Visual check across midweek card and weekend table/card

**Files:** `app/globals.css`  
**Scope:** XS  
**Dependencies:** Tasks 4a, 4b (styles needed at same time)

---

### Checkpoint 4
- [ ] Build passes
- [ ] Ghost pills visible in both views; accept and clear work end-to-end
- [ ] Normal flow unchanged when no suggestions

---

### Phase 5: Trigger Buttons and Toolbar Actions

#### Task 5a: Midweek ✦ button + toolbar accept/clear

**Description:** In `MeetingsPage.js`:
- Add `✦` icon button in navstrip (after `−` delete button), only in edit mode. Click calls `fetchMidweekSuggestions(midweekWeeks[week].id)`. Show spinner while loading.
- In toolbar: add "接受全部" and "清除建議" buttons, visible only when `hasMidweekSuggestions` (any suggestion key starts with `mw${currentWeek.id}_`).
- "接受全部" calls `acceptAllSuggestions(`mw${currentWeek.id}_`)`.
- "清除建議" calls `clearAllSuggestions(`mw${currentWeek.id}_`)`.

**Acceptance criteria:**
- [ ] ✦ only visible in edit mode
- [ ] Loading spinner during API call; button disabled during load
- [ ] Accept/clear toolbar buttons only appear when suggestions exist for current week
- [ ] Accept all → single toast; all slots filled

**Verification:**
- [ ] `npm run build` passes
- [ ] Full flow: edit mode → ✦ → ghosts → 接受全部 → filled → toast → buttons disappear

**Files:** `app/components/MeetingsPage.js`, `app/page.js` (prop pass-through)  
**Scope:** M  
**Dependencies:** Tasks 3, 4a, 4c

---

#### Task 5b: Weekend ✦ per-row + toolbar accept/clear

**Description:** In `WeekendView.js`, add `✦` button in edit-mode action area of each schedule row (not event/suspended), between type-toggle and ✕. Click calls `fetchWeekendSuggestions(r._id, { speaker: r.speaker, chair: r.chair, wt: r.wt, read: r.read })`. Track loading state per row-id.

In `MeetingsPage.js` weekend toolbar: same "接受全部" / "清除建議" buttons when any `we*` suggestions exist.

**Acceptance criteria:**
- [ ] ✦ button only on schedule/special rows in edit mode (not event/suspended)
- [ ] Loading state per row while fetching
- [ ] Already-filled slots not overwritten (handled by `existing` param)
- [ ] Toolbar accept/clear work across all visible weekend ghosts

**Verification:**
- [ ] `npm run build` passes
- [ ] Manual: ✦ on row → ghosts appear for empty slots → accept → persists to DB

**Files:** `app/components/WeekendView.js`, `app/components/MeetingsPage.js`  
**Scope:** M  
**Dependencies:** Tasks 3, 4b, 4c

---

### Checkpoint 5
- [ ] Full Phase 4 flow works end-to-end in both views
- [ ] Ghosts clear on edit-mode exit
- [ ] No suggestions bleed between weeks or rows
- [ ] Build passes

---

### Phase 6: iCalendar Export

#### Task 6a: `app/lib/icalExport.js` — pure `.ics` generator

**Description:** Pure function. No React, no fetch. Exports `generateIcal(assignments, personName, congregationCode)` → string.

Input `assignments`: `[{ date, role, context, weekdayPill }]` (same shape as `collectUpcomingAssignments` in PeoplePage).

Each assignment → one `VEVENT`:
- `DTSTART`: parse date + time. Midweek: extract time from `weekdayPill` (e.g. `"星期三 · 19:30"` → `19:30`); default `19:30`. Weekend: `10:00`. Apply Taiwan UTC+8 offset.
- `DTEND`: DTSTART + 1h45m.
- `SUMMARY`: `{role}` (e.g. `主席`)
- `DESCRIPTION`: `{role} — {context}` (e.g. `主席 — 研究文章 15`)
- `UID`: `jwscheduler-{date}-{role}-{personName}@{congregationCode}` (URL-safe, stable for dedup)
- `ORGANIZER`: not needed (personal calendar)

Output wraps in `BEGIN:VCALENDAR` / `END:VCALENDAR` with `PRODID:-//JW Scheduler//新屋//ZH` and `VERSION:2.0`.

iCal date format: `YYYYMMDDTHHMMSS` (local time) with `TZID=Asia/Taipei`.

**Acceptance criteria:**
- [ ] Output is valid iCal — parseable by Outlook / Google Calendar
- [ ] Past assignments excluded (filter by today before calling)
- [ ] Each event has a stable UID (same person + date + role → same UID across exports)
- [ ] Handles both Chinese date format and `M/D` slash format

**Verification:**
- [ ] `npm run build` passes
- [ ] Import generated `.ics` into calendar app (or validator at ical.tools) — events appear correctly

**Files:** `app/lib/icalExport.js` (new)  
**Scope:** S  
**Dependencies:** None

---

#### Task 6b: Export button in PeoplePage detail panel

**Description:** Add "匯出 iCal" button to the 未來安排 section header in `PeoplePage.js`. On click:
1. Collect selected person's upcoming assignments (already computed as `upcoming`)
2. Call `generateIcal(upcoming, selectedPerson.name, congregation.code)`
3. Trigger download as `{name}-schedule.ics` using a Blob URL

The congregation code comes from `dbUser.congregationCode` or pass `congSettings.code` as a prop. If unavailable, fall back to `"jwscheduler"`.

Also add a small count badge: "匯出 iCal (N 項)" so the user knows what will be exported before clicking.

**Acceptance criteria:**
- [ ] Button only appears when `upcoming.length > 0`
- [ ] Download triggers `.ics` file with correct filename
- [ ] File contains one VEVENT per upcoming assignment
- [ ] After import into Outlook, events appear on correct dates with correct titles

**Verification:**
- [ ] `npm run build` passes
- [ ] Manual: select a person with upcoming assignments → click 匯出 iCal → `.ics` downloads → import into Outlook → events visible on correct dates

**Files:** `app/components/PeoplePage.js`, `app/page.js` (pass `congCode` prop)  
**Scope:** S  
**Dependencies:** Task 6a

---

### Checkpoint 6 (Final)
- [ ] Build passes clean
- [ ] Exported `.ics` imports cleanly into Outlook
- [ ] Events show correct date, time (19:30 or 10:00), and title
- [ ] No events for past assignments appear in calendar

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| partKey vs dbId confusion in suggest API | High | Normalise week shape in route; test with a real week that has known assignments |
| Ghost persists after manual pick via AssignSheet | Med | `getSuggestion` checks `assignments[slotId]` first — ghost auto-hides |
| Suggesting inactive member | Med | `status === 'active'` filter in `rankCandidates` |
| Weekend suggestion overwrites existing name | Med | `existing` param pre-populates `used` Set |
| iCal date off by one (timezone) | Med | Use explicit UTC+8 offset in DTSTART; test with Outlook |
| iCal UID collision (two people, same date+role) | Low | Include `personName` in UID |

## Open Questions

- **Phase 4**: Should ghosts clear when navigating to a different week? (Recommendation: yes — `clearAllSuggestions(mw${oldWeekId}_)` on week change)
- **Phase 6**: Should the export include a `LOCATION` field? (Congregation address not stored — skip for now, can add later)
- **Phase 6**: Export from Overview page too? (Nice-to-have — implement People page first, then reuse same function)
