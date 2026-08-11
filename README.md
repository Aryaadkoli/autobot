<div align="center">

# 🤖 Autobot

**Customer-communication automation for small businesses.**
Track leads, run WhatsApp campaigns, and build follow-up sequences that
react to what a lead actually does — not just fire-and-hope messaging.

</div>

---

Built first for a family agri-inputs business in India, designed from
day one to be multi-tenant so it can run more than one business — or be
sold to other small businesses — without forking the codebase.

📖 **Full project context, rules, and current build status:** [`CLAUDE.md`](./CLAUDE.md)
📐 **Original deep spec:** [`docs/BLUEPRINT.md`](./docs/BLUEPRINT.md)

## Contents

- [What it does](#what-it-does)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Security](#security)
- [Getting started](#getting-started)
- [Using it locally — a quick tour](#using-it-locally--a-quick-tour)
- [Scripts](#scripts)
- [Known Prisma quirk](#known-prisma-quirk)

## What it does

| | |
|---|---|
| 📇 **Leads** | Import an Excel/CSV list (column-mapping UI, dedupes on phone), auto-tag contacts with rule-based conditions, track stage (new → contacted → interested → converted/lost), full event timeline per lead |
| 📝 **Templates** | WhatsApp message templates with image/PDF header media, synced against Meta's real approval status, sent through the real Meta Cloud API once a tenant connects — falls back to a mock adapter until then, so the whole app works before that's set up |
| 📣 **Campaigns** | Send a template to everyone matching a tag/stage, or an uploaded list — right now, or on a schedule with monthly/yearly recurrence, with a visual calendar of what's planned |
| 🔀 **Workflows** | The reactive engine: chain send/wait/branch steps with a plain-language step builder (no JSON needed for the common case), react differently to a reply vs. a link click vs. silence, pivot into a different sequence when a lead shows real intent |
| 📊 **Analytics** | Delivery/read/reply rates, spend estimates, per-template and per-workflow performance — computed from the same Message/Event rows every send already writes |
| 🏢 **Multi-tenant accounts** | One login can belong to more than one business — pick which to work in after signing in, or start a brand new business from the same login any time |
| 🛡️ **A real gatekeeper** | Opt-outs, quiet hours, per-contact daily caps, and cross-service send priority (a payment reminder outranks a marketing blast) enforced before anything sends — not bolted on after |

## Tech stack

Next.js (App Router) · TypeScript · Tailwind · PostgreSQL + Prisma ·
NextAuth v5 (JWT sessions) · BullMQ + Redis · Zod

## Project structure

```
app/          Next.js routes — pages (dashboard, login, signup) and API routes
core/         Framework-free business logic (channels, gatekeeper, workflow
              engine, ingestion, tagging) — no Next.js imports, unit-testable
lib/          Shared infra: Prisma client, auth helpers, crypto, mailer, dates
worker/       Standalone BullMQ worker entry point (npm run worker)
prisma/       Schema, migrations, seed data
docs/         Deep spec (BLUEPRINT.md)
CLAUDE.md     Living project brief — read this first for full context
```

The one architectural rule: `core/` never imports from `app/` or
Next.js. Routes and the worker are thin shells that call into `core/`,
which is what keeps the business logic testable and portable.

## Security

- **Sessions**: JWT strategy (NextAuth v5), **encrypted** (JWE, not just
  signed — session contents aren't readable from the cookie without
  `AUTH_SECRET`). 14-day max lifetime, silently refreshed on activity
  every 12 hours — an idle session expires on its own; an active one
  never interrupts the user with a re-login.
- **Brute-force protection**: login and password-change are both
  rate-limited (5 attempts / 15 minutes, Redis-backed) — the 6th attempt
  is rejected outright, correct password or not, until the window resets.
  A throttled attempt returns the same generic error as a wrong password,
  so an attacker can't distinguish "locked out" from "wrong guess."
- **Passwords**: bcrypt-hashed, never logged, never returned by any API
  response. 8-character minimum with no forced complexity rules —
  length-over-complexity is current NIST 800-63B guidance, not an
  oversight.
- **Per-tenant channel credentials** (WhatsApp access tokens etc.):
  AES-256-GCM encrypted at rest (`lib/crypto.ts`), keyed by
  `CREDENTIALS_KEY`.
- **Multi-tenant isolation**: every database query filters by tenant —
  enforced by always going through `requireSession()`, never a raw
  Prisma call with a client-supplied id.
- **Webhooks**: Meta's WhatsApp webhook verifies `X-Hub-Signature-256`
  (HMAC, timing-safe comparison) before processing anything.
- **Official channel APIs only** — no unofficial WhatsApp automation,
  ever; see `CLAUDE.md`'s non-negotiable rules.

## Getting started

**Requirements**: Node.js 20+, PostgreSQL, Redis (only needed for the
Workflow engine's delayed "wait" steps — everything else works without
it).

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL, AUTH_SECRET, etc. — see comments in the file
npx prisma migrate dev
npx prisma db seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Seeded logins
(password is `SEED_ADMIN_PASSWORD` from `.env`, default `changeme123`):

| Login | What it demonstrates |
|---|---|
| `aryaadkoli@gmail.com` | Owner of two businesses — lands on the business picker after login |
| `admin@autobot.local` | Belongs to no business yet — shows the empty state |

### Running the workflow engine locally

Redis is required for scheduled/delayed workflow steps. If you don't have
a container running yet:

```bash
docker run -d --name autobot-redis -p 6379:6379 redis
```

`npm run dev` alone is enough to see workflows actually advance in
development — it starts an in-process copy of the worker
(`instrumentation.ts`). For a setup closer to production, run the real
worker process separately:

```bash
npm run worker
```

## Using it locally — a quick tour

1. **Log in** as `aryaadkoli@gmail.com` and pick **Surabharati** from the
   business picker (it's the fuller demo dataset of the two).
2. **Leads** — open a lead to see its stage, tags, and event timeline.
   Try **Import leads** to upload a CSV (a sample template is one click
   away in the import dialog).
3. **Templates** — open the seeded `lead_intro_1` template to see how
   Meta template variables map to lead fields.
4. **Campaigns** — filter leads by tag/stage, preview who matches on the
   right, send now or schedule it (try "repeat monthly" — that's the
   mechanism behind "send this to all mango farmers every January").
5. **Workflows** — open the seeded "Lead intro + reply check" workflow to
   see the plain-language step builder: a *send* step, a *wait* step with
   "if they reply…" / "if they click a link…" reactions, and named
   outcomes instead of one generic "done."
6. **Analytics** — delivery/read/reply rates and per-workflow outcome
   breakdowns, all built from data the steps above already generate.
7. **Settings** — WhatsApp connection status, sending limits (quiet
   hours, daily cap), and team management.

Sends go through a mock channel adapter until a tenant's real WhatsApp
credentials are saved in Settings — everything above works fully without
one; nothing actually reaches a real phone until that's connected.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server (Turbopack) + in-process scheduler/worker |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run worker` | Standalone workflow-queue worker process |
| `npm run lint` | ESLint |
| `npx prisma db seed` | (Re-)seed demo data — safe to re-run, updates in place |

## Known Prisma quirk

`npx prisma migrate dev` on this Prisma 7 + driver-adapter setup has
occasionally left the generated client stale after a schema change (a new
model missing from `node_modules/.prisma/client`). If `tsc`/the dev server
complains about a model that's clearly in `schema.prisma`:

```bash
rm -rf node_modules/.prisma node_modules/@prisma/client
npm install @prisma/client@7.9.1
npx prisma generate
```

then restart the dev server. See `CLAUDE.md` for more detail.
