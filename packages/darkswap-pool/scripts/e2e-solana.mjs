// End to end on a local Solana validator with the real verifier and real proofs.
//   solana-test-validator --upgradeable-program <program id> solana/pool/target/deploy/darkswap_pool.so <authority keypair or pubkey>
//   node scripts/e2e-solana.mjs <program id> <authority keypair json>
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, Transaction, SystemProgram, sendAndConfirmTransaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, getAccount } from "@solana/spl-token";
import { initPoseidon } from "./lib.mjs";
import { Keys, scanNotes, unspent, planTransaction, planShield, protocolFeeOn } from "./wallet.mjs";
import {
  SOL_MINT, pdas, assetIdOf, initializeIx, listAssetIx, shieldIx, transactIx, computeBudget, readAsset,
  sync, proveTransaction, setPausedIx, checkSolRecipient, collectFeesIx, setFeeIx, readPool,
} from "./solana.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const programId = new PublicKey(process.argv[2]);
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(process.argv[3], "utf8"))));
// optional: the test-only log-spam program, to attack log-based sync
const logSpam = process.argv[4] ? new PublicKey(process.argv[4]) : null;
const connection = new Connection(process.env.RPC_URL ?? "http://127.0.0.1:8899", "confirmed");
const P = pdas(programId);

await initPoseidon();
const report = { programId: programId.toBase58(), steps: [], costs: {} };
const step = (name, data = {}) => {
  report.steps.push({ name, ...data });
  console.log("ok -", name, JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
};

async function airdrop(pubkey, sol) {
  const sig = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, "confirmed");
}

async function send(signers, ...ixs) {
  const tx = new Transaction().add(computeBudget(), ...ixs);
  const sig = await sendAndConfirmTransaction(connection, tx, signers, { commitment: "confirmed" });
  const done = await connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  return { sig, units: done.meta.computeUnitsConsumed, bytes: tx.serialize().length, fee: done.meta.fee };
}

/** Simulates and returns the pool's custom error code, or null if it would succeed. */
async function errorCode(signer, ...ixs) {
  // A different compute limit makes this a new transaction, so a replay
  // reaches the program instead of Solana's duplicate-signature filter.
  const tx = new Transaction().add(computeBudget(399_999), ...ixs);
  tx.feePayer = signer.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.sign(signer);
  const { value } = await connection.simulateTransaction(tx);
  if (!value.err) return null;
  const custom = value.err?.InstructionError?.[1]?.Custom;
  return custom ?? JSON.stringify(value.err);
}
const ERR = { NullifierAlreadySpent: 9, InvalidProof: 12, UnknownRoot: 8, DepositsAreOff: 3, NotAdmin: 1, NotUpgradeAuthority: 16, UnderDepositMinimum: 18, FeeTooHigh: 19, NothingToCollect: 20 };
const FEE_BPS = 50;
const fee = (x) => protocolFeeOn(x, FEE_BPS);
const feeRecipient = Keypair.generate();

async function notesOf(keys) {
  const state = await sync(connection, programId);
  return { state, notes: scanNotes(state.commitments, keys, state.assets.map((a) => a.assetId)) };
}

// ---------------------------------------------------------------------------
const relayer = Keypair.generate();
const alicePublic = Keypair.generate();
const stranger = Keypair.generate();
await airdrop(authority.publicKey, 10);
await airdrop(relayer.publicKey, 10);
await airdrop(alicePublic.publicKey, 10);
await airdrop(stranger.publicKey, 1);

// 0. Only the upgrade authority can initialize. A stranger cannot front-run it.
assert.equal(await errorCode(stranger, initializeIx(programId, stranger.publicKey, 0, feeRecipient.publicKey, FEE_BPS)), ERR.NotUpgradeAuthority);
const expiry = Math.floor(Date.now() / 1000) + 30 * 86400;
assert.equal(await errorCode(authority, initializeIx(programId, authority.publicKey, expiry, feeRecipient.publicKey, 101)), ERR.FeeTooHigh);
await send([authority], initializeIx(programId, authority.publicKey, expiry, feeRecipient.publicKey, FEE_BPS));
assert.equal((await readPool(connection, programId)).feeBps, FEE_BPS);
assert.equal(await errorCode(authority, setFeeIx(programId, authority.publicKey, 101)), ERR.FeeTooHigh);
assert.equal(await errorCode(stranger, setFeeIx(programId, stranger.publicKey, 10)), ERR.NotAdmin);
step("initialize: refused for a stranger, done by the upgrade authority; fee capped at 1%", { feeBps: FEE_BPS });

