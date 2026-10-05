#!/usr/bin/env bash
# Runs real pool actions against a Solana cluster and checks what the indexer
# recorded for them (src/lib/pool/indexer-solana.e2e.test.ts). The counterpart
# of test-pool-indexer-evm.sh, and the same pattern: throwaway database,
# throwaway chain, deploy, sync, assert.
#
# There are two ways to give it a cluster, and it skips when it has neither:
#
#  1. One that is already there. Set POOL_PROGRAM_ID_DEVNET to an initialized
#     pool and RPC_URL_SOLANA_DEVNET to its cluster, and POOL_E2E_SOLANA_PAYER
#     to a funded keypair file (devnet's faucet is rate limited, so the test
#     pays out of that wallet instead of asking for an airdrop).
#     For the SPL token half, also set POOL_E2E_SOLANA_TEST_MINT to a mint the
#     pool has listed and POOL_E2E_SOLANA_TEST_MINT_HOLDER to a keypair file
#     holding some of it; without them the token tests are reported as
#     skipped, and only SOL is checked.
#
#  2. A throwaway local validator, which it starts itself, with SOL and a
#     6-decimal test token listed on the pool, so both halves run. Needs
#     solana-test-validator on the PATH and the program built:
#       cd packages/darkswap-pool/solana/pool \
#         && cargo-build-sbf --sbf-out-dir target/deploy
#     Point POOL_PROGRAM_SO somewhere else if the .so lives elsewhere. In a
#     container without io_uring, build with an Agave 4.x cargo-build-sbf but
#     run an Agave 2.1.x validator: the 4.x validator panics on startup there,
#     and it loads a program the newer toolchain built without complaint.
#
# Postgres' initdb/pg_ctl are needed either way, as in the other database
# tests. Everything it creates -- the validator and its ledger, the database,
# the keypairs -- is thrown away on exit.
set -euo pipefail

pool_package="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../packages/darkswap-pool" && pwd)"
program_so="${POOL_PROGRAM_SO:-$pool_package/solana/pool/target/deploy/darkswap_pool.so}"

skip() {
  echo "SKIPPED: $1" >&2
  echo "         Nothing was checked. See the header of $(basename "${BASH_SOURCE[0]}") for what this needs." >&2
  exit 0
}

if [ -n "${POOL_PROGRAM_ID_DEVNET:-}" ] && [ -n "${RPC_URL_SOLANA_DEVNET:-}" ]; then
  mode="configured"
elif command -v solana-test-validator >/dev/null && [ -f "$program_so" ]; then
  mode="local"
elif command -v solana-test-validator >/dev/null; then
  skip "no Solana pool program is built at $program_so, and no deployed program is configured."
else
  skip "no Solana cluster: POOL_PROGRAM_ID_DEVNET and RPC_URL_SOLANA_DEVNET are unset and solana-test-validator is not installed."
fi

unset DATABASE_URL
directory="$(mktemp -d)"
validator_pid=""
cleanup() {
  [ -n "$validator_pid" ] && kill "$validator_pid" 2>/dev/null || true
  pg_ctl -D "$directory/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$directory"
}
trap cleanup EXIT

free_port() { node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{process.stdout.write(String(s.address().port));s.close()})'; }
# @solana/web3.js is a dependency of the pool package, so keypairs and
# airdrops need no Solana command line tools of their own.
solana_node() { (cd "$pool_package" && node -e "$1" -- "${@:2}"); }

