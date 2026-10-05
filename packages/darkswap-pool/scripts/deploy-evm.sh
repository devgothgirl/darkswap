#!/usr/bin/env bash
# Deploys the DarkSwap shielded pool to an EVM testnet (TESTNET) in one command.
#
#   bash scripts/deploy-evm.sh [path/to/.env.deploy]      (default: scripts/.env.deploy)
#   npm run deploy:evm
#
# Reads the settings file (see scripts/.env.deploy.example), checks that the
# tools and the deployer wallet are ready, runs the existing Foundry script
# evm/script/Deploy.s.sol unchanged, and prints deployments/<chainId>.json.
# Nothing under evm/src/ or evm/script/ is touched.
#
# Only Sepolia (11155111) and Base Sepolia (84532) are accepted. Any other
# chain id, mainnets included, is refused before anything is sent. Local anvil
# (31337) needs ALLOW_LOCAL_ANVIL=1. Set ALLOW_OVERWRITE=1 to replace an
# existing deployments/<chainId>.json (local anvil only; never for a testnet
# already handed over).
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="${1:-scripts/.env.deploy}"
pass() { printf '  PASS  %s\n' "$1"; }
fail() { printf '  FIX   %s\n' "$1" >&2; FAILED=1; }
FAILED=0

echo "DarkSwap shielded pool: EVM testnet deployment"
echo

# ---- 1. settings file ---------------------------------------------------------
if [ ! -f "$ENV_FILE" ]; then
  echo "Settings file not found: $ENV_FILE" >&2
  echo "Copy scripts/.env.deploy.example to scripts/.env.deploy and fill it in." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
pass "settings read from $ENV_FILE"

is_address() { [[ "$1" =~ ^0x[0-9a-fA-F]{40}$ ]]; }

[ -n "${RPC_URL:-}" ] || fail "RPC_URL is empty. Put the Sepolia or Base Sepolia RPC URL in $ENV_FILE."
if [ -z "${DEPLOYER_PRIVATE_KEY:-}" ]; then
  fail "DEPLOYER_PRIVATE_KEY is empty. Put the throwaway deployer wallet's private key in $ENV_FILE."
elif [[ ! "$DEPLOYER_PRIVATE_KEY" =~ ^0x[0-9a-fA-F]{64}$ ]]; then
  fail "DEPLOYER_PRIVATE_KEY must be 0x followed by 64 hex characters."
fi
if [ -z "${OWNER:-}" ]; then
  fail "OWNER is empty. The script refuses to deploy without an explicit owner."
elif ! is_address "$OWNER"; then
  fail "OWNER is not a valid address (0x + 40 hex characters)."
fi
if [ -z "${FEE_RECIPIENT:-}" ]; then
  fail "FEE_RECIPIENT is empty. It is fixed forever, so the script refuses to guess. Use the same address on both EVM chains."
elif ! is_address "$FEE_RECIPIENT"; then
  fail "FEE_RECIPIENT is not a valid address (0x + 40 hex characters)."
fi
if [ -n "${PROTOCOL_FEE_BPS:-}" ]; then
  if [[ ! "$PROTOCOL_FEE_BPS" =~ ^[0-9]+$ ]] || [ "$PROTOCOL_FEE_BPS" -gt 100 ]; then
    fail "PROTOCOL_FEE_BPS must be a whole number from 0 to 100 (100 = 1%)."
  fi
fi
for v in GUARDIAN_DAYS ETH_MIN_DEPOSIT ETH_MAX_DEPOSIT ETH_CAP; do
  val="${!v:-}"
  if [ -n "$val" ] && [[ ! "$val" =~ ^[0-9]+$ ]]; then fail "$v must be a whole number (got '$val')."; fi
done
if [ -n "${TEST_TOKEN:-}" ] && [[ ! "$TEST_TOKEN" =~ ^(true|false)$ ]]; then fail "TEST_TOKEN must be true or false."; fi
if [ -n "${SANCTIONS_LIST:-}" ] && ! is_address "$SANCTIONS_LIST"; then fail "SANCTIONS_LIST must be an address or empty."; fi
[ "$FAILED" = 0 ] || { echo; echo "Fix the lines marked FIX in $ENV_FILE and run again."; exit 1; }
pass "owner, fee recipient and limits look well-formed"

# ---- 2. tools -------------------------------------------------------------------
for tool in forge cast; do
  if command -v "$tool" >/dev/null 2>&1; then
    pass "$tool found ($($tool --version 2>/dev/null | head -n 1))"
  else
    fail "$tool is not installed. Install Foundry: curl -L https://foundry.paradigm.xyz | bash  then run: foundryup"
  fi
done
if [ -f evm/lib/forge-std/src/Script.sol ]; then
  pass "forge-std present (evm/lib/forge-std)"
else
  fail "forge-std is missing. From the package folder run: git clone --depth 1 https://github.com/foundry-rs/forge-std evm/lib/forge-std"
fi
if [ -d node_modules/@openzeppelin/contracts ] && [ -d node_modules/poseidon-solidity ]; then
  pass "npm packages present (node_modules)"
else
  fail "packages are missing. From the repository root run: pnpm install --frozen-lockfile"