// 1. List SOL and a test token.
const mint = await createMint(connection, authority, authority.publicKey, null, 6);
await send([authority], listAssetIx(programId, authority.publicKey, SOL_MINT, 10_000_000n, 5n * BigInt(LAMPORTS_PER_SOL), 50n * BigInt(LAMPORTS_PER_SOL)));
await send([authority], listAssetIx(programId, authority.publicKey, mint, 1_000_000n, 100_000_000_000n, 1_000_000_000_000n));
assert.equal(await errorCode(stranger, listAssetIx(programId, stranger.publicKey, Keypair.generate().publicKey, 1n, 1n, 1n)), ERR.NotAdmin);
step("list SOL and a 6-decimal test token; a stranger cannot list");

// 2. Alice shields 1 SOL, 0.5 SOL and 500 tokens.
const aliceAta = await getOrCreateAssociatedTokenAccount(connection, alicePublic, mint, alicePublic.publicKey);
await mintTo(connection, authority, mint, aliceAta.address, authority, 1_000_000_000n);
const alice = Keys.random();
const bob = Keys.random();
for (const [n, m, amount] of [[0, SOL_MINT, LAMPORTS_PER_SOL], [1, SOL_MINT, LAMPORTS_PER_SOL / 2], [2, mint, 500_000_000]]) {
  const s = planShield({ keys: alice, amount, depositNumber: n });
  const r = await send([alicePublic], shieldIx(programId, alicePublic.publicKey, m, amount, s.publicKey, s.blinding, s.encryptedOutput, aliceAta.address));
  report.costs[`shield ${m.equals(SOL_MINT) ? "SOL" : "token"}`] = { units: r.units, bytes: r.bytes };
}
{
  const s = planShield({ keys: alice, amount: 1, depositNumber: 99 });
  assert.equal(await errorCode(alicePublic, shieldIx(programId, alicePublic.publicKey, SOL_MINT, 1, s.publicKey, s.blinding, s.encryptedOutput)), ERR.UnderDepositMinimum);
}
let { state, notes } = await notesOf(alice);
assert.equal(notes.length, 3);
step("shield 1 SOL, 0.5 SOL, 500 tokens; a 1-lamport deposit is refused; wallet finds all three notes", { notes: notes.map((x) => x.amount) });

// 2b. Attack on wallet sync: one transaction fills the log buffer, then
//     shields. The pool's log lines for that shield get cut off. Sync reads
//     instruction data, so it must still rebuild the exact tree.
if (logSpam) {
  const s = planShield({ keys: alice, amount: 10_000_000, depositNumber: 3 });
  const spam = new TransactionInstruction({ programId: logSpam, keys: [], data: Buffer.from([60]) });
  const tx = new Transaction().add(computeBudget(1_000_000), spam,
    shieldIx(programId, alicePublic.publicKey, SOL_MINT, 10_000_000, s.publicKey, s.blinding, s.encryptedOutput));
  const sig = await sendAndConfirmTransaction(connection, tx, [alicePublic], { commitment: "confirmed" });
  const done = await connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  assert.ok(done.meta.logMessages.some((l) => l.includes("Log truncated")), "logs were cut off");
  ({ state, notes } = await notesOf(alice));
  assert.equal(notes.length, 4, "the hidden deposit is still found");
  step("attack: a deposit whose logs are cut off is still synced and found (sync reads instruction data)");
}

const SOL_ID = assetIdOf(SOL_MINT);
const TOKEN_ID = assetIdOf(mint);

// 3. Alice sends 1.2 SOL privately to Bob. The relayer pays the network fee.
{
  const plan = planTransaction({ kind: "send", keys: alice, notes: unspent(notes, state.spent, SOL_ID), assetId: SOL_ID, amount: 1_200_000_000n, to: bob.address });
  const { proof, proveMs } = await proveTransaction({ plan, tree: state.tree, mint: SOL_MINT, value: null, programId });
  const r = await send([relayer], transactIx(programId, relayer.publicKey, proof, 0n, 0n, plan.encryptedOutputs[0], plan.encryptedOutputs[1], null));
  report.costs["private send"] = { units: r.units, bytes: r.bytes };
  step("alice sends 1.2 SOL privately to bob; relayer submits; asset hidden", { proveMs, units: r.units, txBytes: r.bytes });
}

