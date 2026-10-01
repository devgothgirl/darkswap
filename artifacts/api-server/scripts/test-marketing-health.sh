#!/usr/bin/env bash
set -euo pipefail

# Never use DATABASE_URL from the workspace: operator health state is global.
unset DATABASE_URL
directory="$(mktemp -d)"
cleanup() {
  pg_ctl -D "$directory/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$directory"
}
trap cleanup EXIT

initdb -D "$directory/data" -A trust -U marketing_test >/dev/null
port="$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{process.stdout.write(String(s.address().port));s.close()})')"
pg_ctl -D "$directory/data" -o "-h 127.0.0.1 -p $port -k $directory" -l "$directory/postgres.log" -w start >/dev/null
export DATABASE_URL="postgresql://marketing_test@127.0.0.1:$port/postgres"
export MARKETING_HEALTH_TEST_DB="true"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f scripts/marketing-health-schema.sql
pnpm --dir ../../scripts exec tsx --test ../artifacts/api-server/src/lib/marketing-health.db.test.ts
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c \
  'TRUNCATE marketing_subscriptions, marketing_deliveries, marketing_events, marketing_webhook_receipts, marketing_webhook_status, marketing_webhook_processing, marketing_campaigns, marketing_send_pace'
pnpm --dir ../../scripts exec tsx --test ../artifacts/api-server/src/lib/marketing-receipt-race.db.test.ts
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c \
  'TRUNCATE marketing_subscriptions, marketing_deliveries, marketing_events, marketing_webhook_receipts, marketing_webhook_status, marketing_webhook_processing, marketing_campaigns, marketing_send_pace'
pnpm --dir ../../scripts exec tsx --test ../artifacts/api-server/src/lib/marketing-mid-send.db.test.ts
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c \
  'TRUNCATE marketing_subscriptions, marketing_deliveries, marketing_events, marketing_webhook_receipts, marketing_webhook_status, marketing_webhook_processing, marketing_campaigns, marketing_send_pace'
pnpm --dir ../../scripts exec tsx --test ../artifacts/api-server/src/lib/marketing-uncertain-send.db.test.ts
pnpm --dir ../../scripts exec tsx --test ../artifacts/api-server/src/lib/marketing-eligibility.db.test.ts
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c \
  'TRUNCATE marketing_subscriptions, marketing_deliveries, marketing_events, marketing_webhook_receipts, marketing_webhook_status, marketing_webhook_processing, marketing_campaigns, marketing_send_pace'
pnpm --dir ../../scripts exec tsx --test ../artifacts/api-server/src/lib/marketing-pace.db.test.ts