fi
[ "$FAILED" = 0 ] || { echo; echo "Install what is marked FIX and run again."; exit 1; }

# ---- 3. network and wallet ------------------------------------------------------
if ! CHAIN_ID=$(cast chain-id --rpc-url "$RPC_URL" 2>/dev/null); then
  fail "could not reach RPC_URL ($RPC_URL). Check the URL and your internet connection."
  echo; exit 1
fi
# Only the two planned testnets are allowed. Local anvil needs an explicit opt-in.
# Anything else (mainnets included) is refused before any transaction is built.
case "$CHAIN_ID" in
  11155111) CHAIN_NAME="Sepolia" ;;
  84532) CHAIN_NAME="Base Sepolia" ;;
  31337)
    CHAIN_NAME="local anvil (development only)"
    if [ "${ALLOW_LOCAL_ANVIL:-0}" != "1" ]; then
      fail "RPC_URL is a local anvil chain (31337). This wrapper is for the testnets; for local development set ALLOW_LOCAL_ANVIL=1 or follow README.md."
      echo; exit 1
    fi
    ;;
  *)
    fail "RPC_URL is chain id $CHAIN_ID, which is not Sepolia (11155111) or Base Sepolia (84532). This kit is TESTNET only: it never deploys to a mainnet or an unplanned chain. Nothing was sent."
    echo; exit 1
    ;;
esac
pass "RPC reachable: $CHAIN_NAME (chain id $CHAIN_ID)"

DEPLOYER=$(cast wallet address --private-key "$DEPLOYER_PRIVATE_KEY")
pass "deployer address $DEPLOYER (this address is public; the key is not printed)"
lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }
if [ "$(lower "$OWNER")" = "$(lower "$DEPLOYER")" ]; then
  fail "OWNER is the deployer wallet. Use a separate wallet you control long term."
fi
if [ "$(lower "$FEE_RECIPIENT")" = "$(lower "$DEPLOYER")" ]; then
  fail "FEE_RECIPIENT is the deployer wallet. The fee recipient is fixed forever; it must not be a throwaway key."
fi

BALANCE_WEI=$(cast balance "$DEPLOYER" --rpc-url "$RPC_URL")
BALANCE_ETH=$(cast from-wei "$BALANCE_WEI")
MIN_WEI=50000000000000000 # 0.05 ETH
if [ "$(printf '%s\n%s\n' "$MIN_WEI" "$BALANCE_WEI" | sort -n | head -n 1)" = "$MIN_WEI" ] && [ "$BALANCE_WEI" != "0" ]; then
  pass "deployer balance $BALANCE_ETH ETH (at least 0.05 ETH needed)"
else
  fail "deployer balance is $BALANCE_ETH ETH. Send it at least 0.05 testnet ETH from a faucet (0.1 ETH is comfortable on Sepolia) and run again."
fi

OUT="deployments/$CHAIN_ID.json"
if [ -f "$OUT" ] && [ "${ALLOW_OVERWRITE:-0}" != "1" ]; then
  fail "$OUT already exists. This chain was deployed before. Move the old file away first, or set ALLOW_OVERWRITE=1 (local anvil only)."
fi
[ "$FAILED" = 0 ] || { echo; echo "Fix the lines marked FIX and run again. Nothing was deployed."; exit 1; }

# ---- 4. deploy ------------------------------------------------------------------
echo
echo "Deploying to $CHAIN_NAME ..."
echo "  owner          $OWNER"
echo "  fee recipient  $FEE_RECIPIENT (fixed forever)"
echo "  fee            ${PROTOCOL_FEE_BPS:-50} bps"
echo "  guardian days  ${GUARDIAN_DAYS:-30}"
echo "  test token     ${TEST_TOKEN:-false}"
echo

# Deploy.s.sol reads these from the environment. Empty values must not be
# exported: Foundry fails to parse an empty address or number.
unset_empty() { for v in "$@"; do [ -n "${!v:-}" ] || unset "$v"; done; }
unset_empty OWNER FEE_RECIPIENT PROTOCOL_FEE_BPS GUARDIAN_DAYS ETH_MIN_DEPOSIT ETH_MAX_DEPOSIT ETH_CAP TEST_TOKEN SANCTIONS_LIST
export OWNER FEE_RECIPIENT

mkdir -p deployments
(
  cd evm
  forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC_URL" --private-key "$DEPLOYER_PRIVATE_KEY" --broadcast
)

if [ ! -f "$OUT" ]; then
  echo >&2
  echo "The deployment ran but $OUT was not written. Check the forge output above." >&2
  exit 1
fi

echo
echo "=============================================================="
echo " Done. Send this file to the Replit owner:"
echo "   $(pwd)/$OUT"
echo "=============================================================="
cat "$OUT"
echo
echo "Next: the OWNER ($OWNER) must accept ownership once:"
echo "  cast send $(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('$OUT','utf8')).pool)") 'acceptOwnership()' --rpc-url $RPC_URL --private-key <OWNER key>"
echo "  (or call acceptOwnership on the pool contract from the owner wallet in a block explorer)"
echo "Then check it:  npm run check:deployment"