// 4. Bob finds 1.2 SOL; Alice finds 0.3 SOL change.
({ state, notes } = await notesOf(bob));
const bobNotes = unspent(notes, state.spent, SOL_ID);
assert.equal(bobNotes.length, 1);
assert.equal(bobNotes[0].amount, 1_200_000_000n);
const a2 = await notesOf(alice);
const aliceSol = unspent(a2.notes, a2.state.spent, SOL_ID);
assert.deepEqual(aliceSol.map((n) => n.amount), logSpam ? [300_000_000n, 10_000_000n] : [300_000_000n]);
step("bob finds 1.2 SOL; alice finds 0.3 SOL change; spent notes drop out");

// 5. Bob unshields 1 SOL to a fresh address; the relayer takes 0.002 SOL.
//    Before that, someone pre-funds one of the nullifier addresses to try to
//    block the spend. It must still go through.
const fresh = Keypair.generate().publicKey;
let bobProof, bobPlan;
{
  bobPlan = planTransaction({ kind: "unshield", keys: bob, notes: bobNotes, assetId: SOL_ID, amount: 1_000_000_000n, fee: 2_000_000n });
  const value = { mint: SOL_MINT, recipient: fresh, relayer: relayer.publicKey };
  await assert.rejects(checkSolRecipient(connection, fresh, 1000n), /new address needs/);
  await checkSolRecipient(connection, fresh, 1_000_000_000n);
  ({ proof: bobProof } = await proveTransaction({ plan: bobPlan, tree: state.tree, mint: SOL_MINT, value, programId }));
  const rentFloor = await connection.getMinimumBalanceForRentExemption(0);
  await send([stranger], SystemProgram.transfer({ fromPubkey: stranger.publicKey, toPubkey: P.nullifier(bobProof.nullifiers[0]), lamports: rentFloor }));
  const before = await connection.getBalance(relayer.publicKey);
  const r = await send([relayer], transactIx(programId, relayer.publicKey, bobProof, bobPlan.extAmount, bobPlan.fee, bobPlan.encryptedOutputs[0], bobPlan.encryptedOutputs[1], value));
  report.costs["unshield SOL with fee"] = { units: r.units, bytes: r.bytes };
  assert.equal(BigInt(await connection.getBalance(fresh)), 1_000_000_000n - fee(1_000_000_000n), "1 SOL minus the protocol fee");
  const relayerNet = (await connection.getBalance(relayer.publicKey)) - before;
  step("bob unshields 1 SOL to a fresh address (0.995 after the fee); relayer paid 0.002 SOL; a pre-funded nullifier address did not block it", { units: r.units, txBytes: r.bytes, relayerNetLamports: relayerNet });
}

// 6. Replay is refused.
{
  const value = { mint: SOL_MINT, recipient: fresh, relayer: relayer.publicKey };
  const code = await errorCode(relayer, transactIx(programId, relayer.publicKey, bobProof, bobPlan.extAmount, bobPlan.fee, bobPlan.encryptedOutputs[0], bobPlan.encryptedOutputs[1], value));
  assert.equal(code, ERR.NullifierAlreadySpent);
  step("replaying the same proof is refused: NullifierAlreadySpent");
}

// 7. A relayer that redirects the payout is refused; the honest token unshield works.
({ state, notes } = await notesOf(alice));
{
  const tokenNotes = unspent(notes, state.spent, TOKEN_ID);
  const plan = planTransaction({ kind: "unshield", keys: alice, notes: tokenNotes, assetId: TOKEN_ID, amount: 100_000_000n, fee: 1_000_000n });
  const freshOwner = Keypair.generate();
  const freshAta = await getOrCreateAssociatedTokenAccount(connection, relayer, mint, freshOwner.publicKey);
  const relayerAta = await getOrCreateAssociatedTokenAccount(connection, relayer, mint, relayer.publicKey);
  const value = { mint, recipient: freshAta.address, relayer: relayerAta.address };
  const { proof } = await proveTransaction({ plan, tree: state.tree, mint, value, programId });
  const args = (v, ext = plan.extAmount) => transactIx(programId, relayer.publicKey, proof, ext, plan.fee, plan.encryptedOutputs[0], plan.encryptedOutputs[1], v);

  assert.equal(await errorCode(relayer, args({ ...value, recipient: relayerAta.address })), ERR.InvalidProof);
  assert.equal(await errorCode(relayer, args(value, plan.extAmount * 2n)), ERR.InvalidProof);
  step("redirecting the payout or doubling the amount after proving is refused: InvalidProof");

  const r = await send([relayer], args(value));
  report.costs["unshield token with fee"] = { units: r.units, bytes: r.bytes };
  assert.equal((await getAccount(connection, freshAta.address)).amount, 100_000_000n - fee(100_000_000n));
  assert.equal((await getAccount(connection, relayerAta.address)).amount, 1_000_000n);
  step("honest token unshield goes through: 100 tokens out, 1 token to the relayer", { units: r.units, txBytes: r.bytes });
}

