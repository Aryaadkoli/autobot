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
  NextAuth v5 (credentials, JWT sessions carrying tenantId), BullMQ + Redis
  (worker phase), zod for all validation.
- Business logic lives in core/ (framework-free, no Next.js imports) —
  routes and worker processors are thin shells calling into core/. This
  keeps logic testable and portable.
- Multi-tenant: every business using the platform is a Tenant (the family
  business is tenant #1; future paying clients are tenants #2, #3...).
  Every table carries tenantId. The word "tenant" stays in code only —
  never in the UI.

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

## Local login

Seeded owner login: aryaadkoli@gmail.com / Password#123 (SEED_ADMIN_PASSWORD
in .env). prisma/seed.ts renames the existing user in place (by id) if it
still has an old email rather than creating a duplicate account — same
pattern as upsertTag's rename-safe lookup — so re-seeding after changing
this is safe.

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
[ ] Phase 7: Deployment — Docker Compose, Oracle Cloud VM, Caddy, domain,
    backups (guide: docs/02_HOSTING_AND_ACCOUNTS.md if present)

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