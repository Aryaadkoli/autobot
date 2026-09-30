# Deployment runbook

One-time setup to get Autobot live on `autobot.urvanidhi.com`, plus the
commands you'll actually use afterward (deploying an update, checking
logs, backing up, restoring). The Docker Compose setup this repo is
built around (see `docs/BLUEPRINT.md` for why) is cloud-agnostic — it
runs identically on any Ubuntu VM with a public IP and ports 80/443
open. **Autobot is actually running on AWS** (a `t3.micro` in
`ap-south-1`/Mumbai, Elastic IP `13.127.38.161`, under the new-account
$200/6-month credit — that credit ends ~March 2, 2027, revisit hosting
then). Oracle Cloud's signup never cleared a fraud check and GCP's
Always-Free tier has no India region, so AWS ended up the practical
choice — see CLAUDE.md for the full story. Nothing below Part 1, Step 1
changes based on that choice; only the console steps for creating the
VM differ by provider.

## Part 1 — one-time setup

### 1. Create the VM

Using an AWS EC2 free/credit-eligible instance:

1. Sign up / log into the [AWS Console](https://console.aws.amazon.com)
   → **EC2 → Launch instance**.
2. **Region**: `ap-south-1` (Mumbai) — closest to real users, and
   there's no Always-Free regional restriction the way GCP has.
3. **AMI**: Ubuntu Server 24.04 LTS.
4. **Instance type**: `t3.micro`.
5. **Credit specification**: set to **Standard**, not Unlimited — this
   avoids any surprise CPU-burst billing beyond the included credit.
6. **Storage**: 50GB gp3 EBS.
7. **Security group**: allow inbound TCP 22 (SSH, ideally locked to
   your own IP), 80, and 443 from anywhere — this is AWS's equivalent
   of a cloud-level firewall in front of the VM. Without 80/443 open
   here, they stay blocked regardless of the VM's own `ufw`.
8. **Allocate an Elastic IP** and associate it with the instance —
   a normal EC2 public IP changes if the instance ever stops/starts;
   an Elastic IP doesn't, so DNS never silently breaks later.
9. Launch it, note the Elastic IP.

One real constraint worth knowing: this is running on a **time-limited
credit**, not a permanent free tier — check the credit's expiry and
either pay, migrate to Oracle (if its signup ever clears), or migrate
to GCP before it runs out.

### 2. Point the domain at it

Wherever `urvanidhi.com`'s DNS is managed, add:

```
Type: A
Name: autobot
Value: <the VM's public IP>
TTL:   Auto / 300
```

DNS can take a few minutes to a few hours to propagate. You can check
with `dig autobot.urvanidhi.com` from your own machine once it's set.

### 3. Bootstrap the VM

SSH into the VM, then:

```bash
git clone <your-repo-url> autobot
cd autobot
bash deploy/bootstrap.sh
```

This installs Docker, sets up a swap file, and configures the VM's own
firewall. Follow the printed next-steps at the end (logging back in for
the docker group to apply).

### 4. Configure secrets

```bash
cp .env.production.example .env
nano .env   # fill in every value — see the comments in the file
```

Generate the two secrets it asks for:
```bash
openssl rand -base64 24   # → DB_PASSWORD
openssl rand -base64 32   # → CREDENTIALS_KEY
npx --yes auth secret     # → AUTH_SECRET (or just use another openssl rand -base64 32)
```

Set `SEED_ADMIN_PASSWORD` to the real production password — the one
that was emailed to you when this was first generated (see CLAUDE.md /
your own records). **Do not reuse the local dev password.**

### 5. First boot

```bash
docker compose --env-file .env up -d --build
docker compose ps          # everything should show "healthy" or "running" within ~30s
```

Then seed the one real tenant + owner account:

```bash
docker compose exec web npx tsx prisma/seed.prod.ts
```

This is safe to re-run later (it upserts) — it will never duplicate the
tenant or touch any real data added after this.

### 6. Verify

- `https://autobot.urvanidhi.com/login` should load with a valid
  padlock (Caddy auto-provisions the cert on first request — the very
  first load might take a few extra seconds while that happens)
- Log in with the production owner credentials
- Check `docker compose logs -f web worker` for errors during this

### 7. Test a restore once, before relying on this for real

Take a backup, then actually restore it, so you know the process works
before you need it under pressure:

```bash
bash deploy/backup.sh
bash deploy/restore.sh /home/ubuntu/backups/autobot-<timestamp>.sql.gz
```

### 8. Schedule nightly backups

```bash
crontab -e
```
Add:
```
0 2 * * * cd /home/ubuntu/autobot && bash deploy/backup.sh >> /home/ubuntu/backups/backup.log 2>&1
```
Runs every night at 2am server time, keeps the last 14 days
automatically (see `deploy/backup.sh`).

---

## Part 2 — ongoing operations

### Deploy an update

```bash
cd autobot
git pull
docker compose --env-file .env up -d --build
```

Only rebuilds what changed. `web` and `worker` restart with the new
code; `postgres`/`redis`/`caddy` are untouched unless their own config
changed.

### Apply a new Prisma migration

```bash
docker compose exec web npx prisma migrate deploy
```

Run this after `git pull` if the update includes a schema change —
before or after the container rebuild both work, but do it before
anyone starts using the new code if the migration changes data shape
things the app depends on.

### One-time: migrating existing ids to ULID format

Tied to a specific update (schema.prisma's ids moved from `cuid()` to
`ulid()`, and `Tenant.sendingLimitsEnabled` was added) — this is not a
step you'll repeat for future deploys. Order matters:

```bash
git pull
docker compose --env-file .env up -d --build   # rebuild web/worker with the new code
docker compose exec web npx prisma migrate deploy   # adds the sendingLimitsEnabled column
```

Then, once (take a real backup first — `bash deploy/backup.sh` — this
rewrites every row's primary key and every column that references it,
inside one transaction; it either fully succeeds or fully rolls back,
but a backup is still the right call before any structural rewrite):

```bash
docker compose exec web sh -c 'CONFIRM_ULID_MIGRATION=yes-migrate-ids-to-ulid npx tsx prisma/migrate-ids-to-ulid.ts'
```

It prints a per-table summary and a final "Integrity check passed" line
— read the output; if it reports a failure it will have already rolled
back and changed nothing. Running it twice is safe (already-migrated
rows are skipped). See `prisma/migrate-ids-to-ulid.ts`'s own comments
for exactly what it does and why it's a standalone script rather than a
`prisma migrate` file. Verified against a full local dataset (143
contacts + every related table) before this was written here — zero
orphaned references, all counts unchanged, app logins/pages/sends all
confirmed working against the new ids afterward.

### View logs

```bash
docker compose logs -f web        # the Next.js app
docker compose logs -f worker     # the workflow engine
docker compose logs -f caddy      # reverse proxy / TLS
```

### Restart something without a full redeploy

```bash
docker compose restart web worker
```

### Back up manually / restore

```bash
bash deploy/backup.sh
bash deploy/restore.sh /home/ubuntu/backups/<file>.sql.gz
```

### Rotate a secret (e.g. CREDENTIALS_KEY, AUTH_SECRET)

Edit `.env`, then:
```bash
docker compose --env-file .env up -d
```
Note: rotating `CREDENTIALS_KEY` makes any already-encrypted WhatsApp
credentials in the database unreadable — you'd need to reconnect
WhatsApp through Settings afterward. `AUTH_SECRET` rotation just signs
everyone out (their session JWTs stop validating) — harmless.

### Check disk space

```bash
df -h
docker system df
```
If Docker images/build cache pile up over time:
```bash
docker system prune -af --volumes=false   # never touches named volumes (your data)
```