if [ "$mode" = "local" ]; then
  echo "Starting a throwaway Solana validator with $program_so"
  solana_node '
    const fs = require("node:fs");
    const { Keypair } = require("@solana/web3.js");
    for (const file of process.argv.slice(1)) {
      const k = Keypair.generate();
      fs.writeFileSync(file, JSON.stringify([...k.secretKey]), { mode: 0o600 });
      fs.writeFileSync(`${file}.pub`, k.publicKey.toBase58());
    }
  ' "$directory/program.json" "$directory/authority.json" "$directory/fee-recipient.json"
  program_id="$(cat "$directory/program.json.pub")"
  authority="$(cat "$directory/authority.json.pub")"
  fee_recipient="$(cat "$directory/fee-recipient.json.pub")"

  rpc_port="$(free_port)"
  # The validator's websocket is always the RPC port plus one, and it does not
  # say so when something else already has it: the faucet silently loses the
  # port and every airdrop times out.
  faucet_port="$(free_port)"
  while [ "$faucet_port" = "$((rpc_port + 1))" ]; do faucet_port="$(free_port)"; done
  export RPC_URL_SOLANA_DEVNET="http://127.0.0.1:$rpc_port"
  export POOL_PROGRAM_ID_DEVNET="$program_id"
  solana-test-validator --ledger "$directory/ledger" --reset --quiet \
    --rpc-port "$rpc_port" --faucet-port "$faucet_port" \
    --upgradeable-program "$program_id" "$program_so" "$authority" \
    >"$directory/validator.log" 2>&1 &
  validator_pid=$!
  for _ in $(seq 1 120); do
    curl -fs -m 2 -X POST -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' "$RPC_URL_SOLANA_DEVNET" >/dev/null 2>&1 && break
    sleep 0.5
  done
  curl -fs -m 5 -X POST -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' "$RPC_URL_SOLANA_DEVNET" >/dev/null \
    || { cat "$directory/validator.log" >&2; echo "the validator did not come up" >&2; exit 1; }

  # The pool is set up the way an operator sets it up, with the kit's own
  # script: initialize, list SOL, then create and list a 6-decimal test token.
  # The mint's keypair is saved under POOL_KEYS_DIR, so its address is read
  # back from there rather than scraped out of the script's output.
  solana_node '
    const { Connection, Keypair, LAMPORTS_PER_SOL } = require("@solana/web3.js");
    const fs = require("node:fs");
    (async () => {
      const [url, file] = process.argv.slice(1);
      const connection = new Connection(url, "confirmed");
      const key = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8"))));
      const sig = await connection.requestAirdrop(key.publicKey, 100 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction({ signature: sig, ...(await connection.getLatestBlockhash()) }, "confirmed");
    })().catch((err) => { console.error(err); process.exit(1); });
  ' "$RPC_URL_SOLANA_DEVNET" "$directory/authority.json"
  (cd "$pool_package" && POOL_KEYS_DIR="$directory/keys" node scripts/devnet-setup.mjs \
    --program "$program_id" --authority "$directory/authority.json" --fee-recipient "$fee_recipient" \
    --rpc "$RPC_URL_SOLANA_DEVNET" --sol-min 0.01 --sol-max 5 --sol-cap 500 --test-token \
    >"$directory/setup.log" 2>&1) || { cat "$directory/setup.log" >&2; exit 1; }
  # The setup minted the whole supply of the test token to the authority, so
  # that is the wallet the test takes its tokens from.
  mint_key="$directory/keys/test-mint-$program_id.json"
  [ -f "$mint_key" ] || { cat "$directory/setup.log" >&2; echo "the setup saved no test-mint keypair at $mint_key" >&2; exit 1; }
  test_mint="$(solana_node '
    const fs = require("node:fs");
    const { Keypair } = require("@solana/web3.js");
    const key = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(process.argv[1], "utf8"))));
    process.stdout.write(key.publicKey.toBase58());
  ' "$mint_key")"
  export POOL_E2E_SOLANA_TEST_MINT="$test_mint"
  export POOL_E2E_SOLANA_TEST_MINT_HOLDER="$directory/authority.json"
fi

# A temporary postgres with the four pool tables.
initdb -D "$directory/data" -A trust -U pool_indexer_test >/dev/null
pg_port="$(free_port)"
pg_ctl -D "$directory/data" -o "-h 127.0.0.1 -p $pg_port -k $directory" -l "$directory/postgres.log" -w start >/dev/null
export DATABASE_URL="postgresql://pool_indexer_test@127.0.0.1:$pg_port/postgres"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f scripts/pool-indexer-test-schema.sql

export NODE_ENV=test
echo "Pool $POOL_PROGRAM_ID_DEVNET on $RPC_URL_SOLANA_DEVNET"
if [ -n "${POOL_E2E_SOLANA_TEST_MINT:-}" ] && [ -n "${POOL_E2E_SOLANA_TEST_MINT_HOLDER:-}" ]; then
  echo "Test SPL mint $POOL_E2E_SOLANA_TEST_MINT"
else
  echo "No test SPL mint configured: the token tests will be skipped and only SOL is checked." >&2
fi
# Up to four Groth16 proofs are produced along the way; each takes a few seconds.
pnpm --dir ../../scripts exec tsx --test --test-timeout 600000 \
  ../artifacts/api-server/src/lib/pool/indexer-solana.e2e.test.ts
