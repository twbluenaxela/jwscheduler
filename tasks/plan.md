# Implementation Plan: Persist Meeting Page Changes

## Overview

Two categories of changes on the meeting page are currently lost on refresh:

1. **Assignments** — who is assigned to each slot (chairman, prayers, parts). Stored in `assignments` state in `page.js`. The `Assignment` DB model and schema already exist. The `congregations/data` GET route already reads and embeds assignments into the week objects it returns — so load is almost free.

2. **Inline edits** — talk titles, song numbers, dates, times, durations, reading text, etc. edited in edit mode. All routed through `updateMidweekWeek` in `page.js`, which updates `midweekWeeks` state only. No PATCH endpoint exists yet for weeks or parts.

## Architecture Decisions

- **Assignments API**: single `POST /api/assignments` endpoint — upsert when `name` is non-empty, delete when `name` is `''`. No separate DELETE route needed.
- **Assignments load**: populate the `assignments` state map on mount from the week objects already returned by `congregations/data` (no extra API call needed). This makes undo/redo consistent — the state map is always authoritative.
- **Week/part edits API**: single `PATCH /api/midweek-weeks/[id]` endpoint that accepts a partial week patch (top-level week fields) and/or a `parts` array of `{ partKey, ...patch }`. One round-trip covers all edits on a week.
- **Debounce on edits**: fire PATCH 600ms after the last keystroke per week, not on every character. Implemented with a `useRef` debounce timer in `page.js`.
- **Assignments are separate from edits**: assignments go through `/api/assignments` (immediate, on pick/undo); week text edits go through `/api/midweek-weeks/[id]` (debounced).

## Dependency Graph

```
Prisma Assignment model (already exists)
    │
    └── POST /api/assignments          ← Task 1
            │
            └── onPick + undo wiring   ← Task 2
                    │
                    └── assignments loaded on mount  ← Task 2 (also)

Prisma MidweekWeek + Part models (already exist)
    │
    └── PATCH /api/midweek-weeks/[id]  ← Task 3
            │
            └── updateMidweekWeek debounce wiring   ← Task 3 (also)
```

---

## Tasks

### Task 1: POST /api/assignments — save or clear a single assignment

**Description:** Create `app/api/assignments/route.js`. Accepts `{ slotId, name }`. Extracts weekId from slotId (`mw{id}_...`), verifies the week belongs to the caller's congregation, then upserts or deletes the Assignment row.

**Acceptance criteria:**
- [ ] `POST /api/assignments` with `{ slotId: 'mw5_chairman', name: '王小明' }` upserts a row with `slotId='mw5_chairman'`, `weekId=5`, `name='王小明'`
- [ ] `POST /api/assignments` with `{ slotId: 'mw5_chairman', name: '' }` deletes any existing row for that slotId
- [ ] Returns 403 if the week belongs to a different congregation
- [ ] Returns 400 if slotId doesn't match `mw{digits}_` prefix

**Verification:**
- [ ] `curl -X POST /api/assignments` with valid token and body returns `{ ok: true }`
- [ ] Row appears/disappears in DB

**Dependencies:** None (schema already exists)

**Files touched:**
- `app/api/assignments/route.js` (new)

**Estimated scope:** S

---

### Task 2: Wire assignments — load on mount + save on pick/undo

**Description:** In `page.js`, (a) after loading weeks on mount, populate the `assignments` state map by extracting all non-empty assignment values from the week objects; (b) in `onPick`, fire `persistAssignment(slotId, name)` after updating state; (c) in the undo handler, fire `persistAssignment(slotId, prevName ?? '')`.

`persistAssignment` is a fire-and-forget async helper that calls `POST /api/assignments` and shows a toast on error.

**Acceptance criteria:**
- [ ] On page load, assigned slots are already filled in (no reload needed to see DB assignments)
- [ ] Picking an assignment persists across a hard refresh
- [ ] Undoing a pick reverts correctly in the DB (previous name restored, or row deleted if slot was previously empty)
- [ ] A network error on save shows a toast but doesn't break the UI

**Verification:**
- [ ] Pick a name → hard-refresh → name is still shown
- [ ] Pick a name → undo → hard-refresh → slot is empty again

**Dependencies:** Task 1

**Files touched:**
- `app/page.js`

**Estimated scope:** S

---

### Checkpoint: Assignments

- [ ] Hard-refresh after assigning a name shows the assignment
- [ ] Undo then hard-refresh: slot is empty
- [ ] No console errors

---

### Task 3: PATCH /api/midweek-weeks/[id] + wire debounced saves for inline edits

**Description:** Create `app/api/midweek-weeks/[id]/route.js` with a `PATCH` handler. Body: `{ weekPatch?, parts? }` where `weekPatch` is a partial update to week-level fields (date, weekdayPill, reading, openSong, midSong, closeSong, openIntroTime, midSongTime, closingTime, closingDur, closeSongTime) and `parts` is an array of `{ partKey, time?, title?, dur? }` to update individual parts.

In `page.js`, add a `debounceWeekSave` function: each call for a given `weekId` resets a 600ms timer, then fires the PATCH with accumulated changes since the last save. Wire this into `updateMidweekWeek` so any edit automatically queues a debounced save.

**Acceptance criteria:**
- [ ] Editing a talk title in edit mode → hard-refresh → title is preserved
- [ ] Editing a song number → hard-refresh → song number is preserved
- [ ] Editing a part time → hard-refresh → time is preserved
- [ ] Rapid keystrokes produce at most one PATCH per 600ms per week
- [ ] Returns 403 if week belongs to different congregation

**Verification:**
- [ ] Edit "開場唱詩" song number → refresh → still correct
- [ ] Edit a part title → refresh → still correct
- [ ] Check network tab: keystrokes don't fire a request per character

**Dependencies:** None (independent of Tasks 1–2)

**Files touched:**
- `app/api/midweek-weeks/[id]/route.js` (new)
- `app/page.js`

**Estimated scope:** M

---

### Checkpoint: Complete

- [ ] All three persistence paths work end-to-end with hard refreshes
- [ ] No regressions in EPUB import (imported weeks still display correctly)
- [ ] Export (JPG/Excel) still works on a week with persisted edits

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Race condition: debounced PATCH fires while another import replaces weeks | Low | Import replaces weeks by re-running `saveImportedWeeks`; new week IDs make old debounce timers stale and harmless |
| Undo fires persistAssignment after component unmounts | Low | Fire-and-forget — no state update in the callback, so no React error |
| weekId parsed from slotId is wrong format | Low | Validate in API with 400 response; log client-side |

## Open Questions

- None — scope is well-defined. No schema changes needed.
