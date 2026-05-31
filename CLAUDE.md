# CLAUDE.md — 新屋會眾聚會編排 Scheduler

Touch-friendly web app replacing the Excel scheduling workflow for 新屋 (Xinwu) congregation midweek and weekend meeting assignments. See `meeting-scheduler-plan.md` for full architecture decisions and phasing. See `agents.md` for planned Claude API integrations and AI-assisted workflows.

---

## Stack

- **Framework:** Next.js 15 (app router, `'use client'` root), React 19
- **Language:** JavaScript (no TypeScript yet)
- **Styling:** Single global CSS file (`app/globals.css`) — no CSS modules, no Tailwind
- **Font:** Noto Sans TC via `next/font/google`
- **Data:** Seed data only (`app/data/index.js`) — no backend yet; imported EPUB weeks live in React state
- **EPUB parsing:** `jszip` (client-side unzip) + browser `DOMParser` — no server needed
- **Deploy target:** fly.io + Postgres (Phase 2+)

---

## Project structure

```
app/
  page.js              — root component; all shared state lives here
  layout.js            — font loading, html/body wrapper
  globals.css          — full design system (tokens, all component styles)
  data/
    index.js           — seed data: midweekWeeks, weekendData, peopleData,
                         overviewData, POOL, CATS, candidates()
  lib/
    epubParser.js      — client-side EPUB parser (JSZip + DOMParser)
                         exports parseEpub(file) → week[] matching midweekWeeks shape
  components/
    Sidebar.js         — desktop left nav
    TopBar.js          — mobile top bar
    TabBar.js          — mobile bottom tab bar
    MeetingsPage.js    — tab switcher for midweek / weekend views; accepts midweekWeeks prop
    MidweekWeek.js     — single midweek week card with WhoSlot / PairSlot
    WeekendView.js     — weekend schedule table
    OverviewPage.js    — month overview list
    PeoplePage.js      — congregation member list
    ImportPage.js      — EPUB import UI: upload → parse → review → commit
                         accepts onImportWeeks(weeks[]) callback
    AssignSheet.js     — bottom-sheet candidate picker (modal)
    Toast.js           — undo toast notification
sample/
  mwb_CH_202609.epub   — sample JW workbook EPUB for local dev/testing
meeting-scheduler-plan.md  — full product spec and architecture decisions
agents.md              — Claude API integration plans and AI workflow notes
```

---

## State (all in `app/page.js`)

| State | Type | Purpose |
|---|---|---|
| `page` | string | active nav page (`meetings` / `overview` / `people` / `import`) |
| `view` | string | meetings sub-tab (`midweek` / `weekend`) |
| `week` | number | index into `midweekWeeks` array |
| `midweekWeeks` | array | week objects — initialized from seed data, replaced on EPUB import |
| `editMode` | boolean | toggles inline contentEditable on WhoSlots |
| `assignments` | `{[slotId]: name}` | overrides for all slots; persists across sheet opens |
| `sheet` | object\|null | open AssignSheet config: `{slotId, catKey, ctxLabel, defaultName}` |
| `toast` | object\|null | undo toast: `{msg, undo}` |

**`getAssign(slotId, defaultName)`** — reads from `assignments`, falls back to seed data default.

**`openSheet(slotId, catKey, ctxLabel, currentName)`** — opens the candidate picker sheet.

**`onPick(slotId, name, prevName)`** — commits an assignment, closes the sheet, shows undo toast.

---

## Slot ID convention

Slot IDs encode week + section + part position:

```
mw{weekId}_{section}          e.g. mw0_chairman, mw0_openPrayer, mw0_closePrayer
mw{weekId}_{partId}_0         e.g. mw0_t0_0  (single-person part)
mw{weekId}_{partId}_0         e.g. mw0_m0_0  (student of a pair)
mw{weekId}_{partId}_1         e.g. mw0_m0_1  (helper of a pair)
```

