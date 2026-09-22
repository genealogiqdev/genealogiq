#!/bin/sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

echo "Recording the restored schema as the migration baseline..."
for directory in packages/db/prisma/migrations/*; do
  if [ ! -f "$directory/migration.sql" ]; then
    continue
  fi
  migration="$(basename "$directory")"
  echo "Resolving $migration as applied"
  pnpm --filter @genealogiq/db exec prisma migrate resolve --applied "$migration"
done

echo "Migration baseline recorded."
