# Todo: Phase 4 (Suggestions) + Phase 5 (iCal Export)

## Phase 0: Pre-requisite Fixes

- [x] Task 0a: Fix `saveMidweekWeek` — send `p.dbId` not `p.id` for part updates (`app/page.js` ~line 291)
- [x] Task 0b: Default date for new weekend rows = last row date + 7 days (`app/page.js` `addWeekendRow`)

### Checkpoint 0
- [ ] Build passes
- [ ] Edit part title → ✓ 完成 → hard reload → change persisted
- [ ] Add weekend row → date pre-filled as last row + 7 days

---

## Phase 1: Suggestion Engine

- [x] Task 1: `app/lib/suggest.js` — `suggestWeekendRow` + `suggestMidweekWeek` pure functions

### Checkpoint 1
- [ ] Build passes
- [ ] Manually verify ranking: person never assigned ranks above person assigned recently

---

## Phase 2: API Routes

- [x] Task 2a: `POST /api/suggest/weekend-row` — auth, load people + past rows, call suggest, return `{ suggestion }`
- [x] Task 2b: `POST /api/suggest/midweek-week` — auth, load week + history + people, call suggest, return `{ suggestions }`

### Checkpoint 2
- [ ] Both routes return valid JSON with auth
- [ ] No cross-congregation data leakage

---

## Phase 3: Ghost State in `page.js`

- [x] Task 3: Add `suggestions` state + `getSuggestion` / `acceptSuggestion` / `clearSuggestion` / `acceptAllSuggestions` / `clearAllSuggestions` / `fetchWeekendSuggestions` / `fetchMidweekSuggestions`; wire into `sharedProps` + `weekendProps`

### Checkpoint 3
- [ ] Build passes
- [ ] No runtime errors when suggestion actions called

---

## Phase 4: Ghost Rendering

- [x] Task 4a: Ghost `WhoSlot` in `MidweekWeek.js` — render ghost pill with ✓ / ✕ when suggestion exists
- [x] Task 4b: Ghost `NamePill` in `WeekendView.js` — same pattern, desktop table + mobile card
- [x] Task 4c: Ghost CSS in `globals.css` — `.who--ghost`, `.name-pill--ghost`, ghost buttons

### Checkpoint 4
- [ ] Ghost pills visible; accept and clear work end-to-end
- [ ] Normal flow unchanged when no suggestions

---

## Phase 5: Trigger Buttons and Toolbar Actions

- [x] Task 5a: Midweek ✦ button in navstrip + accept/clear all in toolbar (`MeetingsPage.js`)
- [x] Task 5b: Weekend ✦ button per row in edit mode + accept/clear all in toolbar (`WeekendView.js` + `MeetingsPage.js`)

### Checkpoint 5
- [ ] Full flow: ✦ → ghosts appear → accept/clear all work in both views
- [ ] Ghosts cleared when edit mode exits
- [ ] No suggestions bleed between weeks or rows
- [ ] `npm run build` passes clean

---

## Phase 6: iCalendar Export

- [x] Task 6a: `app/lib/icalExport.js` — `generateIcal(assignments, personName, congregationCode)` → `.ics` string
- [x] Task 6b: "匯出 iCal (N 項)" button in PeoplePage 未來安排 section → triggers `.ics` download

### Checkpoint 6 (Final)
- [ ] Build passes
- [ ] `.ics` file imports cleanly into Outlook with correct dates + times
- [ ] No past assignments included
- [ ] Events show role as title, role+context as description
