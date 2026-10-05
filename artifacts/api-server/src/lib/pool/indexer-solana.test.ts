// What the indexer reads back out of a Solana pool instruction. Solana
// publishes no amounts in logs -- the indexer reads instruction data only --
// so a shield's amount, and a transact's external amount, relayer fee and
// direction, are taken from the call's own arguments at fixed offsets. Here
// the instructions are built by the same client the browser uses, so a change
// to either side's layout fails rather than quietly shifting every amount.
//
// The rest of the chain of custody -- that pool calls are found inside a
// confirmed transaction, that the slot's time lands in the record, and that
// re-syncing records each action once -- needs a cluster, and is covered by
// indexer-solana.e2e.test.ts (scripts/test-pool-indexer-solana.sh). That one
// is skipped unless a cluster is configured or a local validator is
// installed, so these checks stay the ones that run everywhere.
//
// Runs with the pool volume tests (scripts/test-pool-volumes.sh) because
// importing the indexer opens a database connection.
import assert from "node:assert/strict";
import test from "node:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import { initPoseidon, solana } from "@darkswap/pool-client";
import { solanaShieldAmount, solanaTransact } from "./indexer";

const programId = new PublicKey("Dark1oo1111111111111111111111111111111111111");
const payer = Keypair.generate().publicKey;
const recipient = Keypair.generate().publicKey;
const relayer = Keypair.generate().publicKey;
const mint = Keypair.generate().publicKey;
const enc0 = new Uint8Array(96).fill(7);
const enc1 = new Uint8Array(96).fill(9);

const proof = {
  a: [1n, 2n] as [bigint, bigint],
  b: [3n, 4n, 5n, 6n] as [bigint, bigint, bigint, bigint],
  c: [7n, 8n] as [bigint, bigint],
  root: 9n,
  nullifiers: [10n, 11n] as [bigint, bigint],
  commitments: [12n, 13n] as [bigint, bigint],
};

const transact = (extAmount: bigint, fee: bigint, value: { mint: PublicKey; recipient: PublicKey; relayer: PublicKey } | null) =>
  solana.transactIx(programId, payer, proof, extAmount, fee, enc0, enc1, value).data;
const withValue = { mint, recipient, relayer };

test.before(async () => {
  await initPoseidon(); // the PDAs a shield names are Poseidon-free, but assetIdOf is not
});

test("a shield's deposit is read from its own arguments", () => {
  const ix = solana.shieldIx(programId, payer, solana.SOL_MINT, 2_000_000_000n, 123n, 456n, enc0);
  assert.equal(solanaShieldAmount(ix.data), 2_000_000_000n);
  const token = solana.shieldIx(programId, payer, mint, 250_000_000n, 1n, 2n, enc0, payer);
  assert.equal(solanaShieldAmount(token.data), 250_000_000n);
});

test("a withdrawal gives up its amount, its relayer fee and its direction", () => {
  const out = solanaTransact(transact(-1_000_000_000n, 896_880n, withValue));
  assert.equal(out.kind, "unshield", "a negative external amount is money leaving the pool");
  assert.equal(out.extAmount, -1_000_000_000n);
  assert.equal(out.relayerFee, 896_880n, "the fee is read apart from the amount, as the month's relayed share needs");
});

test("a deposit and a private send are told apart by their external amount", () => {
  const deposit = solanaTransact(transact(500_000_000n, 0n, withValue));
  assert.equal(deposit.kind, "deposit");
  assert.equal(deposit.extAmount, 500_000_000n);
  // A private send names no asset and no amount; it is relayed free of charge.
  const send = solanaTransact(transact(0n, 0n, null));
  assert.equal(send.kind, "send");
  assert.equal(send.extAmount, 0n);
  assert.equal(send.relayerFee, 0n);
});

test("the amounts are not confused with the proof in front of them", () => {
  // Every field of the proof is 32 bytes; reading one field early or late
  // would turn a 1 SOL withdrawal into a wildly different number.
  const data = transact(-1_000_000_000n, 5_000n, withValue);
  assert.equal(data[0], 6, "the transact tag");
  assert.equal(
    BigInt(`0x${data.subarray(385, 417).toString("hex")}`), proof.commitments[1],
    "the 32 bytes in front of the amounts are the last output commitment",
  );
  assert.equal(
    data.length, 417 + 8 + 8 + 2 + enc0.length + 2 + enc1.length,
    "and the two encrypted outputs follow them",
  );
  assert.equal(solanaTransact(data).extAmount, -1_000_000_000n);
  const self = solanaTransact(transact(-1_000_000_000n, 0n, withValue));
  assert.equal(self.relayerFee, 0n, "a self-submitted withdrawal pays no relayer");
});

test("an instruction that is not a shield or a transact is refused, not misread", () => {
  const shield = solana.shieldIx(programId, payer, solana.SOL_MINT, 1n, 1n, 2n, enc0).data;
  const spend = transact(-1n, 0n, withValue);
  assert.throws(() => solanaShieldAmount(spend), /not a shield instruction/);
  assert.throws(() => solanaTransact(shield), /not a transact instruction/);
});
