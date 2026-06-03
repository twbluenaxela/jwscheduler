# Todo: Midweek Week Type + Label

## Phase 1: Data Foundation

- [ ] Task 1: Add `type String @default("normal")` and `label String?` to `MidweekWeek` in `prisma/schema.prisma` — run `npx prisma db push` locally
- [ ] Task 2: Add `"type"` and `"label"` to `WEEK_FIELDS` in `app/api/midweek-weeks/[id]/route.js`; coerce empty label to `null`; add `type`/`label` to `saveMidweekWeek` payload in `app/page.js`

### Checkpoint A
- [ ] `npm run build` clean
- [ ] `type`/`label` round-trip to DB (check network tab on save + reload)

## Phase 2: Edit UI

- [ ] Task 3: Add type chips (一般 / 探訪 / 大會) + conditional label input to the midweek navstrip in `app/components/MeetingsPage.js` (edit mode only)

## Phase 3: Card Visuals

- [ ] Task 4: Add `card--special` / `card--assembly` CSS in `app/globals.css`; apply class + render badge in `app/components/MidweekWeek.js`

### Checkpoint B
- [ ] `npm run build` clean
- [ ] All three types render correctly, badge visible
- [ ] JPG export captures visuals
- [ ] Run `fly ssh console -C "npx prisma db push"` on prod after deploy
