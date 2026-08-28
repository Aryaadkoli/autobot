# Autobot — Project Brief

This file is the permanent context for every coding session. Read it fully
before doing anything. Deep spec: docs/BLUEPRINT.md. Database source of
truth: prisma/schema.prisma.

## Purpose — why this exists

Autobot is a customer-communication automation platform being built for a
family business in India, with the intent to later sell it to other small
businesses as a product.

The problem it solves: small businesses follow up with leads and customers
manually — someone has to remember to WhatsApp a lead again after 2 days,
chase an unpaid invoice, or remind a buyer to reorder. That follow-up is
inconsistent and doesn't scale. Autobot makes it automatic: upload your
customer list, pick a follow-up plan, and the system messages people at the
right times through WhatsApp/email, watches what they do, and reacts.

Day-one focus: LEAD TRACKING — upload an Excel of leads, run automated
follow-up sequences, track who read/clicked/converted. Later, the same
engine runs payment reminders, stock alerts, and auto purchase orders —
they are just different workflows on identical machinery.

## How it works, end to end (one lead's journey)

1. The owner uploads an Excel sheet → an Import parses it with a column
   mapping → each row becomes/updates a Contact (deduped on phone number).
2. TagRules run automatically → labels like "dormant-30d" or "high-value"
   get stamped on contacts (ContactTag rows).
3. The owner starts a campaign: "enroll everyone tagged X into workflow Y."
   Each enrolled lead gets a SequenceInstance — a state-machine row that
   remembers which step they're on, when to wake up, what event to watch for.
4. A workflow (JSON playbook in the Workflow table) advances two ways:
   - TIME trigger: a BullMQ delayed job fires ("48h passed → send message 2")
   - BEHAVIOR trigger: the lead acts — clicks a tracked link, replies, pays —
     which arrives as an Event and can jump/skip steps or PIVOT: kill the
     current sequence and start a sub-flow (e.g. clicked = interested → sales
     sub-flow: call scheduling).
5. Before EVERY send, the gatekeeper checks in order: opted out? quiet hours
   (9pm–9am local)? over the daily message cap? does a higher-priority flow
   (payment beats marketing, lower Service.priority number wins) have this
   contact? already sent (dedupeKey exists)? Only then it sends.
6. Sends go through channel adapters (WhatsApp = Meta Cloud API,
   Email = Brevo). Delivery/read/reply statuses come back via webhooks and
   become Events. Every outbound URL is rewritten to /r/{token} so clicks
   are trackable Events.
7. Everything lands in the append-only Event table → the analytics pages are
   just queries over Events + Messages: delivery %, read %, click %,
   conversions (= sub-flows completed).

## Architecture

- ONE Next.js app (dashboard + API routes) + ONE background worker process,
  sharing one PostgreSQL and one Redis. A modular monolith — no
  microservices. Deployed later with Docker Compose on a single VM.
