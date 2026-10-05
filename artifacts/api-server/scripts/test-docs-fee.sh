#!/usr/bin/env bash
set -euo pipefail

# No database needed: this only compares the docs fee copy against the
# configured NEAR_PARTNER_FEE_BPS / NEAR_PARTNER_PAYOUT_ADDRESS.
pnpm --dir ../../scripts exec tsx --test ../artifacts/api-server/src/routes/near-partner-fee-docs.test.ts
