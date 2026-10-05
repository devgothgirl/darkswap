// What the indexer can and cannot read back out of a pool transact, and which
// of the two is allowed to be recorded as a gap. Runs with the pool volume
// tests (scripts/test-pool-volumes.sh) because importing the indexer opens a
// database connection.
import assert from "node:assert/strict";
import test from "node:test";
import { encodeFunctionData, getAddress, parseAbi, type Hex } from "viem";
import { evm, protocolFeeOn } from "@darkswap/pool-client";
import { findChain } from "./config";
import { evmActivity, evmTransactCalls, type Spends } from "./indexer";

const POOL = getAddress("0x1111111111111111111111111111111111111111");
const OTHER = getAddress("0x2222222222222222222222222222222222222222");
const TOKEN = getAddress("0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE");
const HASH = "0xaa" as Hex;
const BPS = 50;
const chain = findChain("base-sepolia")!;
if (chain.kind !== "evm") throw new Error("base-sepolia should be an EVM chain");

const proofSpending = (n0: bigint, n1: bigint, outputs: [bigint, bigint]) => ({
  a: [0n, 0n], b: [[0n, 0n], [0n, 0n]], c: [0n, 0n],
  root: 0n, inputNullifiers: [n0, n1], outputCommitments: outputs,
});
const transactInput = (extAmount: bigint, fee: bigint, n0 = 1n, n1 = 2n, outputs: [bigint, bigint] = [3n, 4n]) => encodeFunctionData({
  abi: evm.poolAbi, functionName: "transact",
  args: [proofSpending(n0, n1, outputs), {
    recipient: OTHER, extAmount, relayer: OTHER, fee, token: TOKEN,
    encryptedOutput1: "0x", encryptedOutput2: "0x",
  }],
});

// A smart account or batcher forwarding one call, and one forwarding several.
const forwarded = (inner: Hex) => encodeFunctionData({
  abi: parseAbi(["function execute(address to, uint256 value, bytes data)"]),
  args: [POOL, 0n, inner],
});
const batched = (...inner: Hex[]) => encodeFunctionData({
  abi: parseAbi(["function multicall(bytes[] data)"]), args: [inner],
});

// Only the calls the indexer makes: the transaction, its block, and the fee
// rate the pool charged at that block.
const clientWith = (getTransaction: () => Promise<unknown>) =>
  ({
    getTransaction,
    getBlock: async () => ({ timestamp: 1_767_225_600n }),
    readContract: async () => BPS,
  }) as unknown as Parameters<typeof evmTransactCalls>[0];
const calls = (input: Hex | null, to: Hex | null = POOL) =>
  evmTransactCalls(clientWith(async () => ({ to, input: input ?? "0x" })), POOL, HASH);

/**
 * The pool's own logs for one transaction, in the order it emits them: two
 * nullifiers, the two notes created, then the protocol fee, per transact. The
 * fee is what the pool really charges on that amount, since that is what ties
 * an amount read out of the calldata to the call that ran.
 */
type Transact = { spent: [bigint, bigint]; amount?: bigint; outputs?: [bigint, bigint]; kind?: string; discarded?: boolean };
const logged = (...transacts: Transact[]): Map<Hex, Spends> => {
  const seen: Spends = { block: 1n, spent: [], outputs: [], fees: [] };
  let position = 0;
  for (const t of transacts) {
    for (const nullifier of t.spent) seen.spent.push({ position: position++, nullifier });
    if (!t.discarded) for (const commitment of t.outputs ?? [3n, 4n]) seen.outputs.push({ position: position++, commitment, encryptedOutput: "0x" });
    const fee = protocolFeeOn(t.amount ?? 0n, BPS);
    if (fee > 0n) seen.fees.push({ position: position++, kind: t.kind ?? "unshield", token: TOKEN, amount: fee });
    position += 2; // room between transacts, as other logs would take
  }
  return new Map([[HASH, seen]]);
};

test("a withdrawal sent straight to the pool gives up its amount and relayer fee", async () => {
  const [call] = await calls(transactInput(-200n, 7n));
  assert.equal(call.direct, true);
  assert.deepEqual([call.nullifiers, call.extAmount, call.fee, call.token], [[1n, 2n], -200n, 7n, TOKEN]);
});

