# Deployment runbook

One-time setup to get Autobot live on `autobot.urvanidhi.com`, plus the
commands you'll actually use afterward (deploying an update, checking
logs, backing up, restoring). The Docker Compose setup this repo is
built around (see `docs/BLUEPRINT.md` for why) is cloud-agnostic — it
runs identically on any Ubuntu VM with a public IP and ports 80/443
open. Originally planned for Oracle Cloud; switched to **Google Cloud's
free tier (e2-micro)** when Oracle's signup got stuck. Nothing below
Part 1, Step 1 changes based on that choice.

## Part 1 — one-time setup

### 1. Create the VM

Using Google Cloud's free tier:

1. Sign up / log into [Google Cloud Console](https://console.cloud.google.com).
2. **Compute Engine → VM instances → Create Instance**
3. **Region**: must be one of the three Always Free regions —
   `us-west1` (Oregon), `us-central1` (Iowa), or `us-east1` (South
   Carolina). Any other region bills real money for the same instance
   — this is the one setting that matters most for staying free. Pick
   whichever shows as available.
4. **Machine type**: `e2-micro` — specifically this one. Anything
   larger is outside the free tier.
5. **Boot disk**: Ubuntu 22.04 LTS, **Standard persistent disk** (not
   SSD — SSD isn't part of the free allowance), up to 30GB.
6. **Firewall**: tick **Allow HTTP traffic** and **Allow HTTPS
   traffic** — this is GCP's equivalent of Oracle's Security List, a
   separate cloud-level firewall in front of the VM. Without this
   checked, ports 80/443 stay blocked regardless of the VM's own `ufw`.
7. Create it, wait ~30s, note its **external (public) IP address** —
   shown right on the VM instances list.

One real constraint worth knowing: the free e2-micro's network egress
(data leaving the VM) is capped at 1GB/month to most destinations —
fine for a small business's message volume today, worth watching if
usage grows a lot (template images fetched by Meta's servers count as
egress from this VM).

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
