#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$root/scripts"
exec pnpm exec tsx --test \
  "$root/lib/zcash-address/tests/address.test.ts" \
  "$root/artifacts/api-server/src/lib/near-chains.test.ts" \
  "$root/artifacts/api-server/src/routes/near-origins.test.ts" \
  "$root/artifacts/api-server/src/routes/near-bridge-origins.test.ts"
