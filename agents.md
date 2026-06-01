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

addWeekendRow(type)
  → POST /api/weekend-rows (create, returns DB row with _id alias)

deleteWeekendRow(rowId)
  → DELETE /api/weekend-rows/{rowId}

persistWeekendField(rowId, field, value)
  → PATCH /api/weekend-rows/{rowId} (called from edit mode for text fields + type toggle)

GET /api/congregations/data (on mount)
  → returns { midweekWeeks, weekendRows, people, congregation }
  → all three set into React state; week auto-set via findCurrentWeekIndex
```

**Still not persisted to DB:**
- Inline midweek week/part edits (titles, songs, times, dates) — state only
- Delete midweek week — no API yet

### WeekendRow `type` values

| type | Rendering |
|---|---|
| `schedule` | Normal white row (default) |
| `special` | Red-tinted row — for special talks, circuit overseer visits |
| `event` | Beige full-width banner — for conventions, special events (no speaker fields) |
| `suspended` | Red full-width banner — for 本週聚會暫停, cancelled meetings |

Type is toggled via a chip button in weekend edit mode. Persists to DB via `persistWeekendField`.
