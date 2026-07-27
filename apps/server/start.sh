#!/bin/sh
# Production entrypoint: bootstrap the schema on a fresh volume, then serve.
#
# drizzle-kit push only runs when the SQLite file does not exist yet — on an
# empty database it is pure CREATEs (--force just skips the confirmation
# prompt). Existing databases are never pushed to automatically; schema
# changes after first boot are applied manually (see A4_INFRASTRUCTURE.md).
set -e

DB_PATH="${DATABASE_PATH:-a4.db}"

if [ ! -f "$DB_PATH" ]; then
  echo "[start] No database at $DB_PATH — creating schema"
  pnpm db:push --force
else
  echo "[start] Database present at $DB_PATH"
fi

exec pnpm exec tsx src/index.ts
