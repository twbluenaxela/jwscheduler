# 聚會編排 Scheduler — Project Plan (v2)

A touch-friendly web app to replace the current Excel workflow for scheduling
brothers and sisters into midweek (聚會) and weekend (週末) meeting assignments.
Hosted on **fly.io** with a **database**, importing the weekly program from the
official 聚會手冊, and supporting Excel / image / PDF import-export.

---

## 1. Design philosophy (the answer to "would it be too messy?")

The whole app rests on **progressive disclosure**: never show everything at once.

- **One meeting at a time is the default.** The main screen looks like *one* of
  your current Excel sheets — same sections, same colours — so the current
  admin recognizes it instantly and barely has to learn anything.
- **"See everything" is a separate, calmer view** — a vertical list of meetings,
  each row collapsed to date + a few key names, tap to expand. Filter chips:
  `聚會` / `週末` / `全部`, later also by role category.
- **Match the familiar mental model.** Reuse the section colours from the current
  sheet — grey 上帝話語的寶藏, gold 用心準備傳道工作, dark-red 基督徒的生活.

---

## 2. Where the weekly program comes from (JW.org)

The meeting *parts* change every week (titles come from the workbook); your
*people* don't. So program and assignments are two separate layers.

### Do NOT scrape jw.org / wol.jw.org
- `wol.jw.org` is **robots-disallowed** — it blocks automated access.
- JW.org Terms of Use **prohibit building tools that scrape data/HTML/text**
  from the site.

### Do use the official EPUB (this is permitted and more robust)
- The ToS **explicitly allows** free, non-commercial apps to **download EPUB /
  PDF / MP3 / MP4 files**, and viewing/downloading publications is permitted use.
- The **聚會手冊 (Life and Ministry Meeting Workbook, "mwb")** EPUB is structured
  XHTML inside a zip. Parse it **locally** to extract, per week:
  part titles, durations, song numbers, the Bible reading, section structure.
- This is how established congregation tools (Meeting Schedule Assistant, M³)
  source the program. It's far more stable than HTML scraping.

### Recommended flow: human-uploaded EPUB
- Admin downloads the workbook EPUB (released ~bimonthly) and **uploads it** to
  the app → app parses it → review → commit.
- **No automated requests to jw.org at all** — the human does the one download.
  This sidesteps both robots.txt and any ToS concern, and reuses the same upload
  pipeline as image/PDF/Excel import.
- (A more automated path exists — the publication-download mechanism the official
  apps use to fetch EPUB files fits the "download files" carve-out — but verify
  it yourself before relying on it. The human-upload route is the safe default.)

### Re-thinking "check every few days"
With human upload there is no remote source to poll. Repurpose the scheduled job
to watch **your own DB** instead:
- Flag upcoming weeks with **no program yet** or **incomplete assignments**.
- Surface staleness ("3 weeks out is still empty").
- The **manual "Check now" button** runs the same health check on demand.
- (Optional later) send the admin a reminder when next month's workbook isn't in.

---

## 3. Import / export (Excel, image, PDF, EPUB)

**One unified ingestion pipeline:**
```
upload (xlsx / image / pdf / epub) → parse → REVIEW screen → commit to DB
```
Never auto-commit. The admin always eyeballs and confirms — critical for an
older user and for the fuzzy inputs.

| Input  | Parser                          | Reliability |
|--------|----------------------------------|-------------|
| .xlsx  | SheetJS (deterministic)          | High        |
| .epub  | unzip + XHTML parse              | High        |
| .pdf   | text-layer parse, else vision    | Medium      |
| image  | vision model (Claude API)        | Medium      |

- **Excel export** (SheetJS) producing a sheet that matches the current layout,
  so schedules can still be posted/printed in the familiar form.
- **Excel import** to seed people and historical assignments from existing sheets.
- **Image/PDF import**: backend sends the file to a vision model → structured
  JSON of parts + names → review screen for correction → commit.
- **EPUB import**: deterministic parse of the workbook → weekly program.

---

## 4. Data model

### Person
- Name (中文), Gender
- Qualification tags (eligible roles): `主席`,`禱告`,`寶藏演講`,`經文寶石`,`朗讀`,
  `傳道示範`,`助手`,`生活演講`,`研經班主持`,`守望台主持`,`公眾演講`, and later
  `AV`,`麥克風`,`舞台`,`招待`
- Active / Away (with away date ranges)
- (optional) Family group — for valid student/helper pairings

