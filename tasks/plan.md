# Implementation Plan: Midweek Week Type + Label

## Overview

Add two optional fields to `MidweekWeek` — `type` (`normal` | `special` | `assembly`) and `label` (free text, e.g. "區域大會") — so admins can mark convention/assembly weeks and special-visit weeks. The card changes visually based on type: `special` gets an amber header accent + badge; `assembly` gets a muted header + faint overlay on the parts. Both types still show all part slots (for reference). Edit UI lives in the midweek navstrip (edit mode only).

## Architecture Decisions

- **Two fields, not one**: `type` drives the visual style; `label` is the human-readable badge. Separating them means the label is free text (no hardcoded enum labels) and the visual behaviour is predictable.
- **Schema-first**: Prisma `db push` adds the columns with safe defaults (`type` defaults to `"normal"`, `label` nullable). No migration files needed — consistent with the project's existing approach.
- **API white-list**: `type` and `label` are added to `WEEK_FIELDS` in the PATCH route — no new endpoint needed.
- **State flows through existing path**: `updateMidweekWeek` / `saveMidweekWeek` in `page.js` already serialize all week fields; adding `type`/`label` to the payload is a one-liner.
- **Card visuals via CSS modifier classes**: `card--special` and `card--assembly` on the `<article>` element — no inline styles, consistent with existing `.is-special` / `.is-suspended` patterns in `WeekendView`.

## Dependency Graph

```
prisma/schema.prisma  (add type, label fields)
        │
        ├── app/api/midweek-weeks/[id]/route.js  (WEEK_FIELDS whitelist)
        │       │
        │       └── app/page.js  (saveMidweekWeek payload)
        │               │
        │               └── app/components/MeetingsPage.js  (navstrip type selector)
        │                       │
        │                       └── app/components/MidweekWeek.js  (card visuals)
        │                               │
        │                               └── app/globals.css  (card--special, card--assembly styles)
        │
        └── app/api/congregations/data/route.js  (already returns full week — no change needed)
```

## Task List

### Phase 1: Data Foundation

#### Task 1: Schema — add `type` and `label` to `MidweekWeek`

**Description:** Add two fields to `prisma/schema.prisma`. Run `prisma db push` locally to verify the migration is clean.

**Acceptance criteria:**
- [ ] `MidweekWeek` has `type String @default("normal")` and `label String?`
- [ ] `prisma db push` completes without errors locally
- [ ] Existing rows get `type = "normal"`, `label = null`

**Verification:**
- `npx prisma db push` exits 0

**Dependencies:** None  
**Files:** `prisma/schema.prisma`  
**Scope:** XS

---

#### Task 2: API + state — persist `type` and `label`

**Description:** Add `"type"` and `"label"` to `WEEK_FIELDS` in the PATCH route. Update `saveMidweekWeek` in `page.js` to include them in the request body. Coerce empty label string to `null` server-side.

**Acceptance criteria:**
- [ ] `PATCH /api/midweek-weeks/:id` with `{ type: "special", label: "分區大會" }` updates the DB row
- [ ] `PATCH` with `{ label: "" }` stores `label = null`
- [ ] `GET /api/congregations/data` returns `type` and `label` on each week (no route change — Prisma returns all fields automatically)

**Verification:**
- [ ] `npm run build` clean
- [ ] Network tab: save a week → confirm `type`/`label` in request body and DB round-trip on reload

**Dependencies:** Task 1  
**Files:** `app/api/midweek-weeks/[id]/route.js`, `app/page.js`  
**Scope:** S

---

### Checkpoint A — Foundation ready
- [ ] Build passes, `type`/`label` round-trip to DB
- [ ] No visual change yet — safe to deploy at this point

---

### Phase 2: Edit UI

#### Task 3: Navstrip type selector + label input (edit mode only)

**Description:** In `MeetingsPage.js`, inside the edit-mode section of the midweek navstrip, add three type chips (一般 / 探訪 / 大會) and a conditional text input for the label (shown when type ≠ `"normal"`). Selecting a chip calls `updateMidweekWeek` immediately; saving on edit-mode exit persists via existing `saveMidweekWeek`.

Label input placeholder:
- `special` → "分區監督探訪、總部代表…"
- `assembly` → "區域大會、分區大會…"

**Acceptance criteria:**
- [ ] Three chips render in navstrip only when `editMode` is true
- [ ] Clicking a chip updates local week state immediately (optimistic)
- [ ] Label input appears for `special`/`assembly`, hidden for `normal`
- [ ] Exiting edit mode saves `type` + `label` to DB
- [ ] Chips and input are mobile-friendly (wrap if needed)

**Verification:**
- [ ] `npm run build` clean
- [ ] Manual: enter edit mode → pick "大會" → type "區域大會" → exit → reload → type + label persisted

**Dependencies:** Task 2  
**Files:** `app/components/MeetingsPage.js`  
**Scope:** S

---

### Phase 3: Card Visuals

#### Task 4: CSS classes + card visual rendering

**Description:** Add `.card--special` and `.card--assembly` CSS modifier classes. Update `MidweekWeek.js` to apply the correct class to `<article>` and render a read-only type badge in the header.

**Visual spec:**

| Type | `.mw-head` | Badge | Parts |
|---|---|---|---|
| `normal` | unchanged | none | normal |
| `special` | 4px amber left border + `--ministry-soft` tint on header bg | amber pill with label | normal, fully interactive |
| `assembly` | muted blue-grey left border + `--surface-2` header bg | blue-grey pill with label | `opacity: 0.55` on sections, slots still rendered |

Badge position: inside `mw-head__sub`, between `weekday-pill` and the reading line. Hidden when label is empty/null.

**Acceptance criteria:**
- [ ] `card--special` shows amber accent + badge
- [ ] `card--assembly` shows muted header + faint sections + badge
- [ ] `normal` has no visual change
- [ ] Badge hidden when label is null/empty
- [ ] Works on desktop and mobile
- [ ] JPG export captures the badge

**Verification:**
- [ ] `npm run build` clean
- [ ] Mark a week as each type, confirm colours match spec
- [ ] Export JPG, confirm badge visible in image

**Dependencies:** Task 3  
**Files:** `app/components/MidweekWeek.js`, `app/globals.css`  
**Scope:** M

---

### Checkpoint B — Feature complete
- [ ] Full edit → save → reload → visual round-trip works
- [ ] Build clean, all types render correctly
- [ ] JPG export looks right
- [ ] Ready for `fly ssh console -C "npx prisma db push"` on prod

---

## Post-deploy step (manual)

```bash
fly ssh console -C "npx prisma db push"
```
Backfills existing rows with `type = "normal"`, `label = null` safely.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `prisma db push` on prod times out (Neon cold-start) | Med | Run manually post-deploy as always |
| Label input breaks navstrip layout on mobile | Low | Render input below chips, full-width |
| Assembly opacity makes assignment pills unreadable | Med | Start at 0.55, tune upward if needed |
| EPUB re-import overwrites type/label | Low | Import route uses upsert — preserve existing type/label if week date already exists |
