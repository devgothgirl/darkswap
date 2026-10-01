#!/usr/bin/env bash
set -euo pipefail
directory="$(mktemp -d /tmp/launch-private-test.XXXXXX)"
cleanup() {
  pg_ctl -D "$directory/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$directory"
}
trap cleanup EXIT
initdb -D "$directory/data" -A trust -U launch_test >/dev/null
port="$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{process.stdout.write(String(s.address().port));s.close()})')"
pg_ctl -D "$directory/data" -o "-h 127.0.0.1 -p $port -k $directory" -l "$directory/postgres.log" -w start >/dev/null
export DATABASE_URL="postgresql://launch_test@127.0.0.1:$port/postgres"
export LAUNCH_PRIVATE_TEST_DB="true"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f src/lib/launch/private-schema.sql
pnpm --dir ../../scripts exec tsx --test ../artifacts/api-server/src/lib/launch/private.db.test.ts