The **week prefix** is always `slotId.split('_')[0]` (e.g. `mw0`). This is used to detect same-week assignments.

---

## Data layer (`app/data/index.js`)

**`POOL`** — array of all congregation members eligible for assignments:
```js
{ n: "姓名", g: "M"|"F", a: "長老"|"助理僕人"|"傳道員"|"", t: ["tag1","tag2",...] }
```

**`CATS`** — maps `catKey` → category config:
```js
{ tag: "主席", g: "M"|"any", name: "顯示名稱" }
```

**`candidates(catKey, jitter, spread)`** — filters POOL by category, weights by days since last assignment (hashed), sorts descending. `spread` (1–3) controls fairness strength. Returns:
```js
{ ...person, d: daysSince, w: weight, recent: bool, load: quarterLoad }
```

---

## Design system (CSS tokens)

```css
--bg:        #ecebe7   /* page background */
--surface-1: #f5f4f1   /* card background */
--surface-2: #ece9e2   /* subtle fills */
--line:      #d9d5cc   /* borders */
--ink-1:     #1a1a1a   /* primary text */
--ink-2:     #5a5751   /* secondary text */
--ink-3:     #9c9790   /* muted text */
--accent:    #2f6f8f   /* interactive / recommended */
--accent-soft: rgba(47,111,143,.1)
--special:   #c23123   /* warnings / errors (red) */

/* Section band colours */
--treasures: #6f6f6f
--ministry:  #b58a08
--living:    #8c2b22
```

---

## AssignSheet — candidate picker

**Props:** `sheet`, `assignments`, `getAssign`, `onPick`, `onClose`

**Key behaviours:**
- Filters POOL by `catKey` eligibility and ranks by weighted fairness score
- Shows current assignee (`is-cur` class + "目前" badge)
- Shows people already assigned elsewhere **in the same week** (`is-used` class + red "本週已排" badge) — dimmed to 55% opacity but still selectable
- "重新推薦" reshuffle adds jitter to weights for variety
- "公平強度" slider controls `spread` exponent (1 = gentler, 3 = strongly prioritises long-absent)
- Manual name input + Enter/指派 button for external speakers or unlisted names
- Esc key closes; backdrop click closes

**Same-week detection logic:**
```js
const weekPrefix = sheet.slotId.split('_')[0];  // e.g. "mw0"
const usedThisWeek = new Set(
  Object.entries(assignments)
    .filter(([k, v]) => k !== sheet.slotId && k.startsWith(weekPrefix + '_') && v)
    .map(([, v]) => v)
);
```

---

## Candidate card CSS classes

| Class | Meaning |
|---|---|
| `.cand` | base candidate button |
| `.is-rec` | top recommended (accent border + soft bg) |
| `.is-cur` | currently assigned to this slot (inner shadow) |
| `.is-used` | assigned to another slot this week (dimmed 55%) |
| `.cur-tag` | grey "目前" chip in name row |
| `.used-tag` | red "本週已排" chip in name row |

---

## Eligibility rules (encoded in POOL tags + CATS)

- `g: "M"` — brothers only
- `g: "any"` — brothers and sisters (传道训练 `ministry` cat)
- Sisters in POOL have only `t: ["用心"]` — they qualify for ministry demonstrations only
- The `ministry` category (`tag: "用心"`) maps to both student and helper roles in 用心準備傳道工作

Full eligibility matrix (per S-38) is in `meeting-scheduler-plan.md §11`.

---

## Component patterns

**WhoSlot** (in `MidweekWeek.js`) — renders a tappable name that opens `AssignSheet`. In `editMode` renders as `contentEditable` for direct text override.

**PairSlot** (in `MidweekWeek.js`) — renders two `WhoSlot`s (`_0` student / `_1` helper) separated by `/`.

**Toast** — auto-dismisses; exposes `undo` callback that reverts the `assignments` state entry.

