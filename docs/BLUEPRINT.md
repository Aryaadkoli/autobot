# Autobot Orchestration Platform — Project Blueprint

Companion to `schema.prisma`. This covers the codebase structure, the workflow JSON
format, the gatekeeper logic, environment config, and deployment.

---

## 1. Codebase structure

One repository, one Next.js app, one worker process. Deployed together via Docker Compose.

```
autobot/
├── docker-compose.yml          # postgres + redis + web + worker + caddy
├── Caddyfile                   # reverse proxy, automatic free HTTPS
├── .env.example
├── package.json
├── prisma/
│   ├── schema.prisma
│   └── seed.ts                 # creates tenant #1 (dad's business), admin user, demo workflow
│
├── src/
│   ├── app/                            # Next.js App Router
│   │   ├── (auth)/login/page.tsx
│   │   ├── (dashboard)/                # everything behind login
│   │   │   ├── layout.tsx              # sidebar, tenant context
│   │   │   ├── page.tsx                # overview: sends today, delivery %, active sequences
│   │   │   ├── contacts/               # list, detail (timeline of events), tag filters
│   │   │   ├── imports/                # Excel upload + column-mapping UI
│   │   │   ├── workflows/              # list, JSON editor (v1), React Flow builder (later)
│   │   │   ├── templates/              # per-channel templates + approval status
│   │   │   ├── campaigns/              # "enroll contacts matching tag X into workflow Y"
│   │   │   ├── analytics/              # delivery / engagement / conversion charts
│   │   │   └── settings/               # channel credentials, caps, quiet hours, API keys, users
│   │   │
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   ├── ingest/route.ts             # POST — external systems push events (ApiKey auth)
│   │   │   ├── webhooks/
│   │   │   │   ├── whatsapp/route.ts       # Meta: statuses + inbound replies (verify X-Hub-Signature-256)
│   │   │   │   ├── brevo/route.ts          # Email delivery reports
│   │   │   │   └── brevo/route.ts          # email opens/clicks/bounces
│   │   │   ├── imports/route.ts            # upload + parse + preview + confirm mapping
│   │   │   ├── workflows/route.ts          # CRUD (validated against zod schema)
│   │   │   └── campaigns/route.ts          # enrollment endpoint
│   │   │
│   │   └── r/[token]/route.ts              # link redirect: log LINK_CLICKED event → 302
│   │
│   ├── lib/
│   │   ├── db.ts                # Prisma client singleton
│   │   ├── auth.ts              # NextAuth config, session → { userId, tenantId, role }
│   │   ├── tenant.ts            # getTenantOrThrow(session) — EVERY query goes through this
│   │   ├── crypto.ts            # encrypt/decrypt channel credentials (libsodium secretbox)
│   │   └── phone.ts             # normalize to E.164 (+91 default country code)
│   │
│   ├── core/                    # ALL business logic — framework-free, unit-testable
│   │   ├── ingestion/
│   │   │   ├── excel.ts         # parse xlsx/csv (SheetJS), stream rows
│   │   │   ├── mapper.ts        # apply columnMapping → contact fields + attributes
│   │   │   └── upsert.ts        # dedupe on (tenantId, phone), emit IMPORTED/UPDATED events
│   │   ├── tagging/
│   │   │   └── rules.ts         # evaluate condition trees against contact.attributes + events
│   │   ├── workflow/
│   │   │   ├── schema.ts        # zod schema for workflow definition JSON (see §2)
│   │   │   ├── engine.ts        # enroll(), advance(), handleEvent(), pivot() — the heart
│   │   │   └── render.ts        # fill template variables from contact + instance.context
│   │   ├── gatekeeper/
│   │   │   └── index.ts         # canSend(contact, instance) → ALLOW | DEFER(until) | SUPPRESS (see §3)
│   │   ├── channels/
│   │   │   ├── types.ts         # interface ChannelAdapter { send(msg): Promise<ProviderResult> }
│   │   │   ├── whatsapp.ts      # Meta Cloud API graph.facebook.com/v21.0/{phoneId}/messages
│   │   │   └── email.ts         # Brevo transactional API
│   │   └── analytics/
│   │       └── queries.ts       # SQL aggregations over events + messages
│   │
│   └── worker/
│       ├── index.ts             # boots all queue consumers + cron schedules
│       ├── queues.ts            # BullMQ queue definitions
│       └── processors/
│           ├── send.ts          # gatekeeper → render → channel.send() → record Message + MSG_SENT event
│           ├── advance.ts       # delayed job fired → engine.advance(instanceId, stepId)
│           ├── event-router.ts  # new Event → find waiting instances → transition / pivot
│           ├── tag-sweep.ts     # nightly: run SCHEDULE rules over all contacts
│           ├── import.ts        # process uploaded files row by row
│           └── erp-sync.ts      # scheduled ETL pull (phase 3)
│
└── tests/
    └── core/                    # engine + gatekeeper tests — this logic MUST be tested
```

