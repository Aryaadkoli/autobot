# Autobot

Customer-communication automation platform. See `CLAUDE.md` for project
context and `docs/BLUEPRINT.md` for the full spec.

## Local development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and log in with the
admin account created by `prisma/seed.ts`.

### First-time setup

```bash
npx prisma migrate dev --name init
npx prisma db seed
```

Requires a local PostgreSQL database and a `.env` file (see `DATABASE_URL`,
`AUTH_SECRET`, `SEED_ADMIN_PASSWORD` — never commit this file).