// 8. Pausing stops deposits but not withdrawals.
await send([authority], setPausedIx(programId, authority.publicKey, true));
{
  const s = planShield({ keys: alice, amount: 1000, depositNumber: 9 });
  assert.equal(await errorCode(alicePublic, shieldIx(programId, alicePublic.publicKey, SOL_MINT, 1000, s.publicKey, s.blinding, s.encryptedOutput)), ERR.DepositsAreOff);
  ({ state, notes } = await notesOf(alice));
  const plan = planTransaction({ kind: "unshield", keys: alice, notes: unspent(notes, state.spent, SOL_ID), assetId: SOL_ID, amount: 100_000_000n });
  const out = Keypair.generate().publicKey;
  const value = { mint: SOL_MINT, recipient: out, relayer: relayer.publicKey };
  const { proof } = await proveTransaction({ plan, tree: state.tree, mint: SOL_MINT, value, programId });
  await send([relayer], transactIx(programId, relayer.publicKey, proof, plan.extAmount, plan.fee, plan.encryptedOutputs[0], plan.encryptedOutputs[1], value));
  assert.equal(BigInt(await connection.getBalance(out)), 100_000_000n - fee(100_000_000n));
  await send([authority], setPausedIx(programId, authority.publicKey, false));
  step("pause: deposits refused, a withdrawal still goes through");
}

// 9. Books.
const solBook = await readAsset(connection, programId, SOL_MINT);
const tokenBook = await readAsset(connection, programId, mint);
assert.equal(solBook.balance, 1_500_000_000n + (logSpam ? 10_000_000n : 0n) - 1_000_000_000n - 2_000_000n - 100_000_000n);
assert.equal(tokenBook.balance, 500_000_000n - 101_000_000n);
const rentFloor = await connection.getMinimumBalanceForRentExemption(0);
assert.equal(BigInt(await connection.getBalance(P.solVault)), solBook.balance + solBook.fees + BigInt(rentFloor), "SOL vault = notes + unswept fees + rent");
const shielded = [1_000_000_000n, 500_000_000n, ...(logSpam ? [10_000_000n] : [])];
const expectedSolFees = shielded.reduce((s, x) => s + fee(x), 0n) + fee(1_000_000_000n) + fee(100_000_000n);
assert.equal(solBook.fees, expectedSolFees, "SOL fees: every shield and unshield, nothing on the private send");
assert.equal(tokenBook.fees, fee(500_000_000n) + fee(100_000_000n));
step("pool books match its vaults; protocol fees accrue apart from them", { solLamports: solBook.balance, solFees: solBook.fees, tokenFees: tokenBook.fees });

// 10. Anyone sweeps the fees to the fixed recipient.
{
  const feeAta = await getOrCreateAssociatedTokenAccount(connection, relayer, mint, feeRecipient.publicKey);
  const wrongAta = await getOrCreateAssociatedTokenAccount(connection, relayer, mint, stranger.publicKey);
  assert.equal(await errorCode(stranger, collectFeesIx(programId, SOL_MINT, stranger.publicKey)), 2, "SOL fees only go to the fee recipient");
  assert.equal(await errorCode(stranger, collectFeesIx(programId, mint, wrongAta.address)), 2, "token fees only go to the fee recipient's account");
  await send([stranger], collectFeesIx(programId, SOL_MINT, feeRecipient.publicKey));
  await send([stranger], collectFeesIx(programId, mint, feeAta.address));
  assert.equal(BigInt(await connection.getBalance(feeRecipient.publicKey)), expectedSolFees);
  assert.equal((await getAccount(connection, feeAta.address)).amount, tokenBook.fees);
  assert.equal((await readAsset(connection, programId, SOL_MINT)).fees, 0n);
  assert.equal(BigInt(await connection.getBalance(P.solVault)), solBook.balance + BigInt(rentFloor), "after the sweep the vault holds only the notes' money");
  assert.equal(await errorCode(stranger, collectFeesIx(programId, SOL_MINT, feeRecipient.publicKey)), ERR.NothingToCollect);
  step("a stranger sweeps the fees to the fixed fee recipient; wrong destinations are refused", { solFees: expectedSolFees, tokenFees: tokenBook.fees });
}

fs.writeFileSync(path.join(root, "fixtures/e2e-solana-result.json"), JSON.stringify(report, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
console.log("costs:", JSON.stringify(report.costs));
console.log("all Solana end-to-end checks passed");
process.exit(0);