### WeeklyProgram (one per meeting date)
- Date, type (`midweek` / `weekend`)
- Chairman, opening/closing prayer, songs
- **Parts list** — title + duration + required role-type (imported each week)
- **source** enum: `epub` / `pdf` / `image` / `manual`
- **last_synced_at**, **review_status** (`pending` / `approved`)
- **updated_at** (for the DB-change health check)

### Assignment
- Person → slot (program + part), plus helper if applicable
- status: `auto` / `confirmed` / `manual_override`

### AssignmentHistory  (append-only)
- Who served, role-category, date — the source of truth for fairness weighting.

### ImportJob
- type, file ref, status, parsed payload, error, created_at — backs the review UI.

---

## 5. The assignment algorithm — weighted fair rotation

For each empty slot, among **eligible** candidates:

**Step 1 — hard filters:** not qualified / wrong gender / Away that week /
already assigned in the same meeting → removed.

**Step 2 — weight the survivors:**
```
weight_i = (days_since_last_same_category_assignment) ^ p
```
- `p` = "spread strength" slider (≈1 gentle, ≈2–3 strong).
- **Soft floor:** if served within ~14 days, multiply weight by a small factor
  (e.g. 0.1) — discourages back-to-back without forbidding it. This is the
  "fair but not rigid" middle (no hard 30/60-day cliff).
- Optional bonus for people with the fewest total assignments this term.

**Step 3 — roulette-wheel pick** proportional to weight.

**Pairing (學生/助手):** auto-pick a helper (same gender / family) with its own
weighting.

**The algorithm proposes, the admin disposes** — every slot stays tappable for
manual override. Recommendation: weight **per role-category**, not globally.

---

## 6. Screens

1. **Week view (default)** — one meeting in the familiar Excel layout. Tap a slot
   → bottom sheet: ranked candidates (top pick highlighted, 🔀 reshuffle, search)
   → tap to confirm. Autosave + Undo.
2. **Overview / month list** — collapsed rows, filter chips, gaps highlighted.
3. **People** — add/edit, gender, qualifications, active/away. Mostly tapping.
4. **Per-person view** — upcoming + recent assignments + load stats.
5. **Import / Review** — upload file → review parsed result → commit.
6. **Print / Export** — printable + Excel output matching the current format.

**Touch + older-user:** large targets and fonts, pick-from-lists (minimal
typing), autosave + Undo, confirm before destructive actions.

---

## 7. Architecture (fly.io + DB)

```
[ React PWA ]  ──>  [ Node API (Fastify/Express) ]  ──>  [ Postgres ]
     │                        │
  installs on iPad      ┌─────┴─────┐
  works offline         │  workers  │
                        │  • scheduled health check (Fly Scheduled Machine
                        │    or node-cron): find empty/incomplete weeks
                        │  • import jobs: epub / pdf / image / xlsx parsing
                        │  • (optional) reminders
                        └───────────┘
                              │
                        [ object storage: Tigris on fly ] for uploaded files
                        [ vision: Claude API ] for image/PDF parsing
```
- **DB:** Postgres — managed (Neon / Supabase) or Fly Postgres. ORM: Prisma or
  Drizzle.
- **Scheduled job:** fly.io **Scheduled Machines** (cron) or a worker with
  node-cron, running the DB health check every few days; same endpoint behind the
  manual **"Check now"** button.
- **Change tracking:** `updated_at` + `source` + `last_synced_at` +
  `review_status` per program drive the gap report.
