# agents.md — AI Integration Notes

This file documents where and how AI agents (Claude API) are used or planned in this project, and guidelines for Claude Code when working on this codebase.

---

## Current AI usage

### None in production yet

Phase 1 is fully client-side with no Claude API calls. The EPUB parser (`app/lib/epubParser.js`) is deterministic — JSZip + DOMParser, no LLM.

---

## Planned: Phase 2 — Vision import (image / PDF)

When an admin uploads a **JPG/PNG photo of the schedule** or a **PDF scan**, the structured content cannot be parsed deterministically. This is where the Claude API comes in.

### What it does

Send the image/PDF page to `claude-opus-4-8` (or `claude-sonnet-4-6`) with a vision prompt. The model extracts the schedule as structured JSON, which then goes through the same review screen as EPUB import.

### Proposed API call (server-side, Phase 2)

```js
// POST /api/import/vision  (Fastify/Express route)
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

async function parseScheduleImage(imageBase64, mediaType) {
  const message = await client.messages.create({
    model: 'claude-opus-4-8',
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

### Prompt caching

The vision prompt is long and static. Cache it with a `cache_control` breakpoint:

```js
messages: [
  {
    role: 'user',
    content: [
      { type: 'image', source: { ... } },
      {
        type: 'text',
        text: VISION_PROMPT,
        cache_control: { type: 'ephemeral' },  // cache the prompt, not the image
      },
    ],
  },
],
```

---

## Planned: Phase 3 — Assignment suggestions via Claude

Once historical assignments are stored in Postgres, an optional "ask Claude" button could explain *why* a candidate is recommended ("陳志強 已 43 天未擔任寶藏演講，且本週未有其他安排") or flag edge cases the algorithm misses (e.g. a brother is scheduled for the same role two weekends in a row due to a manual override).

This is a UX enhancement, not a core feature — the weighted algorithm already does the heavy lifting.

---

## Claude Code development guidelines

These apply when Claude Code (this tool) works on this repo.

### State ownership

All interactive state stays flat in `app/page.js`. Do not introduce React Context, Zustand, or any other state manager until Phase 2 backend is wired. Two local-state exceptions are fine:
- `ImportPage` owns `stage` / `parsedWeeks` / `error` — transient import state.
- `WeekPicker` (inside `MeetingsPage.js`) owns its `open` boolean — ephemeral UI state.

### CSS convention

All styles go in `app/globals.css`. No CSS Modules, no Tailwind, no `style={}` props. Token names are in `globals.css :root`. When adding new component styles, append them above the final `@media (max-width: 860px)` block.

### Layout: midweek card alignment

The midweek view wraps the toolbar, nav strip, and card in a single `.mw-container` (max-width 880px). This ensures the toolbar's 編輯/匯出 buttons always align with the card's right edge. If you add new toolbar controls for the midweek view, place them **inside** the `.mw-container` block in `MeetingsPage.js`, not outside it. The weekend view has a separate minimal toolbar.

### EPUB parser is client-only

`app/lib/epubParser.js` uses `DOMParser` and `JSZip`. It must only be imported from `'use client'` components. Do not add it to any server component or API route.

### Adding new week fields

The `midweekWeeks` array shape is defined by the seed data in `app/data/index.js` and produced by `epubParser.js`. If you add a field, update both. The shape is consumed by `MidweekWeek.js` (renders the card) and `MeetingsPage.js` (WeekPicker reads `dateLabel`). Check those before adding or removing fields.

**Current optional fields** (absent on seed data, present on EPUB-parsed weeks):
- `dateLabel` — full week range string from the EPUB `<h1>`, e.g. `"9月7-13日"`. Used by `WeekPicker` to show the range. Falls back to computing `"X月Y-Z日"` from `date` if absent.
- `cbsRef` — book+chapter string from the CBS DUR line, e.g. `"《勇氣》第7章"`. Rendered inline on the CBS row in `MidweekWeek.js`. Absent on non-CBS parts and seed data.

### The review screen is non-negotiable

Per `meeting-scheduler-plan.md §3`: never auto-commit any import. EPUB, PDF, image — all go through the review UI before touching app state or (in Phase 2) the database. Do not add a "skip review" shortcut.

### Testing the parser

A real EPUB is at `sample/mwb_CH_202609.epub` (2026 Sept–Oct issue, Traditional Chinese). Use it to verify any parser changes before claiming they work. Run the dev server and test via the Import page UI — the parser runs in the browser so server-side scripts will not catch DOM-dependent bugs.

### Phase 2 backend shape

When the API is added, the import flow changes from:
```
parseEpub(file) → setMidweekWeeks(weeks)   [current: client state]
```
to:
```
POST /api/import/epub  multipart → server parses → saves ImportJob → returns jobId
GET  /api/import/:jobId → returns parsed weeks for review UI
POST /api/import/:jobId/confirm → writes WeeklyProgram rows to DB
```

The `ImportPage` component will call these endpoints instead of calling `parseEpub` directly. The `onImportWeeks` prop will be replaced by an API call. Keep this in mind when refactoring.
