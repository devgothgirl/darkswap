#!/usr/bin/env bash
set -euo pipefail

unset DATABASE_URL
directory="$(mktemp -d)"
cleanup() {
  pg_ctl -D "$directory/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$directory"
}
trap cleanup EXIT

initdb -D "$directory/data" -A trust -U rewards_test >/dev/null
port="$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{process.stdout.write(String(s.address().port));s.close()})')"
pg_ctl -D "$directory/data" -o "-h 127.0.0.1 -p $port -k $directory" -l "$directory/postgres.log" -w start >/dev/null
export DATABASE_URL="postgresql://rewards_test@127.0.0.1:$port/postgres"
export REWARDS_CAP_TEST_DB="true"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f scripts/rewards-test-schema.sql
pnpm --dir ../../scripts exec tsx --test \
  ../artifacts/api-server/src/lib/rewards-concurrency.db.test.ts \
  ../artifacts/api-server/src/routes/rewards-order-auth.test.ts