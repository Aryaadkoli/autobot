#!/usr/bin/env bash
# Nightly Postgres backup — run via cron on the VM (see docs/RUNBOOK.md
# for the crontab line). Dumps the whole database from inside the
# running postgres container, gzips it, and keeps the last 14 days —
# older ones are deleted automatically so this never fills the disk.
#
# Usage: bash deploy/backup.sh
# (run from the project root — the directory containing docker-compose.yml)

set -euo pipefail

BACKUP_DIR="/home/ubuntu/backups"
KEEP_DAYS=14
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$BACKUP_DIR/autobot-$TIMESTAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "==> Dumping database to $FILE"
docker compose exec -T postgres pg_dump -U autobot autobot | gzip > "$FILE"

echo "==> Backup complete: $(du -h "$FILE" | cut -f1)"

echo "==> Removing backups older than $KEEP_DAYS days"
find "$BACKUP_DIR" -name "autobot-*.sql.gz" -mtime "+$KEEP_DAYS" -delete

echo "==> Current backups:"
ls -lh "$BACKUP_DIR"
