# Two things get built from this one file: the "web" target (the lean,
# standalone Next.js server) and the "worker" target (the same codebase,
# running core/workflow's BullMQ consumer via tsx — see worker/index.ts).
# docker-compose.yml picks one or the other per service with `target:`.
#
# node:22-slim (Debian), not alpine — Prisma's native query engine has a
# smoother, better-documented story on glibc than on Alpine's musl libc,
# and reliability matters more than a few extra MB for a first deploy.

FROM node:22-slim AS base
WORKDIR /app
# openssl: Prisma's query engine needs it at runtime, not just build time.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json .npmrc ./
# .npmrc sets legacy-peer-deps=true: next-auth optionally peer-depends on
# nodemailer ^7||^8 for its (unused here — this app only uses the
# Credentials provider) Email magic-link provider. nodemailer is pinned
# to 9.0.5 deliberately, for a real security fix (GHSA-p6gq-j5cr-w38f)
# that doesn't exist in the 8.x line — downgrading to satisfy the peer
# range would reintroduce that vulnerability, so the conflict is
# overridden instead. `npm install` (used locally) resolves this
# leniently on its own; `npm ci` is strict and fails without this —
# caught by actually building this image, not assumed.
RUN npm ci

# ---- Builder: generates the Prisma client, then the Next.js build ----
FROM base AS builder
WORKDIR /app
COPY . .
# prisma.config.ts requires DATABASE_URL to be *set* to load at all (even
# though `generate` itself never connects to it) — .env is deliberately
# not copied into the build context (real secrets don't belong baked into
# an image layer), so this placeholder only exists to satisfy that
# config-loading check. docker-compose overrides it with the real value
# as a runtime environment variable; this fake one is never used to
# actually connect to anything.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npx prisma generate
# On a 1GB-RAM free-tier VM, `next build`'s default V8 heap sizing
# under-detects available memory and crashes with "JavaScript heap out
# of memory" before it ever touches the swap file deploy/bootstrap.sh
# sets up — confirmed live on a real t3.micro. Raising max-old-space-size
# explicitly lets it use that swap instead of self-limiting; the build
# runs slower (swap is much slower than RAM) but completes instead of
# crashing. Only affects this one build step, not the running app.
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN npm run build

# ---- web: minimal runtime image for the Next.js app ----
FROM node:22-slim AS web
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
# Standalone output already contains the trimmed node_modules it needs —
# static assets and public/ are excluded from it by design and must be
# copied in separately (a real, documented Next.js standalone gotcha).
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# public/uploads doesn't exist in the builder stage (gitignored — it's
# where runtime template uploads land, not a build artifact), so the
# COPY above never creates it. Pre-create it with the right owner here:
# docker-compose.yml mounts a named volume at this exact path so uploads
# survive redeploys, and Docker seeds a brand-new named volume from
# whatever's already at that path in the image — including ownership.
# Skipping this step is a real, confirmed-live bug: a fresh volume
# defaults to root:root, and the app runs as the non-root `nextjs` user
# below, so every upload would fail with a permission error.
RUN mkdir -p public/uploads && chown nextjs:nodejs public/uploads
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]

# ---- worker: full source + deps, runs core/workflow's queue consumer ----
# Needs the untrimmed node_modules (tsx itself isn't something `next
# build`'s dependency tracing would ever pick up, since it's not
# imported by the app — it's the thing DOING the importing here) and the
# raw TypeScript source, not the Next.js build output.
FROM base AS worker
WORKDIR /app
COPY . .
# Same placeholder-for-config-loading reason as the builder stage above.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npx prisma generate
ENV NODE_ENV=production
CMD ["npx", "tsx", "worker/index.ts"]
