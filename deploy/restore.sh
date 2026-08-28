#!/usr/bin/env bash
# Restore a backup made by backup.sh. DESTRUCTIVE — wipes whatever's
# currently in the database first. Only ever run this deliberately.
#
# Usage: bash deploy/restore.sh /home/ubuntu/backups/autobot-20260101-020000.sql.gz

set -euo pipefail

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Usage: bash deploy/restore.sh <path-to-backup.sql.gz>"
  exit 1
fi

read -p "This will ERASE the current database and replace it with $FILE. Type 'yes' to continue: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 1
fi

echo "==> Dropping and recreating the database"
docker compose exec -T postgres psql -U autobot -d postgres -c "DROP DATABASE autobot;"
docker compose exec -T postgres psql -U autobot -d postgres -c "CREATE DATABASE autobot;"

echo "==> Restoring from $FILE"
gunzip -c "$FILE" | docker compose exec -T postgres psql -U autobot autobot

echo "==> Restore complete. Restart the app containers so they pick up any schema/data changes:"
echo "    docker compose restart web worker"