**The one architectural rule:** `src/core/` never imports from `src/app/` or Next.js.
Web routes and worker processors are thin shells that call into `core/`. This is what
keeps the whole thing testable and lets you move pieces later (e.g. dashboard to Vercel)
without rewrites.

---

## 2. Workflow definition JSON format

Stored in `Workflow.definition`, validated by `core/workflow/schema.ts` (zod).
A workflow is a map of steps; each step says what to do and where to go next.

```jsonc
{
  "entry": "welcome",
  "steps": {
    "welcome": {
      "type": "send",
      "channel": "WHATSAPP",
      "template": "lead_intro_1",          // MessageTemplate.name
      "next": "wait_after_welcome"
    },
    "wait_after_welcome": {
      "type": "wait",
      "duration": "48h",                    // time-based trigger: BullMQ delayed job
      "listen": [                           // behavior-based triggers, active WHILE waiting
        { "event": "LINK_CLICKED", "action": "pivot", "subflow": "sales_subflow" },
        { "event": "REPLIED",      "action": "goto",  "step": "human_handoff" }
      ],
      "next": "followup_1"                  // where the timer goes if nothing happens
    },
    "followup_1": {
      "type": "send",
      "channel": "WHATSAPP",
      "template": "lead_followup_1",
      "next": "wait_2"
    },
    "wait_2": {
      "type": "wait",
      "duration": "72h",
      "listen": [
        { "event": "LINK_CLICKED", "action": "pivot", "subflow": "sales_subflow" }
      ],
      "next": "final_email"
    },
    "final_email": {
      "type": "send",
      "channel": "EMAIL",                   // channel fallback: last touch via email
      "template": "lead_last_chance_email",
      "next": "end_no_response"
    },
    "human_handoff": {
      "type": "end", "outcome": "handed_off"
    },
    "end_no_response": {
      "type": "end", "outcome": "no_response"
    }
  }
}
```

Step types for v1 — resist adding more until a real workflow needs them:

| type     | fields                              | behavior |
|----------|-------------------------------------|----------|
| `send`   | channel, template, next             | enqueue send job (goes through gatekeeper) |
| `wait`   | duration, listen[], next            | set wakeAt + waitingFor; delayed job OR event advances |
| `branch` | if (condition tree, same format as TagRule), then, else | evaluate against contact attributes/tags |
| `end`    | outcome                             | mark instance COMPLETED; outcome shows in analytics |

**Pivot semantics** (`engine.pivot()`): cancel the instance's pending BullMQ job
(`bullJobId`), set status = PIVOTED, create a new SequenceInstance on the sub-flow
workflow, link via `pivotedToId`. The sub-flow completing = a conversion.

**Duration format:** `"30m" | "4h" | "48h" | "3d"`. Sends landing inside quiet hours
get deferred to `quietHoursEnd` next morning in the contact's timezone.

---

## 3. The gatekeeper (runs before EVERY send)

`core/gatekeeper/index.ts` — pure function, heavily tested. Checks in order:

```
1. OPT-OUT      contact opted out on this channel?           → SUPPRESS (cancel instance)
2. QUIET HOURS  local time within tenant quiet hours?        → DEFER until morning
3. FREQUENCY    messages sent to contact in last 24h >= cap? → DEFER +4h (re-check then)
4. PRIORITY     another ACTIVE instance for this contact with
                LOWER service.priority number (= more urgent,
                e.g. PAYMENT=10 beats LEAD=50)?              → DEFER +24h
5. IDEMPOTENCY  Message row with this dedupeKey exists?      → SKIP silently (already sent)
                                                             → otherwise ALLOW
```