---

## What NOT to do

- Do not scrape jw.org / wol.jw.org (robots-disallowed, ToS prohibits)
- Do not auto-commit EPUB/image imports — always go through review screen first
- Do not remove the `'use client'` directive from `page.js` — it owns all interactive state
- Do not split state into multiple context providers yet — keep it flat in `page.js` until Phase 2 backend is wired

---

## Phase status

| Phase | Status |
|---|---|
| **Phase 1 — Frontend UI** | Done — full design system, all views, AssignSheet with weighted candidates, same-week conflict indicator, client-side EPUB import (parse → review → commit to state) |
| **Phase 2 — Backend** | Not started — Node API (Fastify/Express) + Postgres (Neon or Fly Postgres) + Prisma/Drizzle, persist EPUB imports, image/PDF via Claude API vision |
| **Phase 3 — Notifications** | Not started — LINE Messaging API push, .ics calendar feeds, Draft→Publish diff model |

---

## Recent changes

### EPUB import — client-side parsing (2026-05-31)
Admin uploads the JW Life and Ministry Meeting Workbook EPUB → app parses it in the browser → review screen → commit replaces `midweekWeeks` state.

**Files changed:**
- `app/lib/epubParser.js` *(new)* — `parseEpub(file)` uses JSZip to unzip, reads `META-INF/container.xml` → OPF → spine, skips non-week pages (cover, toc, extracted-scripture files), parses each week XHTML with `DOMParser`. Extracts: date, reading, 3 songs, all parts with titles/durations/categories. Calculates meeting times from a 19:30 default start.
- `app/components/ImportPage.js` — full rewrite; state machine `upload → parsing → review → done`; real file input + drag-and-drop; `WeekReviewCard` component (expandable per-week preview); wires `onImportWeeks` callback.
- `app/page.js` — `midweekWeeks` lifted to state (was a static import); on import: replaces weeks, resets week index to 0, navigates to meetings page.
- `app/components/MeetingsPage.js` — removed static `midweekWeeks` import; now accepts it as a prop.
- `app/globals.css` — added: `.dropzone--active`, `.spin` animation, `.imp-error`, `.imp-hint`, `.rev-stage`, `.rvc*` (review card), `.imp-done`.

**EPUB structure (mwb_CH_*.epub):** OEBPS/ contains one XHTML per week. Week pages have `<h3 class="dc-icon--music">` for songs, `<h2 class="du-color--teal-700">` for 上帝話語的寶藏, `<h2 class="du-color--gold-700">` for 用心準備傳道工作, `<h2 class="du-color--maroon-600">` for 基督徒的生活. Parts are `<h3>N．Title</h3>` followed by a `<p>（X分鐘）description</p>` in the next sibling div.

**What EPUB import gives you (all `assign: []`):**
- date, reading, openSong / midSong / closeSong
- treasures (3 parts: 寶藏演講, 屬靈寶石, 經文朗讀)
- ministry (2-4 parts, each paired student/helper)
- living (1-2 parts + 會眾研經班)
- Calculated start times based on 19:30 default

**What requires manual entry after import:** chairman, prayers, `weekdayPill` (defaults to 星期三 · 19:30).

---

### Same-week assignment conflict indicator (2026-05-31)
**Problem:** When opening the candidate picker for a second slot in the same week, there was no indication that a person was already assigned to another slot in that week.

**Solution:**
- `page.js`: passes `assignments` state down to `AssignSheet`
- `AssignSheet.js`: computes `usedThisWeek` Set by scanning all `assignments` keys that share the same week prefix (`mw{id}_*`) excluding the current slot
- Candidates in `usedThisWeek` get `is-used` CSS class (55% opacity) and a red "本週已排" badge
- They remain selectable (for legitimate edge cases), but are visually de-prioritised
- `globals.css`: added `.cand.is-used`, `.cand.is-used:hover`, `.used-tag` rules
