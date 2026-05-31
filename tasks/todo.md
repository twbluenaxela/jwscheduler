# Todo: Persist Meeting Page Changes

## Phase 1: Assignments

- [ ] Task 1: `POST /api/assignments` — upsert/delete assignment by slotId
- [ ] Task 2: Load assignments into state on mount; wire onPick + undo to persist

### Checkpoint
- [ ] Pick → refresh → still assigned
- [ ] Undo → refresh → slot empty

## Phase 2: Inline Edits

- [ ] Task 3: `PATCH /api/midweek-weeks/[id]` + debounced save wired into updateMidweekWeek

### Checkpoint
- [ ] Edit title → refresh → still edited
- [ ] Edit song → refresh → still edited
- [ ] Export still works
