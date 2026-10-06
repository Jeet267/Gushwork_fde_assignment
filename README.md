# Callboard — lead & follow-up tracker for a refrigeration repair shop

Built from the discovery call with Denise (owner, 4 field techs). Jobs come in by phone, website form, text and referral, and get tracked in a notebook. Leads slip — a $2,000 freezer job was lost because nobody called back over a weekend.

Her ask: **"Who to call today, and where each job is at. Waiting on quote, waiting on their yes, scheduled, done."**

**Stack:** Next.js 15 (App Router, TypeScript) · SQLite via libSQL (`@libsql/client`) — a local file in dev, Turso in production · no auth.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

- `/` — Denise's dashboard
- `/request` — the customer-facing "Request service" form for her website

Locally the database is a single file at `data/callboard.db`, created and filled with a realistic demo week on first request. `npm run seed` wipes it so the demo data is re-created (dates are relative to today, so the demo never goes stale). Set `SEED_DEMO=false` to start empty.

| Env var | Default | What it does |
|---|---|---|
| `BUSINESS_TZ` | `America/Chicago` | Decides what "today" and "overdue" mean |
| `TURSO_DATABASE_URL` | `file:data/callboard.db` | `libsql://…` URL for a hosted DB |
| `TURSO_AUTH_TOKEN` | — | Token for the hosted DB |
| `SEED_DEMO` | `true` | Fill an empty DB with demo jobs |

## What it does

| Screen | Why |
|---|---|
| **Who to call today** (home) | Everyone waiting on Denise, grouped by stage, equipment-down first. Each card: why they're on the list, how long they've waited, tap-to-call number, and one button that moves the job forward. |
| **Coming up** | Jobs not due yet (quotes inside their 2-day window, "call me Thursday" call-backs, booked jobs), grouped by the day they come back. |
| **All jobs** | Every job, filterable by stage, searchable by name/phone/problem. |
| **Numbers strip** | To call today · open jobs · open quote $ · **time to call back** (median hours from request to first conversation — the metric behind the lost weekend job) · last-30-day done $ and lost $. The answers her husband keeps asking for. |
| **Export CSV** | For the books. |
| **+ Add request** | Log a call/text/referral in ~10 seconds. Typing a phone number recognises a returning customer and fills in their details. |
| **Job drawer** | Full edit form, history log, and the customer's other jobs. Filling a quote amount moves the job to *Waiting on yes*; picking a date moves it to *Scheduled*. |
| **`/request`** | Website form that drops requests straight onto the call list instead of an inbox. Duplicate submissions from the same phone merge into the open request; a hidden honeypot field drops bots. The dashboard polls and toasts when one arrives. |
| **Undo** | Every one-tap action shows an 8-second Undo (server keeps it for 2 minutes and also removes the history lines it added). |

### Pipeline & call-list rules (`lib/rules.ts`)

`New request → Needs quote → Waiting on yes → Needs scheduling → Scheduled → Done` (or `Lost`, with a reason)

| Stage | On the list | Card says |
|---|---|---|
| New request | immediately (equipment down → top) | "Hasn't heard from us yet" / "Equipment down. Call back now" |
| Needs quote | immediately | "Waiting on a quote from you" |
| Waiting on yes | 2 days after the quote or last follow-up | "Quote sent, no answer yet" |
| Needs scheduling | immediately | "Said yes, needs a date" |
| Scheduled | the day after the job date | "Job date passed. Confirm it's done" |

- **No answer → tomorrow** pushes a job to tomorrow's list, so it can't silently drop.
- **Call back on…** sets a manual date that overrides the rule.
- **Lost** asks why (hired someone else, price, never heard back…).

## Project layout

```
app/
  page.tsx                 dashboard
  request/page.tsx         public website form
  api/jobs                 GET list+summary, POST add
  api/jobs/[id]            GET detail, PATCH edit
  api/jobs/[id]/action     one-tap pipeline actions
  api/jobs/[id]/undo       undo the last action
  api/requests             public form endpoint (dedupe + honeypot)
  api/customers            returning-customer lookup by phone
  api/export               CSV
lib/
  rules.ts                 stages + "who to call today" logic
  jobs.ts                  all reads/writes
  db.ts / seed.ts          SQLite schema + demo data
components/                Dashboard, JobDrawer, AddRequest, Dialogs
```

## Deliberately left out

- **Sign-in** — one user on her own phone/laptop; add it before putting this on the public internet.
- **Tech schedules / dispatch** — Denise said "nice later", not the problem.
- **Reading her inbox / texts automatically** — the website form now posts directly; calls and texts take 10 seconds to log. Email/SMS ingestion is the obvious next step.
- **Morning email/SMS digest** — next step so the list reaches her without opening the app.

## Deploying to Vercel

Vercel functions have no persistent disk, so in production the same SQLite schema lives on **Turso** (hosted libSQL). No code changes, just two env vars.

1. **Create the database** (once):
   ```bash
   # install: https://docs.turso.tech/cli/installation
   turso auth signup            # or: turso auth login
   turso db create callboard
   turso db show callboard --url        # -> TURSO_DATABASE_URL
   turso db tokens create callboard     # -> TURSO_AUTH_TOKEN
   ```
   (Or add Turso from the Vercel Marketplace, which creates the DB and sets the env vars for you.)
2. **Push this repo to GitHub**, then on vercel.com → *Add New → Project* → import it. Framework is auto-detected as Next.js.
3. **Environment Variables** (Project → Settings): `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, and `BUSINESS_TZ` (e.g. `America/Chicago`).
4. **Deploy.** The first request creates the tables and loads the demo week; set `SEED_DEMO=false` before the first request if you want it empty.

Or from the terminal: `npm i -g vercel && vercel` → add the env vars with `vercel env add` → `vercel --prod`.

Any host with a persistent disk (Railway, Render, Fly, a VM) also works with no env vars: the file DB in `data/` just needs a mounted volume.
