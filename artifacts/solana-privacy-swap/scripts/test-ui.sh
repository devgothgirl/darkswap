#!/usr/bin/env bash
# UI tests: node's test runner via tsx, in a jsdom document with UTC dates so
# recorded markup is stable. tsx comes from the shared scripts package.
set -euo pipefail
app="$(cd "$(dirname "$0")/.." && pwd)"
cd "$app/../../scripts"
TZ=UTC exec pnpm exec tsx --tsconfig "$app/tsconfig.test.json" --import "$app/scripts/test-ui-setup.mjs" --test \
  "$app/src/lib/origin-terms.test.ts" \
  "$app/src/lib/near-route-form.test.ts" \
  "$app/src/components/order-components.test.tsx" \
  "$app/src/components/near-route-form.test.tsx"
