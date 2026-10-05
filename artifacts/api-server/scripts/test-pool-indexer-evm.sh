#!/usr/bin/env bash
# Runs real pool actions against a throwaway anvil chain and checks what the
# indexer recorded for them (src/lib/pool/indexer-evm.e2e.test.ts).
#
# Needs anvil and forge (foundry) on the PATH, plus postgres' initdb/pg_ctl,
# as the other database tests do. Everything it creates -- the chain, the
# database, the deployment file -- is thrown away on exit.
set -euo pipefail

if ! command -v anvil >/dev/null || ! command -v forge >/dev/null; then
  echo "anvil and forge (foundry) are required for this test" >&2
  exit 1
fi

unset DATABASE_URL
directory="$(mktemp -d)"
anvil_pid=""
cleanup() {
  [ -n "$anvil_pid" ] && kill "$anvil_pid" 2>/dev/null || true
  pg_ctl -D "$directory/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$directory"
}
trap cleanup EXIT

free_port() { node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{process.stdout.write(String(s.address().port));s.close()})'; }
pool_package="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../packages/darkswap-pool" && pwd)"

# A temporary postgres with the four pool tables.
initdb -D "$directory/data" -A trust -U pool_indexer_test >/dev/null
pg_port="$(free_port)"
pg_ctl -D "$directory/data" -o "-h 127.0.0.1 -p $pg_port -k $directory" -l "$directory/postgres.log" -w start >/dev/null
export DATABASE_URL="postgresql://pool_indexer_test@127.0.0.1:$pg_port/postgres"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f scripts/pool-indexer-test-schema.sql

# A throwaway chain, and a pool deployed on it from block 0.
anvil_port="$(free_port)"
anvil --port "$anvil_port" --silent >"$directory/anvil.log" 2>&1 &
anvil_pid=$!
for _ in $(seq 1 50); do
  cast block-number --rpc-url "http://127.0.0.1:$anvil_port" >/dev/null 2>&1 && break
  sleep 0.2
done

export NODE_ENV=test
export RPC_URL_ANVIL="http://127.0.0.1:$anvil_port"
# Deploy.s.sol writes deployments/31337.json, which is local-only and ignored
# by git; the indexer and the test both read the chain's pool from it.
export POOL_DEPLOYMENTS_DIR="$pool_package/deployments"
(cd "$pool_package/evm" && TEST_TOKEN=true forge script script/Deploy.s.sol --tc Deploy \
  --rpc-url "$RPC_URL_ANVIL" \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --broadcast >"$directory/deploy.log" 2>&1) || { cat "$directory/deploy.log" >&2; exit 1; }

# Three Groth16 proofs are produced along the way; each takes a few seconds.
pnpm --dir ../../scripts exec tsx --test --test-timeout 600000 \
  ../artifacts/api-server/src/lib/pool/indexer-evm.e2e.test.ts