test("a deposit and a private send are told apart by their external amount", async () => {
  const [deposit] = await calls(transactInput(500n, 0n));
  assert.equal(deposit.extAmount, 500n);
  const [send] = await calls(transactInput(0n, 0n));
  assert.equal(send.extAmount, 0n);
});

test("a withdrawal routed through another contract is still read", async () => {
  // The arguments sit inside the forwarding contract's calldata, not at the
  // front of the transaction, and the transaction is not sent to the pool.
  const [call] = await calls(forwarded(transactInput(-200n, 7n)), OTHER);
  assert.equal(call.direct, false);
  assert.deepEqual([call.nullifiers, call.extAmount, call.fee, call.token], [[1n, 2n], -200n, 7n, TOKEN]);
});

test("a call forwarded to somewhere else is not treated as the one that was sent", async () => {
  // Sent to the pool, but the transact is buried in the arguments rather than
  // being the call itself, so it has to earn its place like any other.
  const [call] = await calls(forwarded(transactInput(-200n, 7n)), POOL);
  assert.equal(call.direct, false);
});

test("every withdrawal in a batch is read, and each is read only once", async () => {
  const found = await calls(batched(transactInput(-200n, 7n, 11n, 12n), transactInput(-50n, 0n, 13n, 14n)), OTHER);
  assert.deepEqual(found.map((c) => c.extAmount), [-200n, -50n]);
  assert.deepEqual(found.map((c) => c.nullifiers), [[11n, 12n], [13n, 14n]]);
});

test("the transact selector sitting in unrelated data is not mistaken for a call", async () => {
  const stray = `${transactInput(-200n, 7n).slice(0, 10)}deadbeef` as Hex;
  assert.deepEqual(await calls(forwarded(stray), OTHER), []);
  // Sent to the pool, but not a transact this ABI knows.
  assert.deepEqual(await calls("0xdeadbeef"), []);
  // Contract creation.
  assert.deepEqual(await calls(null, null), []);
});

test("an RPC that fails is not mistaken for an unreadable call", async () => {
  // Swallowing this would drop a real withdrawal from the month for good: the
  // sync saves its cursor straight after, and those blocks are never read again.
  const client = clientWith(async () => { throw new Error("HTTP request failed"); });
  await assert.rejects(() => evmTransactCalls(client, POOL, HASH), /HTTP request failed/);
});

test("a withdrawal through another contract is counted, not left out of the month", async () => {
  const client = clientWith(async () => ({ to: OTHER, input: forwarded(transactInput(-200n, 7n)) }));
  const activity = await evmActivity(client, chain, POOL, [], logged({ spent: [1n, 2n], amount: 200n }));
  assert.equal(activity.length, 1);
  assert.equal(activity[0].kind, "unshield");
  assert.equal(activity[0].amount, "200");
  assert.equal(activity[0].relayerFee, "7");
  assert.equal(activity[0].token, TOKEN);
});

test("a batch of two transacts is counted as two actions, matched by the notes they spent", async () => {
  const client = clientWith(async () => ({
    // Carried in the reverse of the order the pool logged them, to show the
    // pairing is by nullifier and not by position in the calldata.
    to: OTHER,
    input: batched(transactInput(-50n, 0n, 13n, 14n, [5n, 6n]), transactInput(-200n, 7n, 11n, 12n, [3n, 4n])),
  }));
  const activity = await evmActivity(client, chain, POOL, [], logged(
    { spent: [11n, 12n], amount: 200n, outputs: [3n, 4n] },
    { spent: [13n, 14n], amount: 50n, outputs: [5n, 6n] },
  ));
  assert.deepEqual(activity.map((a) => [a.kind, a.amount]), [["unshield", "200"], ["unshield", "50"]]);
});

