#!/usr/bin/env bash
# Compiles the circuit and makes DEV-ONLY proving keys.
#
# The keys this script makes are NOT safe for real funds: one machine ran the
# whole setup, so whoever ran it could forge proofs. Before mainnet, replace
# them with keys from a phase-2 ceremony with outside contributors, on top of
# a public phase-1 file (Perpetual Powers of Tau).
set -euo pipefail
cd "$(dirname "$0")/.."

CIRCUIT=transaction2
POWER=${POWER:-15}
OUT=build
KEYS=keys-dev
SNARKJS="node node_modules/snarkjs/build/cli.cjs"

mkdir -p "$OUT" "$KEYS"

echo "== compile"
circom "circuits/$CIRCUIT.circom" --r1cs --wasm --sym --O2 -o "$OUT"
$SNARKJS r1cs info "$OUT/$CIRCUIT.r1cs"

if [ ! -f "$OUT/pot_final.ptau" ]; then
  echo "== dev powers of tau (2^$POWER)"
  $SNARKJS powersoftau new bn128 "$POWER" "$OUT/pot_0.ptau"
  $SNARKJS powersoftau contribute "$OUT/pot_0.ptau" "$OUT/pot_1.ptau" --name="dev" -e="$(head -c 64 /dev/urandom | od -An -tx1 | tr -d " \n")"
  $SNARKJS powersoftau prepare phase2 "$OUT/pot_1.ptau" "$OUT/pot_final.tmp.ptau"
  mv "$OUT/pot_final.tmp.ptau" "$OUT/pot_final.ptau"
  rm -f "$OUT/pot_0.ptau" "$OUT/pot_1.ptau"
fi

echo "== dev groth16 setup"
$SNARKJS groth16 setup "$OUT/$CIRCUIT.r1cs" "$OUT/pot_final.ptau" "$OUT/${CIRCUIT}_0.zkey"
$SNARKJS zkey contribute "$OUT/${CIRCUIT}_0.zkey" "$KEYS/$CIRCUIT.zkey" --name="dev" -e="$(head -c 64 /dev/urandom | od -An -tx1 | tr -d " \n")"
rm -f "$OUT/${CIRCUIT}_0.zkey"
$SNARKJS zkey export verificationkey "$KEYS/$CIRCUIT.zkey" "$KEYS/verification_key.json"

echo "== export verifiers"
$SNARKJS zkey export solidityverifier "$KEYS/$CIRCUIT.zkey" evm/src/Groth16Verifier.sol
node scripts/vk-to-rust.mjs "$KEYS/verification_key.json" solana/verifier-parity/src/verifying_key.rs
cp "$OUT/${CIRCUIT}_js/$CIRCUIT.wasm" "$KEYS/$CIRCUIT.wasm"

echo "done. DEV-ONLY keys in $KEYS/"
