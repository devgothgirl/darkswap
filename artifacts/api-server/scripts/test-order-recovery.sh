#!/usr/bin/env bash
set -euo pipefail

unset DATABASE_URL
directory="$(mktemp -d)"
cleanup() {
  pg_ctl -D "$directory/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$directory"
}
trap cleanup EXIT

initdb -D "$directory/data" -A trust -U order_recovery_test >/dev/null
port="$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{process.stdout.write(String(s.address().port));s.close()})')"
pg_ctl -D "$directory/data" -o "-h 127.0.0.1 -p $port -k $directory" -l "$directory/postgres.log" -w start >/dev/null
export DATABASE_URL="postgresql://order_recovery_test@127.0.0.1:$port/postgres"
export ORDER_RECOVERY_TEST_DB="true"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f scripts/order-recovery-test-schema.sql

pnpm --dir ../../scripts exec tsx --test \
  ../artifacts/api-server/src/routes/order-recovery.db.test.ts \
  ../artifacts/api-server/src/routes/swap.test.ts \
  ../artifacts/api-server/src/routes/near.test.ts \
  ../artifacts/api-server/src/routes/near-origins.test.ts \
  ../artifacts/api-server/src/routes/near-bridge-origins.test.ts \
  ../artifacts/api-server/src/lib/near-chains.test.ts \
  ../artifacts/api-server/src/lib/near-service-status.test.ts

# Test files run in parallel processes. This suite also truncates the order
# tables, so it runs only after the shared database suite has finished.
pnpm --dir ../../scripts exec tsx --test \
  ../artifacts/api-server/src/routes/near-evm-origin.db.test.ts