#!/bin/sh
set -eu

if [ -z "${TARGET_DATABASE_URL:-}" ]; then
  echo "TARGET_DATABASE_URL is required" >&2
  exit 1
fi
normalize_libpq_url() {
  url="$1"
  for parameter in schema connection_limit pgbouncer; do
    url="$(printf '%s' "$url" | sed -E "s/([?&])${parameter}=[^&]*(&|$)/\\1/; s/[?&]$//; s/\\?&/?/; s/&&/\&/g")"
  done
  printf '%s' "$url"
}

target_url="$(normalize_libpq_url "$TARGET_DATABASE_URL")"

if [ "${VALIDATE_ONLY:-false}" = "true" ]; then
  psql "$target_url" --tuples-only --no-align --command \
    "SELECT json_build_object(
      'tables', (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'),
      'users', (SELECT count(*) FROM users),
      'appUsers', (SELECT count(*) FROM app_users),
      'companies', (SELECT count(*) FROM companies),
      'tenants', (SELECT count(*) FROM tenants),
      'genCodes', (SELECT count(*) FROM gencodes),
      'subscriptions', (SELECT count(*) FROM subscriptions),
      'migrations', (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL)
    );"
  exit 0
fi

if [ -z "${SOURCE_DATABASE_URL:-}" ] && [ -z "${SOURCE_DATABASE_DUMP_URL_BASE64:-}" ]; then
  echo "SOURCE_DATABASE_URL or SOURCE_DATABASE_DUMP_URL_BASE64 is required" >&2
  exit 1
fi

existing_tables="$(
  psql "$target_url" --tuples-only --no-align --command \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
)"

if [ "$existing_tables" -ne 0 ] && [ "${ALLOW_NONEMPTY_TARGET:-false}" != "true" ]; then
  echo "Target database contains $existing_tables public tables; refusing to overwrite it." >&2
  exit 1
fi

dump_file=/tmp/genealogiq.dump
if [ -n "${SOURCE_DATABASE_DUMP_URL_BASE64:-}" ]; then
  echo "Downloading the encrypted-in-transit source dump..."
  dump_url="$(printf '%s' "$SOURCE_DATABASE_DUMP_URL_BASE64" | base64 -d)"
  wget -q -O "$dump_file" "$dump_url"
else
  source_url="$(normalize_libpq_url "$SOURCE_DATABASE_URL")"
  echo "Creating a consistent source dump..."
  pg_dump "$source_url" \
    --format=custom \
    --no-owner \
    --no-acl \
    --file="$dump_file"
fi

echo "Restoring the dump into Azure PostgreSQL..."
pg_restore \
  --dbname="$target_url" \
  --no-owner \
  --no-acl \
  --exit-on-error \
  "$dump_file"

restored_tables="$(
  psql "$target_url" --tuples-only --no-align --command \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
)"
migration_table_exists="$(
  psql "$target_url" --tuples-only --no-align --command \
    "SELECT to_regclass('public._prisma_migrations') IS NOT NULL;"
)"
if [ "$migration_table_exists" = "t" ]; then
  migration_records="$(
    psql "$target_url" --tuples-only --no-align --command \
      "SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NOT NULL;"
  )"
else
  migration_records=0
fi

echo "Database transfer complete: $restored_tables public tables, $migration_records completed migration records."
if [ "$migration_records" -eq 0 ]; then
  echo "The source had no Prisma migration history; run the controlled baseline job before migrate deploy."
fi
