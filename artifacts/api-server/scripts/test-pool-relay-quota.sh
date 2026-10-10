#!/usr/bin/env bash
set -euo pipefail

unset DATABASE_URL
directory="$(mktemp -d)"
cleanup() {
  pg_ctl -D "$directory/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$directory"
}
trap cleanup EXIT

initdb -D "$directory/data" -A trust -U pool_quota_test >/dev/null
port="$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{process.stdout.write(String(s.address().port));s.close()})')"
pg_ctl -D "$directory/data" -o "-h 127.0.0.1 -p $port -k $directory" -l "$directory/postgres.log" -w start >/dev/null
export DATABASE_URL="postgresql://pool_quota_test@127.0.0.1:$port/postgres"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c \
  'CREATE TABLE pool_relay_budget (chain text PRIMARY KEY, used_at timestamptz[] NOT NULL)'

pnpm --dir ../../scripts exec tsx --test \
  ../artifacts/api-server/src/lib/pool/free-quota.db.test.ts