DEFER = re-enqueue the same job with delay (same dedupeKey, so still double-send-proof).
Every SUPPRESS/DEFER writes a Message row with status SUPPRESSED or stays QUEUED —
your dad can always see WHY something didn't go out.

---

## 4. Inbound flows (how behavior triggers arrive)

- **WhatsApp webhook** (`/api/webhooks/whatsapp`): Meta POSTs message statuses
  (sent/delivered/read/failed → update Message by providerMessageId, write event)
  and inbound customer messages (→ REPLIED event; "STOP"/"UNSUBSCRIBE" → set
  waOptedOut + OPTED_OUT event). Verify the X-Hub-Signature-256 header. Respond 200
  fast; do the work in a queue job.
- **Link redirect** (`/r/{token}`): look up Link, increment clicks, write
  LINK_CLICKED event (with messageId in payload), 302 to targetUrl. This is how
  "user clicks Link A → skip to Sub-flow B" physically works.
- **Ingest API** (`/api/ingest`, ApiKey auth): external systems POST
  `{ phone, event: "PAYMENT_RECEIVED", payload: {...} }` → normalize → Event row.
- **event-router worker**: every new behavior event → find ACTIVE instances for that
  contact where waitingFor matches → engine.handleEvent() → goto / pivot / complete.
  (A PAYMENT_RECEIVED event should also auto-complete any active payment-reminder
  instance — that's a `listen` entry on its wait steps.)

---

## 5. Environment variables (.env.example)

```bash
DATABASE_URL=postgresql://autobot:CHANGE_ME@postgres:5432/autobot
REDIS_URL=redis://redis:6379
NEXTAUTH_URL=https://app.yourdomain.in
NEXTAUTH_SECRET=            # openssl rand -base64 32
CREDENTIALS_KEY=            # 32-byte key for encrypting channel tokens
APP_BASE_URL=https://app.yourdomain.in   # used to build /r/{token} links

# Meta / WhatsApp (per-tenant creds live in DB; these are platform-level)
META_APP_SECRET=            # for webhook signature verification
META_VERIFY_TOKEN=          # webhook handshake token you choose
```

---

## 6. docker-compose.yml (the entire deployment)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: autobot
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: autobot
    volumes: [pgdata:/var/lib/postgresql/data]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes: [redisdata:/data]
    restart: unless-stopped

  web:
    build: .
    command: node server.js            # next build output (standalone)
    env_file: .env
    depends_on: [postgres, redis]
    restart: unless-stopped

  worker:
    build: .
    command: node dist/worker/index.js
    env_file: .env
    depends_on: [postgres, redis]
    restart: unless-stopped

  caddy:
    image: caddy:2-alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddydata:/data
    restart: unless-stopped

volumes: { pgdata: {}, redisdata: {}, caddydata: {} }
```

Caddyfile (this is the whole thing — Caddy fetches TLS certs automatically):

```
app.yourdomain.in {
    reverse_proxy web:3000
}
```

**Backups (non-negotiable once dad has real data):** nightly cron on the VM:
`pg_dump | gzip` → upload to Cloudflare R2 (10 GB free) or an Oracle Object
Storage bucket (also free tier). Test a restore once before launch.

---

## 7. Suggested package.json dependencies

```
next react react-dom                    # dashboard + API
@prisma/client prisma                   # ORM
bullmq ioredis                          # queues + delayed jobs
next-auth bcryptjs                      # auth
zod                                     # workflow schema + all API validation
xlsx                                    # Excel parsing (SheetJS)
libphonenumber-js                       # phone normalization
nanoid                                  # link tokens
libsodium-wrappers                      # credential encryption
date-fns date-fns-tz                    # quiet hours / timezone math
recharts                                # analytics charts
```

---

## 8. Build order recap (what to code first)

1. `schema.prisma` → migrate → seed tenant #1 + admin login
2. Excel import pipeline (`core/ingestion` + upload UI) — dad sees his contacts in the app
3. Templates CRUD + WhatsApp adapter + a manual "send test message" button
4. Workflow engine + worker (enroll → send → wait → advance) with ONE hardcoded flow
5. Meta status webhook + link redirect + event-router (behavior triggers + pivot)
6. Gatekeeper (caps, quiet hours, priority)
7. Campaign enrollment UI + analytics page
8. Email adapter, tag rules UI, ingest API, ERP sync — in whatever order dad needs
```