test("a payload that never ran cannot pass itself off as the withdrawal that did", async () => {
  // Calldata is not evidence of execution: a forwarding contract can carry a
  // payload it ignores, or one whose call reverted, naming the same notes with
  // a bigger amount. The fee the pool charged is computed from the real
  // amount, so the planted one does not match it and the real one does.
  const client = clientWith(async () => ({
    to: OTHER, input: batched(transactInput(-999_999n, 0n), transactInput(-200n, 7n)),
  }));
  const activity = await evmActivity(client, chain, POOL, [], logged({ spent: [1n, 2n], amount: 200n }));
  assert.deepEqual(activity.map((a) => [a.kind, a.amount]), [["unshield", "200"]]);
});

test("a planted payload is a gap, not a withdrawal, when the real call cannot be read", async () => {
  // The worst case: the contract rebuilt the real call from its own arguments,
  // so the only thing left to decode is the payload it planted. Inventing
  // 999999 of volume from it would be worse than saying the month has a hole.
  const client = clientWith(async () => ({ to: OTHER, input: forwarded(transactInput(-999_999n, 0n)) }));
  const activity = await evmActivity(client, chain, POOL, [], logged({ spent: [1n, 2n], amount: 200n }));
  assert.deepEqual(activity.map((a) => [a.kind, a.amount]), [["unreadable", "0"]]);
});

test("planted payloads that agree with each other are still a gap", async () => {
  // Agreement between payloads says nothing: they can all be planted, and the
  // notes the pool logged are the only thing that can tell.
  const inner = transactInput(-999_999n, 0n, 1n, 2n, [7n, 8n]);
  const client = clientWith(async () => ({ to: OTHER, input: batched(inner, inner) }));
  const activity = await evmActivity(client, chain, POOL, [], logged({ spent: [1n, 2n], amount: 200n, outputs: [3n, 4n] }));
  assert.deepEqual(activity.map((a) => [a.kind, a.amount]), [["unreadable", "0"]]);
});

test("the same call carried twice is still one withdrawal", async () => {
  // A wrapper that repeats the call verbatim is not two withdrawals, and the
  // repetition is not a disagreement: every copy says the same thing.
  const inner = transactInput(-200n, 7n);
  const client = clientWith(async () => ({ to: OTHER, input: batched(inner, inner) }));
  const activity = await evmActivity(client, chain, POOL, [], logged({ spent: [1n, 2n], amount: 200n }));
  assert.deepEqual(activity.map((a) => [a.kind, a.amount, a.relayerFee]), [["unshield", "200", "7"]]);
});

test("a routed private send is counted, since it claims no amount to get wrong", async () => {
  const client = clientWith(async () => ({ to: OTHER, input: forwarded(transactInput(0n, 0n)) }));
  const activity = await evmActivity(client, chain, POOL, [], logged({ spent: [1n, 2n] }));
  assert.deepEqual(activity.map((a) => [a.kind, a.amount, a.token]), [["send", "0", ""]]);
});

test("a routed withdrawal whose notes the pool could not store stays a gap", async () => {
  // A full tree discards the outputs, so nothing is left to check the call
  // against. The action is still counted, as a hole rather than a number.
  const client = clientWith(async () => ({ to: OTHER, input: forwarded(transactInput(-200n, 7n)) }));
  const activity = await evmActivity(client, chain, POOL, [], logged({ spent: [1n, 2n], amount: 200n, discarded: true }));
  assert.deepEqual(activity.map((a) => [a.kind, a.amount]), [["unreadable", "0"]]);
});

test("a transact whose arguments cannot be found anywhere is recorded as a known gap", async () => {
  // A contract that rebuilds the call from its own arguments leaves nothing to
  // decode. The action is still counted as unreadable rather than dropped.
  const client = clientWith(async () => ({ to: OTHER, input: "0xdeadbeef" }));
  const activity = await evmActivity(client, chain, POOL, [], logged({ spent: [1n, 2n], amount: 200n }));
  assert.deepEqual(activity.map((a) => [a.kind, a.amount, a.token]), [["unreadable", "0", ""]]);
});

test("a shield keeps the amount the pool published and needs no call read", async () => {
  const client = clientWith(async () => { throw new Error("no transaction should be read"); });
  const activity = await evmActivity(client, chain, POOL, [{ tx: HASH, position: 4, block: 1n, token: TOKEN, amount: "900" }], new Map());
  assert.deepEqual(activity.map((a) => [a.kind, a.amount, a.position]), [["shield", "900", 4]]);
});