- Layout: NO src/ directory. app/ is at the project root; alias @/* = root.
- Stack: Next.js App Router, TypeScript, Tailwind, Prisma + PostgreSQL,
  NextAuth v5 (credentials, JWT sessions), BullMQ + Redis (worker phase),
  zod for all validation.
- Business logic lives in core/ (framework-free, no Next.js imports) —
  routes and worker processors are thin shells calling into core/. This
  keeps logic testable and portable.
- Multi-tenant: every business using the platform is a Tenant (the family
  business is tenant #1; future paying clients are tenants #2, #3...).
  Every table carries tenantId. The word "tenant" stays in code only —
  never in the UI.
- Identity vs. tenant membership (since the Account/signup work): a login
  (email+password) is an Account — global, not tied to one business. User
  is a pure membership row (tenantId + accountId + role) — the same
  Account can hold a User row in more than one Tenant (one email, several
  businesses, pick one after login). See "Accounts, signup, multi-tenant
  login" below for the full shape.

## Vocabulary (use these consistently in code)

- Contact = a lead/customer (generic on purpose: same person can be a lead
  to marketing and a debtor to payments)
- Workflow = a follow-up playbook (JSON: send/wait/branch/end steps)
- SequenceInstance = one contact's live position inside one workflow
- Pivot = killing a sequence because the contact acted, starting a sub-flow
- Gatekeeper = the pre-send checks (opt-out, quiet hours, caps, priority,
  idempotency)
- Event = one append-only history row; both the trigger source and the
  analytics source
- Account = the login identity (email + password), global across tenants
- User = one Account's membership + role in one Tenant (not the login
  itself anymore — see "Accounts, signup, multi-tenant login")

## UI language (what the owner sees — labels only, never rename tables)

Contacts → "Leads" · Workflows → "Follow-up plans" · enrollment → "Campaign"
· SequenceInstance → "where this lead is in the follow-up"
Lead stage lives in Contact.attributes.stage:
"new" | "contacted" | "interested" | "converted" | "lost" — updated by
workflow steps/events, shown as a colored badge + filter on the Leads page.

## Non-negotiable rules

1. EVERY database query filters by tenantId — always via requireSession()
   from auth.ts. No exceptions, including analytics.
2. Idempotency: every message send has a unique dedupeKey
   (`instanceId:stepId`); before sending, check it doesn't already exist.
   Retries must never cause double sends.
3. Official channel APIs only — never unofficial WhatsApp clients.
4. Prefer WhatsApp UTILITY templates (≈₹0.115/msg) over MARKETING (≈₹0.86);
   design flows to invite replies (replies open a free 24h window).
5. Opt-out handling ("STOP") is a launch feature, not an afterthought.
6. Never touch/commit .env, never log secrets, encrypt per-tenant channel
   credentials at rest.
7. Timezone-aware sends (default Asia/Kolkata), respect tenant quiet hours.
8. Validate every API input with zod. Excel imports must survive messy data
   (bad phones → row-level errors in Import.errorReport, never crash).

## Known quirk: Prisma client after schema changes

`npx prisma migrate dev` on this Prisma 7 setup has repeatedly left the
generated client stale (new model missing from node_modules/.prisma/client,
e.g. `prisma.newModel` undefined) even though the migration itself applied
fine. Fix: `rm -rf node_modules/.prisma node_modules/@prisma/client && npm
install @prisma/client@7.9.1 && npx prisma generate` — then verify with
`grep "get <modelName>" node_modules/.prisma/client/index.d.ts` before
trusting `tsc`/the dev server. Always restart the dev server after.

## Accounts, signup, multi-tenant login

Login identity was split from tenant membership (migration
20260811120000_account_tenant_membership_split): `Account` is the global
email+password; `User` is now a pure membership row (tenantId + accountId
+ role, unique on [tenantId, accountId]) with no email/password of its
own. This is what makes "one email, several businesses, pick one after
login" possible — same Account, two User rows.

- **Sign in** (auth.ts `authorize()`): looks up Account by email, checks
  the password, then loads ALL of that Account's User memberships
  (tenantId + tenant name + role each). The JWT carries the full
  membership list (`token.memberships`) plus, once chosen,
  `tenantId`/`userId`/`role` for the active one.
- **Auto-select**: exactly one membership → selected immediately at
  sign-in, zero extra steps for the common case. Zero or 2+ memberships →
  `tenantId` stays unset on the token.
- **The gate** (`app/(dashboard)/layout.tsx`, via `requireAccountSession()`
  in auth.ts): no tenant selected yet →
  zero memberships → renders `NoTenantEmptyState` (full-screen, mascot,
  "Create your own business" / sign out — no sidebar, since there's no
  tenant to show one for) right there, no redirect;
  2+ memberships → `redirect("/select-tenant")`.
- **`/select-tenant`**: the "modern, different kind of dashboard" —
  full-screen card grid, one card per Tenant (name + role), each a
  `<form>` whose Server Action calls `unstable_update({ user: { tenantId
  } })` (fires auth.ts's `jwt()` callback with `trigger: "update"`,
  re-selecting the token's active tenant WITHOUT a full re-login) then
  redirects to `/`. Also reachable any time (not just when ambiguous) via
  the sidebar's "Switch business" link (shown whenever `memberships.length
  > 1`), so someone already in a tenant can hop to another one.
  `requireSession()` (the one nearly every route/page calls) is
  unchanged in shape — it just now additionally throws "No tenant
  selected" if reached before a tenant is chosen; in practice the layout
  gate means that never happens for a real page load.
- **`/signup`** (`lib/accounts.ts` `signupNewBusiness`): creates a new
  Tenant (slug auto-generated + de-duped from the business name) and
  either a brand-new Account or, if that email already has one AND the
  password matches, adds this as a SECOND membership on the existing
  Account (exactly the "add another business to my login" case) —
  password mismatch is rejected with a clear error, never silently
  overwrites. Signs them in immediately after (same `signIn()` +
  `redirect()` shape as the login page's own server action). Public route
  (proxy.ts `PUBLIC_PATHS`).
- **Settings → "Add teammate"** (`app/api/users/route.ts`,
  `lib/accounts.ts` `getOrCreateAccountForInvite`): if the invited email
  already has an Account, just adds a new membership under it (their
  existing password keeps working, they may now need to pick a tenant
  next login) — the owner's typed "temporary password" is ignored in that
  case, not applied. Only genuinely new emails get a fresh Account with
  that temp password.
- **Emails** (`lib/mailer.ts`, Gmail SMTP via nodemailer): welcome-on-signup
  and added-to-a-business notifications, sent from `GMAIL_USER` (the owner
  said aryaadkoli@gmail.com for now, a proper business Gmail later — just
  swap `GMAIL_USER`/`GMAIL_APP_PASSWORD` in .env when that's ready). Falls
  back to `console.log`-ing the email when those env vars aren't set —
  verified live this way (both signup and add-teammate mock emails printed
  correctly with the right recipient/content). To make it real: Google
  Account → Security → 2-Step Verification → App passwords → generate one
  for "Mail" → `GMAIL_APP_PASSWORD` in .env (16 chars, no spaces).
- **Password change** (`/api/users/me/password`) now targets Account, not
  User — correctly account-wide, not per-tenant-membership.
- **Session hardening** (asked "does the JWT expire, is there a refresh
  token, make it as secure as possible" — answered inline: JWT strategy
  was already in place from day one, nothing to newly "implement" there):
  explicit `session.maxAge` (14 days) + `updateAge` (12h) in auth.ts —
  previously relied on NextAuth's implicit defaults (30 days/24h),
  now a deliberate, documented choice. No separate refresh-token grant
  exists (that's an OAuth-provider concept) — NextAuth's own rolling
  JWT re-issue on activity is the credentials-provider equivalent, and is
  what updateAge controls. Verified live: the actual session cookie's
  expiry timestamp matches the 14-day config exactly.
- **Brute-force protection** (`lib/rate-limit.ts`) — a small Redis-backed
  fixed-window counter (`INCR` + `EXPIRE` on first hit), reusing the
  same Redis instance BullMQ already needs, no new infra. Applied to
  login (`auth.ts` authorize(), keyed per email) and password-change
  (keyed per accountId): 5 attempts/15 minutes, 6th+ rejected outright —
  a throttled attempt returns the identical generic error as a wrong
  password so the throttle itself isn't detectable. Verified live: sent
  7 wrong-password attempts, confirmed the Redis counter incremented to
  7 with a live TTL, then confirmed the CORRECT password was ALSO
  rejected while still rate-limited (the actual test that matters, not
  just "wrong passwords fail") — then cleared the counter and confirmed
  login works normally again.

Verified live end-to-end: multi-membership login correctly leaves
`tenantId` null with both memberships listed; `/` correctly redirects to
`/select-tenant` in that state and correctly renders the empty state
(200, no redirect) for a zero-membership login instead; the pure
tenant-selection logic (`selectTenant()` in auth.ts, including rejecting
an unknown/tampered tenantId) verified directly since replaying a real
click through Next's Server Action RSC wire format isn't feasible via
curl (no browser available in this environment — this one piece relies
on NextAuth's documented `unstable_update` pattern + the isolated logic
test rather than a full click-through); signup verified by exercising the
real `signupNewBusiness()` function directly (creates Account+Tenant+User,
logs the correct welcome email) then confirming that exact email/password
logs in successfully with a single auto-selected tenant and the dashboard
renders immediately, no picker; add-teammate re-verified against the new
Account model end to end. All test accounts/tenants cleaned up after.

**Seeded logins** (prisma/seed.ts, SEED_ADMIN_PASSWORD in .env, default
`Password#123`):
- `aryaadkoli@gmail.com` — OWNER of two tenants (Surabharati, and
  Surabharati Energy — the electricity/smart-meters business from the
  earlier "we'll need a separate tenant" conversation). Logging in lands
  on `/select-tenant`.
- `admin@autobot.local` — zero memberships, for reviewing the empty state.

`upsertAccount()`/`upsertMembership()` in seed.ts are idempotent
(update-in-place on re-seed, matching the existing rename-safe pattern
used elsewhere in that file), so re-running `npx prisma db seed` after
someone changes a password through the app resets it back to
SEED_ADMIN_PASSWORD.

## Roadmap and current status

[x] Phase 1a: schema, migrations, seed, login/logout, dashboard shell,
    Overview counts, Contacts list  ← DONE, working locally
[x] Phase 1b: Leads UX — rename labels, stage badge + filter, lead detail
    page with Event timeline  ← DONE, working locally
[x] Phase 2: Imports — Excel upload, column-mapping UI, row validation,
    dedupe, import report; TagRules engine (INGEST trigger)  ← DONE, working
    locally. Nightly SCHEDULE sweep still open — needs the Phase 4 worker.
[x] Phase 3: Templates CRUD (Meta template name/language, numbered
    {{1}},{{2}} variables, image/PDF header media via Settings → Templates
    upload or URL) + "send test message"; lib/crypto.ts (AES-256-GCM) +
    Settings → WhatsApp connection UI to store real per-tenant Meta
    credentials; core/channels adapter now sends real Meta template-type
    API calls once connected, mock otherwise; Meta webhook (GET handshake,
    signature-verified POST, status updates, replies, STOP) ← DONE. Verified
    against real graph.facebook.com with test credentials (got a real Meta
    auth error back, proving the wiring is correct) — actually delivering
    messages still needs the real Meta Business setup only Dad can do (see
    Settings page checklist): verify 99009 43005 as a WhatsApp Business
    number and get at least one template APPROVED in Meta Business Manager.
[x] Phase 4: Workflow engine DONE — core/workflow/engine.ts (enroll,
    advanceInstance, wakeFromTimer, handleEvent, pivot,
    cancelActiveInstances), core/workflow/schema.ts (zod-validated step
    JSON: send/wait/branch/end, reuses core/tagging/rules.ts's condition
    tree for branch), core/workflow/send-step.ts (workflow sends — full
    gatekeeper + link-tracking + idempotent dedupeKey
    `${instanceId}:${stepId}`), core/gatekeeper/index.ts (the FULL
    gatekeeper: opt-out → quiet hours → daily cap → cross-service
    priority, DEFER vs SUPPRESS, not just skip). Redis found already
    running in a leftover `autobot-redis` Docker container from earlier
    scaffolding — just needed `docker start`; REDIS_URL in .env.
    core/workflow/queues.ts (BullMQ "workflow-advance" queue, deterministic
    job ids so re-scheduling replaces rather than duplicates).
    worker/index.ts is the real standalone worker process (`npm run
    worker`, what production/BLUEPRINT's architecture calls for);
    core/workflow/worker-runtime.ts is shared so instrumentation.ts also
    starts a copy in-process for dev — `npm run dev` alone is enough to
    see workflows advance locally, no second terminal needed. Link
    tracking DONE: core/workflow/link-tracking.ts rewrites outbound URLs
    in workflow sends to /r/{token} (app/r/[token]/route.ts — 302s,
    logs a LINK_CLICKED Event, calls handleEvent so a waiting instance can
    react). WhatsApp webhook now calls handleEvent() on REPLIED and
    cancelActiveInstances() on OPTED_OUT, not just recording the Event.
    Workflows page (app/(dashboard)/workflows) is real: a guided,
    JSON-free step builder is the default authoring experience (dad
    shouldn't have to write JSON) + Activate/Archive + Enroll-by-tag/stage
    (reuses the Campaigns filter pattern) + delete guard (blocks if any
    SequenceInstance, active or finished, references it — same pattern as
    Template/Tag deletion guards). Two seeded Services (Lead follow-up
    priority=50, Payment reminders priority=10) and one seeded DRAFT demo
    Workflow ("Lead intro + reply check") so the page isn't empty on
    first load.
    Guided builder (app/(dashboard)/workflows/simple-builder.ts +
    step-card.tsx + workflow-modal.tsx): the owner adds plain-language
    step cards — "Send a message" (pick a Template from a dropdown),
    "Wait" (a number + minutes/hours/days, with "If they reply…"/"If
    they click a link…" reaction dropdowns — both symmetric, each can:
    do nothing / end with a specific outcome / skip ahead to a later step
    / switch to another workflow), "Check lead's stage" (if stage is X,
    skip ahead — otherwise continue normally). Outcomes are user-defined,
    not fixed to one "done" — an "Outcomes" section lets the owner add
    named endings (e.g. "Replied", "No response", "Lost") and every
    skip/reaction dropdown offers all of them, so the exact "two
    different endings" shape BLUEPRINT's own example workflow uses is
    fully representable in the guided UI, not just JSON.
    buildDefinitionFromSteps(steps, endings) turns that into the exact
    JSON the engine already ran (auto-generates step_1/step_2/... ids;
    ending ids are either carried over from parsing or freshly generated)
    — no engine changes needed. Deleting a step or an outcome that
    another step's reaction points at is blocked with a message naming
    which step references it, rather than silently corrupting a target.
    tryParseSimpleWorkflow() is the reverse direction for editing: walks
    the definition's main chain, collects every end-type step as a
    candidate outcome, and reconstructs the card list + outcome list ONLY
    if it fits the guided model — forward-only skips, simple
    stage-equality branches, m/h/d wait durations, at most one reaction
    per event per wait step. Anything fancier (a genuine loop, a backward
    jump, a branch on something other than stage, a duration in seconds)
    returns null and the modal falls back to a raw JSON textarea instead
    ("Advanced" mode, reachable either automatically on edit or via a
    "Prefer to write this as JSON instead?" link when creating).
    Verified live: the seeded demo workflow (two distinct end outcomes,
    replied vs no_response) now correctly parses into TWO guided outcome
    cards instead of falling back to Advanced — closed after initially
    shipping a single-outcome-only version and the owner asking "are all
    the same things as the JSON carried forward?". Built the exact same
    multi-outcome JSON the guided UI now produces, ran it through the
    real engine with 9 enrolled leads, simulated a reply for one of them
    ahead of the timer — confirmed it landed on the "Replied" outcome
    while the other 8 correctly timed out to "No response". Known
    remaining JSON-only capabilities (documented, not silently hidden):
    branch conditions on anything other than lead stage (op/attr
    combinations from core/tagging/rules.ts — contains/gt/lt/
    olderThanDays/etc. against arbitrary contact attributes), wait
    durations under a minute, pivot-on-reply combined with skip-on-click
    on the very same wait step in a way that isn't independently
    representable per-event (both events ARE independently
    configurable — this only bites a step wanting e.g. two different
    goto targets for the same single event, which no real workflow needs).
    Verified live end-to-end against real Redis (not mocked): enrolled 9
    leads into a workflow with a 10s wait — watched all 9 send
    synchronously, sit ACTIVE with a real BullMQ delayed job, then the
    in-process worker fired and completed them automatically with zero
    manual trigger. Separately verified the event-driven path: simulated
    a REPLIED event for one of 9 enrolled contacts — that instance jumped
    straight to its goto target and its pending BullMQ job was confirmed
    actually removed from Redis (checked via redis-cli), while the other
    8 stayed correctly waiting on their timer. All test workflows/
    instances/messages/events cleaned up after.
    Known limitation (documented, not hidden): DEFER (quiet
    hours/daily cap/priority) retries once after a fixed delay by
    re-scheduling the same BullMQ job — there's no smarter backoff or a
    cron sweep for missed retries yet. Editing a workflow's definition
    while it has ACTIVE instances is blocked (their currentStepId could
    reference a step that no longer exists) — archive+duplicate instead.
[~] Phase 5 (started early): campaign enrollment UI DONE — Campaigns page
    sends one template to every lead matching a tag/stage, OR an uploaded
    Excel/CSV list (reuses core/ingestion/upsert.ts: dedupes on phone,
    auto-creates/updates leads, runs TagRules — same pipeline as Imports,
    verified live including in-file duplicate rows collapsing to one send).
    Campaign model logs every run (source, counts) for a "Recent campaigns"
    history list. core/channels/send.ts is a gatekeeper-lite: opt-out +
    Tenant.dailyCapPerContact enforced (verified live — 4th send in 24h to
    the same contact correctly skips). Template deletion now blocked by
    Campaign usage too, not just Message usage. Up to 200 sends/run, no
    queue yet. Quiet hours now DONE too — core/gatekeeper/quiet-hours.ts
    computes the tenant's local hour (Tenant.timezone) and skips (not
    defers — no queue yet) any send inside Tenant.quietHoursStart/End,
    same skip-and-record-reason pattern as the daily cap. Settings →
    "Sending limits" (owner-only) edits both via PATCH
    /api/settings/limits. Verified live: set quiet hours to cover the
    current hour, confirmed all 9 sends skipped with the exact reason
    string, reverted, confirmed sends succeed again. Cross-service
    priority now DONE too, but only for workflow-driven sends (see
    Phase 4 below) — Campaigns are immediate/manual and have no
    "service" of their own to prioritize against, so they still use this
    lighter gatekeeper.
    Analytics page DONE — /analytics (sidebar link live, no longer "soon"):
    delivery/read/failed rates from Message.status, a 14-day sent-messages
    trend chart (hover a bar for the exact count), running ₹ spend estimate
    from costPaise, and per-campaign success rate — all read-only queries
    over existing Message/Campaign rows, tenant-scoped, no schema change.
    Honestly shows 0%/— for delivered/read until WhatsApp is really
    connected (mock sends never get delivery webhooks) instead of faking a
    number. Verified live with a real 9-contact campaign, then cleaned up.
    Extended with two more sections once the workflow engine landed: "Top
    templates by volume" (sent/delivered/failed grouped by templateId) and
    "Workflow outcomes" (per workflow — how many leads are still active vs
    which named outcome they landed on, walking currentStepId back to its
    definition's outcome label via core/workflow/outcome-label.ts — shared
    by Analytics, the Lead detail page, and the Lead detail modal's API
    route, not reimplemented three times). Overview page
    (app/(dashboard)/page.tsx) also de-placeholdered: "This week" (delivery/
    reply/click rate, 7-day window) and "Recent activity" (last 8 real
    Events, reusing contacts/event-meta.ts's label/dot-color helpers) used
    to be permanently "Soon" placeholders with fake copy — now real
    queries, verified live with a real campaign send (9/9 sent, 0%
    delivered as expected since mock sends never get delivery webhooks,
    correct nonzero reply rate from genuine historical event data), then
    cleaned up.
    More small real-data additions: Templates page shows a "Sent" column
    per template (hover for delivered/failed breakdown) instead of no
    usage visibility at all. Lead detail (both the full page and the
    quick-view modal used from the Leads list, plus its API route) now
    shows a "Workflows" section — which workflow(s) this lead is/was in
    and their status or reached outcome — closing the last "Soon"
    placeholder that wasn't actually true anymore (the old copy said
    "once imports and workflows are running" — they now are). Self-service
    password change added to the Account modal (PATCH
    /api/users/me/password, verifies current password via bcrypt.compare
    first) — replaced "password reset... coming soon"; notification
    preferences is the one honestly-still-future item left there.
    Verified live: wrong-current-password rejected, correct change
    accepted, logged in with the new password, changed it back.
    ALSO DONE: ScheduledCampaign — "on this
    date, send this template to this tag/stage" — picked up automatically
    by an in-process poller (instrumentation.ts, SCHEDULER_INTERVAL_MS env
    override for testing, 60s default) since there's no Redis/BullMQ yet.
    Verified live: scheduled a real send 10s out, watched it fire on its
    own with zero manual trigger, correct recipients, correct history row.
    This is the mechanism for "mango farmers get message X every January" —
    dad just needs one ScheduledCampaign per planned send. Recurrence is now
    built: a schedule can be set to repeat Monthly/Yearly (Campaigns UI
    "Repeat" dropdown when scheduling); once it fires, runDueScheduledCampaigns
    automatically queues the next occurrence (same template/tag/stage, date
    advanced by a month/year) — verified live end-to-end (scheduled 8s out
    with MONTHLY, watched it fire and a new PENDING row appear exactly one
    month later, cleaned up after). Cancelling one occurrence does not cancel
    future ones in the chain (each row is independent). Campaigns page also
    has a visual month calendar (toggle "Calendar"/"List") for the upcoming
    scheduled sends — click a day to see/cancel what's scheduled — so
    planning several crops/products across different months is glanceable
    instead of just a table.
    "Plug in real WhatsApp and see it work" tooling: Settings has a "Test
    connection" button (calls Meta's phone-number-info endpoint — confirms
    credentials work and shows verified name/quality rating without
    spending on a real message) and Templates has a "Check approval" button
    (queries Meta directly for a template's real approval status instead of
    assuming APPROVED) — both verified live against real graph.facebook.com
    with fake credentials (got the real Meta auth error back both times,
    proving the wiring, not just the code, is correct). Settings' setup
    checklist now also covers exposing the webhook via ngrok for local
    testing before this app is deployed anywhere public.
    TODO in ~2 days (scheduled reminder trig_015E6qtYwMtP44vQ9zs7EUdz,
    2026-08-12): revisit creating a second Tenant for Dad's electricity/
    smart-meters business — kept separate from the agri-business tenant.
[ ] Phase 6: Email (Brevo) adapter, ingest API, settings. (SMS dropped —
    not integrating for now; no SMS code/schema fields remain in the
    codebase as of the recurrence/calendar session.)
[~] Phase 7: Deployment — going step by step (owner directing, 5 steps
    total), Oracle Cloud "Always Free" VM chosen (genuinely free forever,
    matches the already-built architecture — no serverless rework
    needed; Vercel was considered and rejected: no persistent process for
    instrumentation.ts's scheduler/worker, Hobby-tier cron is once/day
    only, ephemeral filesystem breaks template image uploads, no
    included Postgres/Redis anyway).
    Step 1/5 DONE: next.config.ts now has `output: "standalone"` (lean,
    Docker-ready build) + `outputFileTracingRoot` (fixes a real
    multi-lockfile workspace-root misdetection warning). Verified live,
    not just built: ran the actual `node .next/standalone/server.js`
    (exactly what Docker will run) with static assets manually copied in
    alongside it, confirmed instrumentation.ts's scheduler + in-process
    workflow worker both start, confirmed a real login round-trip
    against it (multi-tenant session data correct), confirmed a static
    CSS asset actually serves. Reverted to normal `npm run dev` after.
    Step 2/5 DONE: Dockerfile (multi-stage: base → builder → web/worker
    targets) + .dockerignore + .npmrc. Two real bugs found ONLY by
    actually building/running the images (not by reading the Dockerfile):
    (1) `npm ci` is stricter than the `npm install` used locally and
    failed on next-auth's optional nodemailer peer-dep range (9.0.5 is
    pinned deliberately for a real CVE fix that doesn't exist in 8.x) —
    fixed via .npmrc's `legacy-peer-deps=true` (not a CLI flag — `npm ci
    --legacy-peer-deps` isn't accepted the way `npm install` accepts it).
    Also caught genuine package-lock.json drift (`npm ci` refused to
    proceed, `@emnapi/runtime` missing) — fixed at the source with a
    real `npm install` + lockfile commit, not papered over. (2)
    prisma.config.ts requires DATABASE_URL to be *set* just to load
    (`prisma generate` itself never connects) — .env is deliberately not
    in the Docker build context, so the builder/worker stages set a
    throwaway placeholder DATABASE_URL via ENV, overridden by the real
    one at container runtime.
    lib/redis.ts hardened at the same time: an unhandled ioredis `error`
    event was crashing/spamming during `npm run build` (Redis wasn't
    running) — added an error listener so a Redis hiccup logs a warning
    instead of an unhandled exception. auth.ts also got `trustHost: true`
    — a real, tested finding: `npm run build && npm run start` throws
    NextAuth's "UntrustedHost" on the very first request otherwise; dev
    mode never surfaces this since it trusts localhost automatically.
    Verified live, not simulated: built both the `web` (436MB) and
    `worker` (2.3GB — full node_modules+source, since tsx isn't
    traceable the way `next build` traces the web image) targets for
    real, ran BOTH containers against the real local Postgres+Redis
    (`--network host`), did a real login round-trip against the
    containerized web server (correct multi-tenant session data), and
    confirmed the worker container connects cleanly. Also drove one full
    real scheduled-campaign cycle through the containerized app end to
    end (insert a due row → watched the container's scheduler tick,
    process it, flip it to SENT with real mock-adapter sends to real
    leads) — chased down what first looked like a scheduler bug (row
    stayed PENDING) that turned out to be MY test methodology: a raw
    `psql` insert using session-local `NOW()` (Asia/Kolkata) got stored
    as a naive timestamp 5.5h ahead of true UTC, while the app itself is
    internally consistent (Node `Date`/UTC on both write and read paths)
    — not an app bug, but worth remembering: Step 3's docker-compose
    Postgres service must NOT set a non-UTC container TZ, or this exact
    footgun becomes reproducible for real. All test containers/images
    kept locally (autobot-web:test, autobot-worker:test) for Step 3;
    all test DB rows cleaned up; local `npm run dev` confirmed working
    again after.
    Step 3/5 DONE: docker-compose.yml — postgres (UTC, no TZ override —
    see Step 2's timestamp footgun), redis, web, worker, caddy, with
    healthcheck-gated startup ordering (web/worker wait for postgres+redis
    to report healthy, not just "started"). DATABASE_URL/REDIS_URL are
    set directly in compose (service-name hostnames: postgres:5432,
    redis:6379), not left to .env, so a wrong local-style URL in .env
    can't silently break the containerized wiring; DB_PASSWORD is the
    one secret compose substitutes in. Caddyfile is a real placeholder
    (plain :80, no domain yet — Step 4 finalizes it with automatic HTTPS).
    Verified against the FULL real stack, not simulated: `docker compose
    up` (with a throwaway, gitignored, never-committed .env copy used
    only for this local test — the real .env/docker-compose.yml were
    reverted after), all 5 containers reached healthy/running, ran
    `prisma migrate deploy` and the new production seed (see below)
    INSIDE the running worker container exactly as a real deployment
    would, then logged in through Caddy → web → Postgres end-to-end —
    correct single-tenant session, confirmed the Leads page genuinely
    empty ("No leads") and Workflows' "+ New workflow" enabled (proving
    the seeded Service scaffolding works) via the actual running stack,
    not assumption. Confirmed the original local dev database was
    completely untouched throughout (separate Docker volume). Torn down
    and cleaned up completely after; local `npm run dev` confirmed
    working again.
    Also this session: a real production seed now exists —
    prisma/seed.prod.ts (run manually via `npx tsx prisma/seed.prod.ts`,
    deliberately NOT what `npx prisma db seed` runs — that stays the rich
    local dev dataset in prisma/seed.ts). Creates exactly one Tenant
    ("Surabharati"), one Account (aryaadkoli@gmail.com, OWNER, password
    from SEED_ADMIN_PASSWORD — refuses to run if that's unset rather than
    defaulting to something guessable), and one minimal Service ("Lead
    follow-up") — the one deliberate non-demo-data exception, since
    there's currently no UI to create a Service and a zero-Service tenant
    would have Workflows permanently disabled with no way to unblock it.
    No leads/tags/templates/workflows/campaigns. Verified idempotent (ran
    twice against a real fresh database, second run changed nothing) and
    verified against the real compose stack above, not just a unit check.
    Settings also reworked per explicit request: the whole "Team members"
    section (not just the add/remove actions, which were already
    owner-gated) is now owner-only — an ADMIN/AGENT teammate no longer
    sees who else is on the team or what role they hold. Verified live
    with a real temporary owner + admin account pair: owner's Settings
    page shows "Team members"/"Add teammate", admin's does not (while
    still correctly showing WhatsApp connection/Sending limits, which
    stay visible read-only to everyone) — cleaned up after.
    Steps 4-5 done in a later session. Domain: autobot.urvanidhi.com (a
    subdomain of the owner's existing urvanidhi.com, already live on
    Vercel for a separate marketing site — no conflict, different
    subdomain). Caddyfile now has that real domain (was a :80 placeholder)
    — validated with `caddy validate`, confirmed HTTPS + auto-redirect
    configured correctly (can't get a real cert until DNS points at the
    VM, which doesn't exist yet). .env.production.example documents every
    var the VM's real .env needs — APP_URL=https://autobot.urvanidhi.com,
    fresh AUTH_SECRET/CREDENTIALS_KEY (never reuse dev's), DB_PASSWORD,
    SEED_ADMIN_PASSWORD, GMAIL_USER=urvanidhi@gmail.com, Meta vars left
    blank (still deferred — see below).
    deploy/bootstrap.sh (one-time VM setup: Docker, 2GB swap file for the
    free-tier 1GB-RAM shape, ufw), deploy/backup.sh (nightly pg_dump,
    gzip, 14-day rotation), deploy/restore.sh (drop+recreate+restore,
    confirms before running since it's destructive), docs/RUNBOOK.md
    (the actual deploy-day walkthrough + ongoing ops: updates, migrations,
    logs, secret rotation, disk cleanup).
    Backup/restore verified for real, not just read: spun up a throwaway
    postgres container via `docker compose --env-file .env.compose-test
    up postgres` (gitignored test env, never the real one), inserted a
    marker row, ran the actual backup command, dropped the table
    (simulating data loss), ran the actual restore command, confirmed the
    marker row came back. Fully torn down after (`down -v`) — real local
    dev Postgres (a separate, non-compose instance) confirmed unaffected
    throughout (contact count unchanged).
    WhatsApp real-number connection is a separate, still-open item — the
    owner's dad's number (9900943005) is currently active in the regular
    WhatsApp Business consumer app, and Meta's Cloud API requires
    exclusive ownership of a number (can't run in both at once). Decided
    to defer: either get a spare SIM dedicated to the API (recommended,
    zero disruption) or migrate the existing number later once the
    person using it is looped in — not done without their knowledge.
    Deployment itself doesn't depend on this either way; the app just
    won't send real WhatsApp messages until a number is connected via
    Settings, same mock-fallback pattern as email currently has for Gmail.
    Still not started/deferred: actually provisioning the Oracle Cloud
    VM, pointing DNS at it, and running through docs/RUNBOOK.md for real
    — that's the owner's own next action, not something done from here.
    Account emails now send from urvanidhi@gmail.com (GMAIL_USER in .env),
    switched from aryaadkoli@gmail.com — durable, keep using this account
    going forward. Verified via a one-off script sending the real prod
    login (aryaadkoli@gmail.com / a freshly-generated random password) to
    aryaadkoli@gmail.com; script deleted after use.
    Found and disclosed to owner: ADMIN and AGENT roles have NO distinct
    enforcement anywhere in the code — every permission check in the app
    is `session.role === "OWNER"` / `!== "OWNER"` (settings/limits,
    settings/whatsapp, users routes). The schema's enum comments describing
    ADMIN as "can edit workflows/templates" vs AGENT as "read-only" are
    aspirational and were never built. Added a small owner-only "Roles"
    reference panel to Settings (app/(dashboard)/settings/roles-reference.tsx)
    that describes this honestly rather than the aspirational schema intent.
    Owner chose "do it now" when asked how to sequence this against
    deployment. Built: `Role` is now a real per-tenant table (prisma/
    migrations/20260827101815_role_table — renames the old enum type out
    of the way, creates Role, seeds OWNER/ADMIN/AGENT per existing tenant,
    backfills User.roleId from the old enum column, drops the enum).
    isSystem=true marks the 3 built-ins — they can never be renamed or
    deleted since session.role === "OWNER" checks depend on that exact
    name existing. lib/roles.ts's createSystemRoles()/SYSTEM_ROLE_NAMES is
    the shared helper (used by signupNewBusiness, both seed scripts).
    New endpoints: POST /api/roles (create custom role, owner-only),
    DELETE /api/roles/[id] (owner-only; refuses on isSystem; soft-deletes
    — sets deletedAt, keeps the row and everyone's assignment — if
    anyone currently has the role, hard-deletes only if unused).
    /api/users POST now takes roleId instead of a role enum string, and
    validates it belongs to the tenant and isn't OWNER. Settings' Roles
    reference panel (roles-reference.tsx) is now interactive: lists all
    roles (built-in + custom, soft-deleted ones grayed out with a
    "Deleted" tag and member count), lets the owner add a custom role or
    delete one, and keeps the honest note that ADMIN/AGENT/custom roles
    are all functionally identical today (no fine-grained permissions
    built yet — that's still open, see above). UserModal's role <select>
    now lists the tenant's actual assignable roles (non-deleted,
    non-OWNER) instead of a hardcoded ADMIN/AGENT pair.
    Verified live end-to-end against a throwaway single-tenant test
    account (never against real data): created 2 custom roles, invited a
    teammate into one via /api/users, confirmed a role with 2 members
    soft-deletes (row stays, tag shows "Deleted", both members keep it),
    confirmed a role with 0 members hard-deletes (row actually gone),
    confirmed DELETE on a system role's id returns 400. All test
    rows deleted afterward; real demo dataset counts (2 tenants, 6 roles,
    2 users, 11 contacts) confirmed unchanged.
    Real mistake made and caught during this verification, worth
    remembering: prefixing `GMAIL_APP_PASSWORD=` on a `curl` command only
    clears it in *that shell* — the already-running dev server process
    still has the real value from .env (Next.js reads .env directly, a
    shell-level unset doesn't reach it), so an API call that triggers
    sendAccountEmail() still fires a real send. This caused one real
    (harmless — to a fake, non-existent address) send to
    field-tester-internal-test@example.com from urvanidhi@gmail.com,
    disclosed to the owner immediately. The correct way to force the
    mailer's mock fallback for a test: comment out GMAIL_USER/
    GMAIL_APP_PASSWORD in the actual .env file, restart the dev server,
    run the test, then restore .env and restart again — not a shell-level
    env prefix on the client-side test command.

Follow-up session: owner asked (1) what roles exist, (2) whether CRUD
+ soft-delete exists everywhere, (3) to redesign the role set (OWNER,
CO_OWNER, one more role for now) with owner-choosable per-module
view/edit permissions on every role, enforced on every API route.
Answered (1)/(2) directly, then built (3) in full — a real permission
system, not just the role table from the prior entry.

Schema (two more migrations on top of the Role-table one):
20260827110000_soft_delete_core_models added deletedAt to Contact, Tag,
MessageTemplate, Workflow, User and (first attempt) made their unique
constraints partial (WHERE deletedAt IS NULL). That broke immediately —
confirmed live, not just type-checked — because Postgres refuses to
match `.upsert()`'s generated `ON CONFLICT (col,col)` clause against a
partial index. 20260827130000_revert_partial_unique_indexes reverted
all six (Contact/Tag/MessageTemplate/Workflow/User/Role) back to plain
unique constraints, matching schema.prisma exactly. Real cost of that
revert: a soft-deleted row's key stays reserved rather than freeing up
automatically — so anywhere recreating the same key is a plausible
action (re-add a deleted contact/tag/role, re-invite a removed
teammate), the create path explicitly checks for and resurrects the old
row (clears deletedAt, replaces its data/permissions) instead of trying
to insert a duplicate: app/api/contacts/route.ts,
core/ingestion/upsert.ts (contact + tag), app/api/roles/route.ts,
app/api/users/route.ts. Where that resurrection wasn't added
(Tags/Templates/Workflows' own dedicated create-if-missing checks,
contacts/[id]/route.ts's phone-change-on-edit case), a stale key still
just falls through to a real P2002 caught by the existing "already
exists" error handling — never a crash, just not auto-resurrected.
lib/db.ts now wraps the Prisma client in a query extension (Prisma's
own documented soft-delete recipe) that rewrites .delete()/.deleteMany()
on those 5 models into an update setting deletedAt, and injects
`deletedAt: null` into findMany/findFirst/findFirstOrThrow/count. A
second export, `prismaIncludingDeleted`, is the unfiltered base client —
used only by the resurrection call sites above. findUnique/
findUniqueOrThrow are deliberately unfiltered (matches Prisma's own
recipe) since whether a soft-deleted row should count there is decided
per call site, not globally.
Role model (separate from the extension, hand-rolled) gained a real
Module enum (LEADS/TEMPLATES/CAMPAIGNS/WORKFLOWS/ANALYTICS/TEAM/
SETTINGS) and RolePermission table (roleId, module, canView, canEdit).
System roles renamed ADMIN→CO_OWNER, AGENT→MEMBER for every existing
tenant (data migration, not just relabeling — existing User rows keep
their roleId, so nobody's actual membership changed). OWNER and
CO_OWNER bypass RolePermission entirely — lib/permissions.ts's
isOwnerTier() grants them full view+edit on every module unconditionally,
they never get rows in the table. MEMBER gets real default permissions
(view-only on LEADS/TEMPLATES/CAMPAIGNS/WORKFLOWS/ANALYTICS, no access
to TEAM/SETTINGS) seeded via lib/roles.ts's createSystemRoles() for new
tenants and a one-time backfill in the rename migration for existing
ones. Custom roles start with whatever permissions the owner picks in
the "Add role" form (app/(dashboard)/settings/roles-reference.tsx) and
default to none for anything left unchecked.
CO_OWNER's one restriction (can't remove or demote an OWNER/CO_OWNER
account, can't grant CO_OWNER to someone else) is hardcoded in
app/api/users/route.ts and [id]/route.ts, not modeled as a permission —
it protects the ownership structure itself, which no permission toggle
should be able to touch.
Permissions are computed once at login (auth.ts's authorize(), via
lib/permissions.ts's computePermissions()) and embedded in the JWT next
to role/tenantId — same pattern as everything else in the session, so a
permission change an owner makes doesn't take effect for someone
already logged in until they log in again (documented limitation,
consistent with how a role reassignment already worked before this).
requireSession()/requireAccountSession() both now return `permissions`.
Every API route that touches Leads/Tags/Imports (LEADS),
Templates (TEMPLATES), Campaigns/ScheduledCampaigns (CAMPAIGNS),
Workflows (WORKFLOWS), Team/Roles (TEAM), or WhatsApp/sending settings
(SETTINGS) now calls lib/permissions.ts's requirePermission() instead of
a hardcoded `session.role !== "OWNER"` check — Analytics has no API
(SSR-only) so it's gated at the page level only. Every corresponding
dashboard page also checks canView() server-side and renders a shared
NoModuleAccess component instead of the real content when it's false —
defense in depth alongside the API checks, and the sidebar
((dashboard)/layout.tsx) filters nav links the same way so there's
nothing to click into in the first place.
Verified live end-to-end against a throwaway tenant (owner + a MEMBER +
a CO_OWNER + a custom FIELD_AGENT role), never against real data:
MEMBER can view Leads but a create POST 403s; MEMBER's Settings page
renders the empty-access message and GET /api/users 403s; the sidebar
genuinely omits the Settings link for MEMBER; CO_OWNER blocked from
removing the OWNER and from granting CO_OWNER to someone else; a
contact soft-deleted then re-created with the same phone resurrects the
same row (same id, visible again); a role soft-deleted while in use
(assignedCount>0) keeps the assigned teammate's access, then recreating
the same name resurrects the same row with the new permissions
replacing the old ones; a removed teammate re-invited by email
resurrects their same User row rather than duplicating it. Real login
(aryaadkoli@gmail.com) and both real tenants' data (2 tenants, 6 roles
post-rename, 2 users, 11 contacts) confirmed unchanged afterward. All
test accounts/tenants/roles deleted after. Repeated the earlier
session's mailer mistake once during this verification (a real send
attempt to a fake address, caught immediately, same root cause —
`GMAIL_APP_PASSWORD=` prefixed on a curl command doesn't reach the
already-running dev server's process env) — fixed properly this time by
commenting the vars out of .env itself and restarting, and disclosed
to the owner as it happened rather than after.
Not done: BusinessType/Service still have no CRUD UI/API at all (only
usable via the seed scripts) — flagged to the owner, not built this
session. Campaign/Message/Event were deliberately NOT made
soft-deletable — they're send/audit logs, not editable content.

Full pre-prod security/RBAC audit (owner asked "is RBAC/JWT applied
everywhere, check and implement, clear junk, and where do uploads live
in prod vs local"). Confirmed the good news first: every one of the 28
API route files requires a session (requireSession()/
requireAccountSession()) and, on top of that, every module-scoped one
calls requirePermission() — auditable via `grep -c requireSession\|
requirePermission` across app/api. The only routes with no session
check are the 3 that legitimately don't need one: NextAuth's own
handler, the Meta webhook (protected by HMAC signature + verify-token
instead, correctly using timingSafeEqual), and users/me/password (any
authenticated account can change its own password, no module applies).
Every mutation that takes a bare `{id}` (after an initial ownership
findFirst) was checked and confirmed safe — no IDOR found anywhere.
Real bugs found and fixed, not just theoretical:
  - **Cross-tenant data leak in the WhatsApp webhook**: inbound-message
    handling looked up a contact by phone alone, with no tenant scoping
    — since phone is only unique per-tenant, two tenants sharing a
    customer's phone number could have had their replies/opt-outs
    misattributed to the wrong tenant. Fixed by resolving the owning
    tenant from the webhook payload's `metadata.phone_number_id` first
    (every real Meta payload carries it) before touching any contact.
  - **PII leak on the Overview dashboard**: it had no module of its own
    (a summary page, shown to everyone with a tenant) but unconditionally
    queried and rendered lead names/phone numbers in a "recent activity"
    feed, plus Leads/Campaigns/Workflows stats — all regardless of the
    viewer's actual module permissions. A role with LEADS view=false
    would still see leads' names right there on login. Fixed: every
    section (and its underlying query — not just the render) is now
    gated by canView() for the module it actually belongs to.
  - **Missing permission check on `/contacts/[id]`**: the list page
    checked canView(LEADS), the API route checked it, but the individual
    lead detail *page* (a separate server component querying Prisma
    directly) only checked tenant isolation, not the module permission —
    a gap in an otherwise-consistent pattern. Fixed to match.
  - **No rate limiting on signup**: login and password-change were
    already throttled (lib/rate-limit.ts); the public, unauthenticated
    signup Server Action had none — scriptable for spam-tenant creation,
    and its own error message doubles as an account-existence oracle
    ("this email already exists, wrong password"). Added the same
    5-attempts/15-min throttle, keyed by email.
  - **checkRateLimit could hang forever, not just fail**: the shared
    Redis client is configured with `maxRetriesPerRequest: null`
    (required elsewhere for BullMQ's blocking commands) — found by
    actually stopping Redis and testing, not by reading the code, that
    this makes a command queue and wait *indefinitely* rather than
    reject while Redis is down. Every login/signup/password-change
    would have hung forever during any Redis blip, unrelated to whether
    Postgres (the real source of truth for auth) was fine. Fixed with a
    1.5s timeout that fails OPEN (allows the request, logs a warning) —
    verified in isolation afterward: exactly ~1501ms, `{allowed:true}`.
    (The full HTTP path measured slower — several seconds — due to
    Next.js dev-server request overhead layered on top; the core
    fail-open mechanism itself is proven correct and bounded.)
Uploads (app/api/templates/upload/route.ts, saves to public/uploads/):
local dev writes straight to the real `public/uploads/templates/` folder
on disk (gitignored — confirmed, never at risk of being committed) and
persists fine across dev-server restarts. Production was a real,
confirmed-live gap: the Dockerfile bakes public/ into the image at
*build* time, and docker-compose.yml had no volume for the runtime
uploads path — every `docker compose up --build` (i.e. every deploy)
would have silently wiped every uploaded template image/PDF. Fixed with
a named volume (`uploads:/app/public/uploads` on the `web` service
only — worker never needs it, Meta fetches media by public URL, not
from disk). That surfaced a second bug immediately on testing: a fresh
named volume is created root:root by Docker, but the container runs as
the non-root `nextjs` user (a deliberate security choice, kept) — so
uploads would have failed outright with a permission error the first
time anyone tried. Fixed in the Dockerfile (chown the directory before
the USER switch, so Docker seeds the new volume with that ownership).
Verified for real: built the image, wrote a file as the nextjs user,
force-recreated the container (exactly what a redeploy does), confirmed
the file was both still there AND still writable afterward. Fully torn
down after; real local dev data confirmed unchanged (2 tenants, 11
contacts).
Junk-code sweep: no leftover console.log/debug statements beyond the
one intentional mock-channel logger, no TODO/FIXME markers, no
commented-out dead code, no stray scratch/test files or *.bak/*.old
files in the repo, no hardcoded secrets in source (only prisma/seed.ts's
local-dev-only fallback password, which is intentional and never used
by seed.prod.ts). One pre-existing loose end flagged but not removed:
the `ApiKey` model in schema.prisma is unused — a planned external-
ingest endpoint (`/api/ingest`, mentioned in docs/BLUEPRINT.md) was
never built. Left in place rather than deleted since removing a model
is a real schema decision, not "cleanup" — the owner should decide
whether to build the feature or drop the table.

Work on exactly ONE phase item per session unless told otherwise.

## How to work with me (the owner)

- I'm a CS student, NEW to frontend and backend/deployment. Explain
  each step in one plain-language line before doing it.
- Propose → show diff → I approve. Small steps over big bangs.
- After each working feature, remind me to commit with a suggested message.
- If something needs an external account/credential we don't have yet
  (Meta, Brevo...), build against a mock adapter and tell me what to set up.
- If a request conflicts with the Non-negotiable rules, say so and propose
  the compliant alternative.