- **Uploads:** store in Tigris (fly's S3-compatible object storage); image/PDF go
  to the vision endpoint, EPUB/XLSX to deterministic parsers.

---

## 8. Phasing

**Phase 1 — MVP**
- People management (qualifications / gender / away)
- Midweek + weekend programs, **manual entry** of weekly parts
- Weighted auto-fill + fairness slider + manual override
- Week view + month overview with filters
- Excel import/export; print
- fly.io + Postgres; basic DB-gap health check + "Check now"

**Phase 2 — automation & support roles**
- **EPUB import** of the workbook (the big time-saver)
- **Image / PDF import** via vision + review screen
- Support roles: 音響/AV、麥克風、舞台、招待
- 外地演講安排 tracking (speakers sent to other congregations)
- Conflict detection + per-person load dashboard

**Phase 3 — nice-to-haves**
- Multi-admin, assignment notifications/reminders
- Read-only congregation view
- Smarter pairing/eligibility tiers (elder/MS-only parts)

---

## 9. Decisions I'd want from you

1. **Workbook source** — confirm human-uploaded EPUB (recommended) vs. exploring
   the file-download API later.
2. **Fairness scope** — per role-category (recommended) or global?
3. **How many JW-specific constraints to encode** (gender rules, qualification
   tiers)? More rules = better auto-fill, more setup per person.
4. **DB host** — Neon/Supabase (managed, easy) vs. Fly Postgres (all-in-one fly)?
5. **Vision provider** for image/PDF — Claude API assumed; confirm.

---

## 10. Change detection & notifications

The point of the app over Excel: when the schedule changes, the affected people
are told automatically — no surprises.

### Don't "monitor" the DB — diff at publish
Polling for changes is fragile. Instead use a **Draft → Publish** model:
- The admin edits a **draft** freely (rearrange all day → nothing fires).
- On **發布 (Publish)**, diff the new published state against
  `publishedSnapshot` (the previous published state). Notify only on net change.
- This eliminates spam from mid-edit churn; people only hear about final changes.

### Change types (per person, from the diff)
- ✚ **ADDED** — newly assigned
- ✖ **REMOVED** — assignment deleted
- ↻ **MOVED** — same person + same role, different date (detect & present as a
  move, not a confusing remove-then-add)
- ✎ **CHANGED** — same date, different part/role

All of one person's changes from a single publish collapse into **one digest**.

### Standardized message
```
【新屋會眾 · 聚會編排通知】
{姓名} 平安：您的聚會編排有更新——

✖ 已取消　6/16（二）經文朗讀
✚ 新增　　6/23（二）研經班朗讀員
↻ 改期　　生活演講：6/16 → 6/30（二）

完整編排：{連結}
如有疑問請聯絡編排負責人。
```
Only the applicable lines render (no removals → no ✖ line).

### Delivery = outbox + worker
On publish, write `Notification` rows (status=pending). The background worker
(same fly.io scheduled-machine infra) sends, marks sent/failed, retries with
backoff. `ChangeLog` + `Notification` give a full audit trail ("did 陳 get
notified? yes, 14:32, LINE, delivered") and allow re-send.

### Channels (Taiwan)
- **LINE Official Account + Messaging API push** (primary). LINE Notify was
  discontinued (Apr 2025); the Messaging API is the replacement, with a free
  monthly quota. Requires each person's `lineUserId` — they friend the Official
  Account once.
- **Email** fallback (Resend / SendGrid / SMTP).
- **SMS** (Twilio) last resort — costs per message.
- Per-person `channel` + `notifyOptIn` on the Person model.

### Root-cause fix: subscribable calendar feed (recommended)
The surprise happens because people hand-copy assignments into a personal
calendar that then drifts. Publish a per-person **.ics / webcal feed**; they
subscribe once and their calendar auto-updates on every publish. Notifications
say *that* it changed; the feed keeps the calendar *already correct*. Do both.

### New endpoints
```
POST /api/meetings/publish        diff vs snapshot -> ChangeLog + Notifications
GET  /api/notifications?status     outbox / audit view
POST /api/notifications/:id/resend
GET  /api/feed/:personToken.ics    subscribable per-person calendar
POST /api/line/webhook             capture lineUserId on friend / acknowledge
```

---

## 11. Eligibility & constraints (per S-38)

Eligibility = **gender × appointment × per-person approvals**, plus availability.

### Person attributes (for eligibility)
- **gender**: 弟兄 / 姊妹
- **appointment** (brothers): `ELDER` 長老 / `MS` 助理僕人 / `PUBLISHER` 傳道員
- **approvals**: per-person tags the elders grant (e.g. `public_speaker`,
  `cbs_conductor`, `wt_conductor`, `treasures`, `living`, `bible_reading_student`,
  `ministry_student`). S-38 leaves "who is qualified" to the 長老團.

### Eligibility matrix

| Part / role | Gender | Appointment floor | Notes (S-38) |
|---|---|---|---|
| 主席 (chairman, both meetings) | M | Elder / MS | §24 |
| 禱告 (prayer) | M | baptized brother | |
| 寶藏演講 (Treasures talk) | M | Elder / MS | §3 |
| 經文寶石 (Spiritual Gems) | M | Elder / MS | §4 |
| 經文朗讀 (Bible reading) | **M only** | student | §5 男生 only |
| 初次交談 / 再次交談 / 教導人成為門徒 | M **or F** | student | §7–9 |
| 解釋自己的信仰 — 示範 | M **or F** | student | §10 demonstration |
| 解釋自己的信仰 — 演講 / 用心 演講 | **M only** | student | §10–11 男生 only |
| 基督徒的生活 節目/演講 | M | Elder / MS | §15 (本地需要 = Elder only) |
| 會眾研經班 主持 | M | Elder (MS if few elders) | §16 |
| 會眾研經班 朗讀 | M | baptized brother | §16 |
| 公眾演講 講者 | M | Elder / MS (approved) | may be external |
| 守望台 主持 | M | Elder (MS) | |
| 守望台 朗讀 | M | baptized brother | |

> **Sisters** qualify for **only** the four 用心 conversation/demonstration rows
> above. Everything else is brothers.

### Helper pairing (用心 parts)
- Helper must be **same gender** as the student.
- **Exception:** 初次交談 (§7) and 解釋信仰示範 (§10) also allow a **family member**.

### Talk vs. demonstration
The workbook import must tag each 用心 part as **演講 (talk → male only)** vs.
**交談/示範 (→ both genders)**. Eligibility depends on this, not just the title.
(Add a `format` field to the Part model.)

### No double-booking in one day  ← key new rule
- **Auto-fill:** hard-exclude anyone already assigned **on that date** from any
  further part that date (most important for the weekend: 主席 / 講者 / 守望台
  主持 / 朗讀 must be different people).
- **Manual:** still allowed, but shows a confirm ("此人當天已擔任 X，確定再指派？").
  Honors special circumstances and S-38 §24 (chairman covering parts when elders
  are few).
- Applies among **local** members only — external speakers are exempt.

### Availability from speaking assignments
- **External speaker** (公眾演講 講者 from another 會眾): a separate list, not in
  the local fairness rotation.
- **Outgoing speaker** (外地演講安排): a local brother sent out that weekend is
  auto-marked **unavailable locally** that day.

### Schema deltas (for when we build — not changing the file yet)
- `Person`: add `appointment` enum (`ELDER` / `MS` / `PUBLISHER`); keep `quals`
  as the per-person approvals list.
- `Part`: add `format` (`TALK` / `DEMONSTRATION`) and optional `requiredApproval`.
- Auto-fill filter order: gender → appointment floor → approval → not-away →
  not-already-assigned-that-date → weighted pick.

---

## 12. Settings & meeting schedule configuration

### Congregation settings
- **Home congregation** (currently 新屋) + region. Used to auto-classify talks as
  **local** (speaker's 會眾 = home) vs **inbound** (from another 會眾), and for
  display/branding.
- (Optional) roster of external congregations + their known speakers for reuse.
- Notification channel config (LINE Official Account, email).

### Default meeting pattern
- **Midweek:** weekday + time (default 週四 19:00).
- **Weekend:** weekday + time (default 週日 09:30).
- **Default venue** (hall name + address).

### Temporary overrides  ← the flexibility you need
A dated override that supersedes the defaults for a range:
- effective **start / end date**
- applies to **midweek / weekend / both**
- new **weekday / time / venue**
- reason note

Example (hall maintenance, ~2 months): midweek → 週三 19:00, weekend → 週日 15:00,
venue → 臨時聚會所. The app computes each week's real date/time/venue as:
**defaults → active override → special-week effect.**

> Because date/time/venue is computed (not stored per-week by hand), changing the
> override updates every affected week at once — and feeds the broadcast notice
> below.

### Schema deltas (later)
- `Settings` (singleton): homeCongregation, region, channels.
- `MeetingDefault`: type, weekday, time, venueId.
- `ScheduleOverride`: startDate, endDate, appliesTo, weekday, time, venueId, note.
- `Venue`: name, address.

---

## 13. Special weeks & meeting-date edge cases

A single **events calendar** screen where the admin enters dated events; each type
has a default effect (overridable). Per S-38:

| Event (type) | Default effect |
|---|---|
| `ASSEMBLY` 大會（分區/區域） | Suspend **both** meetings that week (§21) |
| `MEMORIAL` 主的晚餐 | If on a weekday → **no midweek** that week (§22). Enter the annual date + the announced future-3-years dates in **bulk**. May carry its own talk/speaker. |
| `CO_VISIT` 分區監督探訪 | **Modify** program: midweek 研經班 → 30-min 服務演講 by CO, no breakout classes; weekend public talk given by the CO (§20). Generated from a CO-visit template. |
| `CUSTOM` 特別事件 | Manual: suspend / modify / time-change |

### Effects on the schedule & assignments
- **Suspended week** → no `MeetingProgram` / no assignments (shown as 「本週聚會暫停 — 區域大會」).
- **Modified week (CO visit)** → part list comes from the CO-visit template, not the
  workbook import; CBS conductor/reader roles drop, CO talk added; chairman + prayers
  still assigned under the normal eligibility rules.
- **Date/time/venue change** (from override or a time-change event) → triggers a
  **broadcast notification** (see §10) to all assignees that week, and optionally the
  whole opted-in congregation, e.g. 「本週聚會改為週三 19:00，地點：臨時聚會所」.

### Generation engine
Walk forward week by week and emit each `MeetingProgram` with computed
**date / time / venue / template / status** (`SCHEDULED` / `SUSPENDED` / `MODIFIED`),
applying defaults → override → special-week in that order.

### Schema deltas (later)
- `CalendarEvent`: date, type (`ASSEMBLY`/`MEMORIAL`/`CO_VISIT`/`CUSTOM`), effect,
  note. Support bulk entry (Memorial multi-year).
- `MeetingProgram`: add `status`, `time`, `venueId`, `templateKind`.

---

## 14. Speaker self-service invites (公眾演講)

Reduce admin typing by letting the speaker fill in their own details.

### Flow
1. Admin assigns/initiates a speaker for a weekend date, generates a **tokenized
   invite link** (+ optional personal message), sends via LINE/email.
2. Link opens a small mobile-friendly form:
   - **會眾 (congregation)** — pre-filled for local speakers; typed for inbound
   - **姓名 (name)**
   - **演講編號 (outline number)** + **主題 (title)** — maps to your sheet's 編號/演講主題
   - **詩歌 (song number)** — optional
3. Submission lands in the **review queue** → admin confirms → populates the
   weekend public-talk slot. If it changes a published value, fires a notification.

### Agnostic / local vs inbound
- Determined automatically: 會眾 = home (新屋) → **local**; otherwise **inbound**
  (e.g. 新竹市東區). Inbound speakers stay **out of the local fairness rotation**
  and out of the local double-booking check (§11).
- The reverse (外地演講安排, a 新屋 speaker sent out) can reuse the same mechanism
  and auto-marks that brother **unavailable locally** that weekend (§11).

### Eligibility (kept flexible)
- 公眾演講 = **elder or MS** with the `public_speaker` approval tag.
- **No hard MS-frequency rule** (you're unsure how it works). If ever wanted, add an
  optional per-person **annual soft-cap** that lowers their rotation weight after N
  talks — but it's not required.

### Schema deltas (later)
- `SpeakerInvite`: token, programId, status (`sent`/`submitted`/`confirmed`),
  message, submittedPayload (congregation, name, outlineNo, title, song).
- Public talk slot stores: outlineNo, title, song, speakerName, speakerCongregation,
  direction (`LOCAL`/`INBOUND`).

---

## 15. Export & sharing (image + clipboard)

Primary use case: paste the schedule into the congregation **LINE group**. So
image export + copy-to-clipboard are first-class, alongside the Excel/PDF from
§3/§6.

### Two modes (rendered from the on-screen views — WYSIWYG)
- **Midweek — single-week card → JPG.** The Week-view card for one selected week
  (grey/gold/dark-red bands, times, parts, assignees). Download **and** copy to
  clipboard.
- **Weekend — full upcoming table → JPG.** The whole 公眾演講安排表
  (日期 / 編號 / 主題 / 會眾 / 講者 / 主席 / 守望台 / 朗讀 / 招待 / 外地演講),
  **past dates filtered out**. Excel/PDF remain available for archival.

### How
- Rasterize the existing card/table DOM with **html-to-image** (or html2canvas).
- **2× pixel ratio** for crisp CJK text; wait for the web font to load before capture.
- **Download:** `a[download]` with the JPG blob.
- **Copy:** `navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])`.
- **iPad/Safari quirk:** the clipboard image write must run **inside the tap
  handler** (user gesture) — wire copy directly to the button press; build the
  `ClipboardItem` from a Promise of the blob (Safari is timing-sensitive).

### Details
- Format **JPG** as requested (offer PNG for max crispness).
- Filenames, e.g. `新屋_聚會編排_2026-06-16.jpg` / `新屋_公眾演講安排_2026.jpg`.
- Midweek = per selected week; weekend = today-forward.
- Reuses the same renderer as the Week view and overview — no separate layout to
  maintain, and exports always match what's on screen.

### Impl notes
- No schema change — pure client-side render of existing data.
- New dependency: `html-to-image`.
