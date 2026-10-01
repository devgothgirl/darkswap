#!/usr/bin/env bash
set -euo pipefail
unset DATABASE_URL
directory="$(mktemp -d)"
cleanup() {
  pg_ctl -D "$directory/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$directory"
}
trap cleanup EXIT
initdb -D "$directory/data" -A trust -U support_test >/dev/null
port="$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{process.stdout.write(String(s.address().port));s.close()})')"
pg_ctl -D "$directory/data" -o "-h 127.0.0.1 -p $port -k $directory" -l "$directory/postgres.log" -w start >/dev/null
export DATABASE_URL="postgresql://support_test@127.0.0.1:$port/postgres"
export SUPPORT_TEST_DB=true
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
CREATE TABLE support_cases (
  id text PRIMARY KEY, access_token_hash text NOT NULL UNIQUE, email text NOT NULL,
  report text NOT NULL, status text NOT NULL, provider_message_id text UNIQUE,
  lifecycle text NOT NULL DEFAULT 'open', fund_review text NOT NULL DEFAULT 'unreviewed',
  retention_hold boolean NOT NULL DEFAULT false, closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE support_delivery_events (
  id text PRIMARY KEY, provider_message_id text NOT NULL, status text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
SQL
pnpm --dir ../../scripts exec tsx --test ../artifacts/api-server/src/lib/support-delivery.db.test.ts
pnpm --dir ../../scripts exec tsx --test ../artifacts/api-server/src/lib/support-retention.db.test.ts