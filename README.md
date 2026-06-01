# 新屋會眾聚會編排 Scheduler

Touch-friendly web app for managing midweek and weekend meeting assignments for 新屋 (Xinwu) congregation. Replaces the Excel-based scheduling workflow.

Live at **https://jwscheduler.fly.dev/**

---

## Features

- **Midweek schedule** — import from official EPUB (MWB), assign all parts via a candidate picker, export as JPG/PDF/Excel
- **Weekend schedule** — public talk table with speaker, chair, WT conductor, reader, host group; filter by date range and year
- **People management** — member list with qualifications, upcoming and recent assignments auto-derived from schedule data; delete support
- **LINE notifications** — opt-in push notifications when assignments change; members self-register via the LINE bot
- **Multi-congregation** — full data isolation per congregation; invite-link based onboarding

---

## Tech stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router), React 19 |
| Language | JavaScript (no TypeScript) |
| Styling | Single `globals.css` — no Tailwind, no CSS modules |
| Auth | Firebase (email/password + Google OAuth) |
| Database | Neon Postgres via Prisma 6 |
| Notifications | LINE Messaging API |
| Deploy | fly.io (Amsterdam) |

---

## Local development

```bash
# Install dependencies
npm install

# Push schema to DB and generate client
npx prisma db push
npx prisma generate

# Run dev server
npm run dev
```

### Required environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string |
| `FIREBASE_SERVICE_ACCOUNT` | Full Firebase Admin SDK JSON blob (not a bare private key) |
| `NEXT_PUBLIC_FIREBASE_*` | Firebase client SDK config (baked in at build time via `fly.toml [build.args]`) |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API channel access token |
| `LINE_CHANNEL_SECRET` | LINE channel secret for webhook signature verification |

---

## One-time data import scripts

Run after setting up a new congregation to seed historical data:

```bash
node --env-file=.env scripts/import-people.mjs        # congregation members
node --env-file=.env scripts/import-assignments.mjs   # midweek assignments
node --env-file=.env scripts/import-weekend.mjs       # weekend schedule
node --env-file=.env scripts/merge-person.mjs         # rename/merge a person record
```

---

## Deployment (fly.io)

```bash
fly deploy

# Push schema changes manually after deploy
fly ssh console -C "npx prisma db push"

# Secrets
fly secrets set LINE_CHANNEL_SECRET=... LINE_CHANNEL_ACCESS_TOKEN=...
fly secrets set FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'
```

`NEXT_PUBLIC_*` Firebase variables go in `fly.toml [build.args]` — they are baked in at build time, not injected from secrets at runtime.

---

## LINE bot registration flow

Members self-register by messaging the LINE bot:

1. Follow the account → bot asks for congregation name
2. Send congregation name (e.g. `新屋`) → bot confirms with congregation code and asks for your name
3. Send your name as it appears on the schedule → bot links your LINE account
4. Send `我的安排` anytime to see upcoming assignments

If multiple congregations match a partial name, the bot lists them with their codes so you can type the exact code to select one.

---

## Developer reference

See [`CLAUDE.md`](./CLAUDE.md) for full developer documentation: slot ID conventions, Prisma schema, multi-tenancy audit, auth gotchas, CSS conventions, and what not to do.
