// Keeps the public record of each shielded pool in the database. EVM: pool
// events from deployBlock. Solana: instruction data only, never logs (logs can
// be cut off by anyone, instruction data cannot). After each pass the rebuilt
// tree must match the chain's root; if it does not, the chain is re-indexed.
import { and, asc, eq, gte, sql } from "drizzle-orm";
import {
  createPublicClient, decodeFunctionData, encodeFunctionData, getAbiItem, getAddress, http, parseAbi,
  toFunctionSelector, toHex, type AbiFunction, type Hex,
} from "viem";
import { Connection, PublicKey } from "@solana/web3.js";
import { initPoseidon, MerkleTree, LEVELS, zeroLeaf, poseidon, protocolFeeOn, evm, solana } from "@darkswap/pool-client";
import {
  db, poolActivityTable, poolCommitmentsTable, poolFeesTable, poolNullifiersTable, poolSyncTable,
} from "@workspace/db";
import { logger } from "../logger";
import {
  evmDeployment, rpcUrl, solanaProgramId, type EvmChain, type PoolChain, type SolanaChain,
} from "./config";

export type PoolAsset = { token: string; assetId: string; symbol: string; decimals: number };
type SyncState = {
  assets?: PoolAsset[];
  feeBps?: number;
  feeRecipient?: string;
  unswept?: Record<string, string>;
};
type Commitment = { index: number; commitment: string; encryptedOutput: string; tx: string };
type Fee = { token: string; kind: string; amount: string; tx: string; position: number };
// The public side of one pool action, kept so a month of real usage can be
// summarised later. See poolActivityTable for what each field holds.
type Activity = { tx: string; position: number; kind: "shield" | "unshield" | "deposit" | "send" | "unreadable"; token: string; amount: string; relayerFee: string; occurredAt: Date };
// What the pool itself logged for one EVM transaction, in log order. Two
// nullifiers per transact, so the list also says how many transacts the
// transaction carried and where each one sits inside it; the notes it created
// and the protocol fee it charged follow each one and are what a call read out
// of the calldata is checked against.
export type Spends = {
  block: bigint;
  spent: Array<{ position: number; nullifier: bigint }>;
  outputs: Array<{ position: number; commitment: bigint; encryptedOutput: string }>;
  fees: Array<{ position: number; kind: string; token: string; amount: bigint }>;
};
const EVM_LOG_STEP = 2_000n;
const FRESH_MS = 8_000;
const MAX_LEAVES = 2 ** LEVELS;
const FEE_KINDS = ["shield", "unshield", "deposit"];
const erc20 = parseAbi(["function symbol() view returns (string)", "function decimals() view returns (uint8)"]);

const inflight = new Map<string, Promise<void>>();
const lastSync = new Map<string, number>();

/** Syncs the chain if the cached record is older than a few seconds. */
export async function ensureFresh(chain: PoolChain): Promise<void> {
  if (Date.now() - (lastSync.get(chain.id) ?? 0) < FRESH_MS) return;
  let job = inflight.get(chain.id);
  if (!job) {
    job = syncChain(chain).finally(() => inflight.delete(chain.id));
    inflight.set(chain.id, job);
  }
  await job;
  lastSync.set(chain.id, Date.now());
}

async function syncChain(chain: PoolChain): Promise<void> {
  await initPoseidon();
  const [row] = await db.select().from(poolSyncTable).where(eq(poolSyncTable.chain, chain.id));
  const start = { cursor: row?.cursor ?? null, nextIndex: row?.nextIndex ?? 0, state: (row?.state ?? {}) as SyncState };
  try {
    if (chain.kind === "evm") await syncEvm(chain, start);
    else await syncSolana(chain, start);
  } catch (err) {
    if (err instanceof RootMismatch) {
      logger.error({ chain: chain.id, err: err.message }, "pool index does not match the chain; re-indexing");
      await resetChain(chain.id);
    }
    throw err;
  }
}

class RootMismatch extends Error {}

async function resetChain(chain: string) {
  await db.transaction(async (tx) => {
    await tx.delete(poolCommitmentsTable).where(eq(poolCommitmentsTable.chain, chain));
    await tx.delete(poolNullifiersTable).where(eq(poolNullifiersTable.chain, chain));
    await tx.delete(poolFeesTable).where(eq(poolFeesTable.chain, chain));
    await tx.delete(poolActivityTable).where(eq(poolActivityTable.chain, chain));
    await tx.delete(poolSyncTable).where(eq(poolSyncTable.chain, chain));
  });
}

async function save(chain: string, batch: {
  commitments: Commitment[]; nullifiers: Array<{ nullifier: string; tx: string }>; fees: Fee[]; activity?: Activity[];
  cursor: string | null; nextIndex: number; state: SyncState; root?: string;
}) {
  await db.transaction(async (tx) => {
    if (batch.commitments.length)
      await tx.insert(poolCommitmentsTable).values(batch.commitments.map((c) => ({ chain, ...c }))).onConflictDoNothing();
    if (batch.nullifiers.length)
      await tx.insert(poolNullifiersTable).values(batch.nullifiers.map((n) => ({ chain, ...n }))).onConflictDoNothing();
    if (batch.fees.length)
      await tx.insert(poolFeesTable).values(batch.fees.map((f) => ({ chain, ...f }))).onConflictDoNothing();
    if (batch.activity?.length)
      await tx.insert(poolActivityTable).values(batch.activity.map((a) => ({ chain, ...a }))).onConflictDoNothing();
    const values = { chain, cursor: batch.cursor, nextIndex: batch.nextIndex, state: batch.state, root: batch.root ?? null, updatedAt: new Date() };
    await tx.insert(poolSyncTable).values(values).onConflictDoUpdate({ target: poolSyncTable.chain, set: values });
  });
}

/** Rebuilds the tree from stored leaves (gaps are empty leaves) and returns its root. */
async function storedRoot(chain: string, nextIndex: number): Promise<bigint> {
  const rows = await db.select({ index: poolCommitmentsTable.index, commitment: poolCommitmentsTable.commitment })
    .from(poolCommitmentsTable).where(eq(poolCommitmentsTable.chain, chain));
  const leaves: bigint[] = new Array(nextIndex).fill(zeroLeaf());
  for (const r of rows) {
    if (r.index >= nextIndex) throw new RootMismatch(`stored leaf ${r.index} is past the pool's ${nextIndex} leaves`);
    leaves[r.index] = BigInt(r.commitment);
  }
  return new MerkleTree(leaves, LEVELS).root;
}

// ---- EVM -------------------------------------------------------------------

async function syncEvm(chain: EvmChain, start: { cursor: string | null; nextIndex: number; state: SyncState }) {
  const dep = evmDeployment(chain);
  const url = rpcUrl(chain);
  if (!dep || !url) throw new Error("chain is not configured");
  const client = createPublicClient({ transport: http(url) });
  const pool = getAddress(dep.pool);
  const state: SyncState = { ...start.state, assets: [...(start.state.assets ?? [])] };
  const latest = await client.getBlockNumber();
  let from = start.cursor === null ? BigInt(dep.deployBlock) : BigInt(start.cursor) + 1n;
  let next = start.nextIndex;

  const read = <T>(functionName: string, args: unknown[] = []) =>
    client.readContract({ address: pool, abi: evm.poolAbi, functionName, args, blockNumber: latest }) as Promise<T>;

  while (from <= latest) {
    const to = from + EVM_LOG_STEP - 1n < latest ? from + EVM_LOG_STEP - 1n : latest;
    const logs = await client.getContractEvents({ address: pool, abi: evm.poolAbi, fromBlock: from, toBlock: to });
    const batch = { commitments: [] as Commitment[], nullifiers: [] as Array<{ nullifier: string; tx: string }>, fees: [] as Fee[], activity: [] as Activity[] };
    const shields: Array<{ tx: Hex; position: number; block: bigint; token: string; amount: string }> = [];
    const spends = new Map<Hex, Spends>();
    for (const log of logs as unknown as Array<{ eventName: string; args: Record<string, unknown>; transactionHash: Hex; logIndex: number; blockNumber: bigint }>) {
      const a = log.args;
      const tx = log.transactionHash;
      if (log.eventName === "Shielded")
        shields.push({ tx, position: log.logIndex, block: log.blockNumber, token: getAddress(String(a.token)), amount: String(a.amount) });
      else if (log.eventName === "NewNullifier") {
        // Every transact spends exactly two notes, so the pool's own nullifier
        // logs say how many transacts this transaction carried and which notes
        // each of them spent -- even when the pool was not called directly.
        let seen = spends.get(tx);
        if (!seen) spends.set(tx, (seen = { block: log.blockNumber, spent: [], outputs: [], fees: [] }));
        seen.spent.push({ position: log.logIndex, nullifier: BigInt(String(a.nullifier)) });
      }
      if (log.eventName === "NewCommitment") {
        batch.commitments.push({ index: Number(a.index), commitment: String(a.commitment), encryptedOutput: String(a.encryptedOutput), tx });
        // Only after a transact's nullifiers: a shield's own note comes first
        // and belongs to no transact.
        spends.get(tx)?.outputs.push({ position: log.logIndex, commitment: BigInt(String(a.commitment)), encryptedOutput: String(a.encryptedOutput) });
      } else if (log.eventName === "NewNullifier") batch.nullifiers.push({ nullifier: String(a.nullifier), tx });
      else if (log.eventName === "AssetListed") {
        const token = getAddress(String(a.token));
        if (!state.assets!.some((x) => x.token === token)) state.assets!.push(await evmAssetInfo(client, token));
      } else if (log.eventName === "ProtocolFeeCharged") {
        const kind = FEE_KINDS[Number(a.kind)] ?? `kind${a.kind}`;
        batch.fees.push({ token: getAddress(String(a.token)), kind, amount: String(a.amount), tx, position: log.logIndex });
        spends.get(tx)?.fees.push({ position: log.logIndex, kind, token: getAddress(String(a.token)), amount: BigInt(String(a.amount)) });
      } else if (log.eventName === "ProtocolFeesCollected")
        batch.fees.push({ token: getAddress(String(a.token)), kind: "collected", amount: String(a.amount), tx, position: log.logIndex });
    }
    next = Math.max(next, 1 + Math.max(-1, ...batch.commitments.map((c) => c.index)));
    batch.activity = await evmActivity(client, chain, pool, shields, spends);
    await save(chain.id, { ...batch, cursor: to.toString(), nextIndex: next, state });
    from = to + 1n;
  }

  const [nextIndex, root, feeBps, feeRecipient] = await Promise.all([
    read<bigint>("nextIndex"), read<bigint>("root"), read<number>("protocolFeeBps"), read<Hex>("feeRecipient"),
  ]);
  const unswept: Record<string, string> = {};
  for (const asset of state.assets!) unswept[asset.token] = String(await read<bigint>("protocolFees", [asset.token]));
  const local = await storedRoot(chain.id, Number(nextIndex));
  if (local !== root) throw new RootMismatch(`rebuilt root ${toHex(local)} != pool root ${toHex(root)}`);
  await db.update(poolSyncTable).set({
    nextIndex: Number(nextIndex), root: root.toString(), updatedAt: new Date(),
    state: { ...state, feeBps: Number(feeBps), feeRecipient: getAddress(feeRecipient), unswept },
  }).where(eq(poolSyncTable.chain, chain.id));
}

/**
 * The public amounts behind one batch of EVM logs. A shield publishes its
 * amount in the Shielded event; a transact publishes nothing, so its external
 * amount and relayer fee are read back from the call's own arguments.
 *
 * The pool's nullifier logs are what says how many transacts a transaction
 * carried: two per transact, whoever sent it. Each pair is matched against the
 * calls in the input that spent those exact notes, so a transaction holding
 * several transacts is counted once per transact and never twice for one.
 *
 * Calldata on its own is not evidence of execution. A transaction sent to the
 * pool can only have run the call at the front of its input, so that one is
 * taken as read. Anything found inside another contract's calldata is not:
 * that contract may carry a payload it never used, or one whose call reverted,
 * and it may equally have rebuilt the real call from its own arguments so that
 * nothing readable is left. Such a call is believed only when the pool's own
 * logs for that transact bear it out -- the notes it created, and the protocol
 * fee charged, which the pool computes from the very amount being claimed.
 *
 * A pair with no call behind it, or one the logs do not bear out, is recorded
 * as "unreadable" rather than dropped, so the exported month counts it as a
 * known gap instead of inventing volume. An RPC that merely failed is a
 * different thing: it throws, the batch cursor is not saved, and the next sync
 * reads the same blocks again. Exported for tests.
 */
export async function evmActivity(
  client: ReturnType<typeof createPublicClient>, chain: EvmChain, pool: Hex,
  shields: Array<{ tx: Hex; position: number; block: bigint; token: string; amount: string }>,
  spends: Map<Hex, Spends>,
): Promise<Activity[]> {
  if (!shields.length && !spends.size) return [];
  const blocks = new Map<bigint, Promise<Date>>();
  const timeOf = (block: bigint) => {
    if (!blocks.has(block)) blocks.set(block, client.getBlock({ blockNumber: block }).then((b) => new Date(Number(b.timestamp) * 1000)));
    return blocks.get(block)!;
  };
  // Only read for a routed call, and once per block: the fee rate is what ties
  // the amount claimed in the calldata to the fee the pool actually charged.
  const rates = new Map<bigint, Promise<number>>();
  const feeBpsAt = (blockNumber: bigint) => {
    if (!rates.has(blockNumber)) {
      rates.set(blockNumber, client.readContract({ address: pool, abi: evm.poolAbi, functionName: "protocolFeeBps", blockNumber }).then(Number));
    }
    return rates.get(blockNumber)!;
  };
  const activity: Activity[] = [];
  for (const s of shields) {
    activity.push({ tx: s.tx, position: s.position, kind: "shield", token: s.token, amount: s.amount, relayerFee: "0", occurredAt: await timeOf(s.block) });
  }
  for (const [tx, seen] of spends) {
    // A failure here propagates: the cursor stays where it is and the blocks
    // are read again, rather than leaving a hole nothing will ever fill.
    const calls = await evmTransactCalls(client, pool, tx);
    const occurredAt = await timeOf(seen.block);
    const spent = [...seen.spent].sort((x, y) => x.position - y.position);
    // Two notes can only be spent once, so a pair belongs to one transact and
    // every candidate naming it is a copy of, or a rival to, that one call.
    for (let i = 0; i < spent.length; i += 2) {
      const pair = spent.slice(i, i + 2);
      const position = pair[0].position;
      const until = spent[i + 2]?.position ?? Infinity;
      const within = <T extends { position: number }>(logs: T[]) => logs.filter((l) => l.position > position && l.position < until);
      const candidates = calls.filter((call) => pair.every((n) => call.nullifiers.includes(n.nullifier)));
      const direct = candidates.find((call) => call.direct);
      let call = direct;
      if (!call) {
        const logged = { outputs: within(seen.outputs).slice(0, 2), fees: within(seen.fees) };
        const bps = candidates.length ? await feeBpsAt(seen.block) : 0;
        const borneOut = candidates.filter((c) => matchesLogs(c, logged, bps));
        // Copies of one call all say the same thing; rivals do not, and no
        // log says which of them ran.
        const distinct = new Set(borneOut.map((c) => `${c.extAmount}:${c.fee}:${c.token}`));
        if (distinct.size === 1) call = borneOut[0];
      }
      if (!call) {
        const why = candidates.length ? "the pool's logs do not bear out the amounts in the transaction's input" : "the call is not in the transaction's input";
        logger.warn({ chain: chain.id, tx, position, candidates: candidates.length }, `pool transact arguments could not be read (${why}); recorded as unreadable`);
        activity.push({ tx, position, kind: "unreadable", token: "", amount: "0", relayerFee: "0", occurredAt });
        continue;
      }
      const kind = directionOf(call.extAmount);
      activity.push({
        tx, position, kind,
        token: kind === "send" ? "" : call.token,
        amount: (call.extAmount < 0n ? -call.extAmount : call.extAmount).toString(),
        relayerFee: call.fee.toString(),
        occurredAt,
      });
    }
  }
  return activity;
}

/**
 * Whether the pool's own logs for one transact bear out a call read out of
 * another contract's calldata.
 *
 * The two notes it created are logged with the encrypted outputs the call
 * carried, and the protocol fee is computed by the pool from the external
 * amount itself, so a payload claiming a different amount is charged a fee
 * that does not match. A transact that moved nothing in or out is charged no
 * fee at all, and has no amount to get wrong.
 *
 * Two things cannot be borne out and stay a stated gap: a transact that found
 * the tree full and logged no notes, and an amount a pool with no fee rate
 * charged nothing for, where no log depends on the amount at all.
 */
function matchesLogs(
  call: TransactCall,
  logged: { outputs: Array<{ commitment: bigint; encryptedOutput: string }>; fees: Array<{ kind: string; token: string; amount: bigint }> },
  bps: number,
): boolean {
  if (!logged.outputs.length || logged.outputs.length !== call.outputs.length) return false;
  const sameNotes = call.outputs.every((o, i) =>
    o.commitment === logged.outputs[i].commitment
    && o.encryptedOutput.toLowerCase() === logged.outputs[i].encryptedOutput.toLowerCase());
  if (!sameNotes) return false;
  // Nothing went in or out, so no fee was charged and none should have been.
  if (call.extAmount === 0n) return !logged.fees.length;
  const charged = protocolFeeOn(call.extAmount < 0n ? -call.extAmount : call.extAmount, bps);
  const fee = logged.fees.find((f) => f.kind === (call.extAmount < 0n ? "unshield" : "deposit"));
  return charged > 0n && fee?.amount === charged && getAddress(fee.token) === call.token;
}
const TRANSACT_SELECTOR = toFunctionSelector(getAbiItem({ abi: evm.poolAbi, name: "transact" }) as AbiFunction).slice(2);

/** Which way an external amount moved, as the activity record names it. */
function directionOf(extAmount: bigint): "deposit" | "unshield" | "send" {
  return extAmount > 0n ? "deposit" : extAmount < 0n ? "unshield" : "send";
}

async function evmAssetInfo(client: ReturnType<typeof createPublicClient>, token: Hex): Promise<PoolAsset> {
  const assetId = evm.assetIdOf(token).toString();
  if (token === getAddress(evm.ETH)) return { token, assetId, symbol: "ETH", decimals: 18 };
  const [symbol, decimals] = await Promise.all([
    client.readContract({ address: token, abi: erc20, functionName: "symbol" }).catch(() => "TOKEN"),
    client.readContract({ address: token, abi: erc20, functionName: "decimals" }).catch(() => 18),
  ]);
  return { token, assetId, symbol: String(symbol), decimals: Number(decimals) };
}

// ---- Solana ----------------------------------------------------------------

async function syncSolana(chain: SolanaChain, start: { cursor: string | null; nextIndex: number; state: SyncState }) {
  const programId = solanaProgramId(chain);
  const url = rpcUrl(chain);
  if (!programId || !url) throw new Error("chain is not configured");
  const connection = new Connection(url, "confirmed");
  const poolKey = solana.pdas(programId).pool;
  const state: SyncState = { ...start.state, assets: [...(start.state.assets ?? [])] };

  // Newest first from the RPC; stop at the last signature already indexed.
  const sigs: Array<{ slot: number; signature: string }> = [];
  let before: string | undefined;
  for (;;) {
    const page = await connection.getSignaturesForAddress(poolKey, { before, until: start.cursor ?? undefined, limit: 1000 }, "confirmed");
    if (!page.length) break;
    sigs.push(...page.filter((s) => !s.err));
    before = page.at(-1)!.signature;
    if (page.length < 1000) break;
  }
  const ordered = await solana.inExecutionOrder(connection, sigs);

  let nextIndex = start.nextIndex;
  let bps = state.feeBps ?? 0;
  const mintOfAsset = new Map(state.assets!.map((a) => [solana.pdas(programId).asset(new PublicKey(a.token)).toBase58(), a.token]));
  let cursor = start.cursor;
  for (const sig of ordered) {
    const tx = await connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    const batch = { commitments: [] as Commitment[], nullifiers: [] as Array<{ nullifier: string; tx: string }>, fees: [] as Fee[], activity: [] as Activity[] };
    // Solana reports when the slot was produced; without it the action cannot
    // be placed in a month, so it is indexed but left out of the record.
    const occurredAt = tx?.blockTime ? new Date(tx.blockTime * 1000) : null;
    if (tx && !tx.meta?.err) {
      let position = 0;
      for (const { data, accounts } of solana.poolCalls(tx, programId)) {
        const tag = data[0];
        const r = data.subarray(1);
        position += 1;
        if (tag === 0) bps = r.readUInt16LE(40);
        else if (tag === 7) bps = r.readUInt16LE(0);
        else if (tag === 1) {
          const mint = accounts[3];
          mintOfAsset.set(accounts[2].toBase58(), mint.toBase58());
          if (!state.assets!.some((a) => a.token === mint.toBase58())) state.assets!.push(await solanaAssetInfo(connection, programId, mint));
        } else if (tag === 5) {
          const mint = mintOfAsset.get(accounts[2].toBase58());
          if (!mint) throw new RootMismatch("shield into an asset that was never listed");
          const amount = solanaShieldAmount(data);
          const publicKey = BigInt(toHex(r.subarray(8, 40)));
          const blinding = BigInt(toHex(r.subarray(40, 72)));
          const len = r.readUInt16LE(72);
          const commitment = poseidon([amount, solana.assetIdOf(new PublicKey(mint)), publicKey, blinding]);
          batch.commitments.push({ index: nextIndex, commitment: commitment.toString(), encryptedOutput: toHex(r.subarray(74, 74 + len)), tx: sig });
          nextIndex += 2; // the second leaf of a shield is empty
          batch.fees.push({ token: mint, kind: "shield", amount: protocolFeeOn(amount, bps).toString(), tx: sig, position });
          if (occurredAt) batch.activity.push({ tx: sig, position, kind: "shield", token: mint, amount: amount.toString(), relayerFee: "0", occurredAt });
        } else if (tag === 6) {
          batch.nullifiers.push({ nullifier: BigInt(toHex(r.subarray(288, 320))).toString(), tx: sig });
          batch.nullifiers.push({ nullifier: BigInt(toHex(r.subarray(320, 352))).toString(), tx: sig });
          const { extAmount, relayerFee } = solanaTransact(data);
          const mint = accounts.length > 5 ? mintOfAsset.get(accounts[5].toBase58()) : undefined;
          if (extAmount < 0n && mint) {
            batch.fees.push({ token: mint, kind: "unshield", amount: protocolFeeOn(-extAmount, bps).toString(), tx: sig, position });
          }
          if (occurredAt) {
            const kind = directionOf(extAmount);
            batch.activity.push({
              tx: sig, position, kind, token: kind === "send" ? "" : (mint ?? ""),
              amount: (extAmount < 0n ? -extAmount : extAmount).toString(),
              relayerFee: relayerFee.toString(), occurredAt,
            });
          }
          const len0 = r.readUInt16LE(432);
          const len1 = r.readUInt16LE(434 + len0);
          if (nextIndex + 2 > MAX_LEAVES) continue; // full tree: outputs dropped
          batch.commitments.push({ index: nextIndex, commitment: BigInt(toHex(r.subarray(352, 384))).toString(), encryptedOutput: toHex(r.subarray(434, 434 + len0)), tx: sig });
          batch.commitments.push({ index: nextIndex + 1, commitment: BigInt(toHex(r.subarray(384, 416))).toString(), encryptedOutput: toHex(r.subarray(436 + len0, 436 + len0 + len1)), tx: sig });
          nextIndex += 2;
        }
      }
    }
    cursor = sig;
    await save(chain.id, { ...batch, cursor, nextIndex, state: { ...state, feeBps: bps } });
  }

  const pool = await solana.readPool(connection, programId);
  if (pool.nextIndex !== nextIndex) throw new RootMismatch(`indexed ${nextIndex} leaves, pool has ${pool.nextIndex}`);
  const local = await storedRoot(chain.id, nextIndex);
  if (local !== pool.root) throw new RootMismatch("rebuilt root does not match the pool account");
  const unswept: Record<string, string> = {};
  for (const asset of state.assets!) {
    const info = await solana.readAsset(connection, programId, new PublicKey(asset.token));
    unswept[asset.token] = String(info?.fees ?? 0n);
  }
  await save(chain.id, {
    commitments: [], nullifiers: [], fees: [], cursor, nextIndex, root: pool.root.toString(),
    state: { ...state, feeBps: pool.feeBps, feeRecipient: pool.feeRecipient.toBase58(), unswept },
  });
}

/**
 * What a Solana shield (tag 5) deposits, read from the instruction's own
 * arguments: a u64 amount straight after the tag. The protocol fee the
 * depositor pays on top is not part of it. Exported for tests.
 */
export function solanaShieldAmount(data: Buffer): bigint {
  if (data[0] !== 5) throw new Error(`not a shield instruction (tag ${data[0]})`);
  return data.readBigUInt64LE(1);
}

/**
 * The public amounts of a Solana transact (tag 6), read from the
 * instruction's own arguments: nothing about them is published anywhere else.
 * They sit after the proof, the root, the two nullifiers and the two
 * commitments -- 1 + 13 * 32 bytes in -- as a signed external amount and the
 * fee the sender pays a relayer. A positive amount brings money in, a
 * negative one takes it out, and zero is a private send. Exported for tests.
 */
export function solanaTransact(data: Buffer): { extAmount: bigint; relayerFee: bigint; kind: "deposit" | "unshield" | "send" } {
  if (data[0] !== 6) throw new Error(`not a transact instruction (tag ${data[0]})`);
  const extAmount = data.readBigInt64LE(417);
  return { extAmount, relayerFee: data.readBigUInt64LE(425), kind: directionOf(extAmount) };
}

async function solanaAssetInfo(connection: Connection, programId: PublicKey, mint: PublicKey): Promise<PoolAsset> {
  const assetId = solana.assetIdOf(mint).toString();
  if (mint.equals(solana.SOL_MINT)) return { token: mint.toBase58(), assetId, symbol: "SOL", decimals: 9 };
  const info = await solana.readAsset(connection, programId, mint);
  return { token: mint.toBase58(), assetId, symbol: `${mint.toBase58().slice(0, 4)}…`, decimals: info?.decimals ?? 0 };
}

// ---- reads -----------------------------------------------------------------

export async function readState(chain: PoolChain, since: number) {
  const [row] = await db.select().from(poolSyncTable).where(eq(poolSyncTable.chain, chain.id));
  const state = (row?.state ?? {}) as SyncState;
  const commitments = await db.select({
    index: poolCommitmentsTable.index, commitment: poolCommitmentsTable.commitment,
    encryptedOutput: poolCommitmentsTable.encryptedOutput, tx: poolCommitmentsTable.tx,
  }).from(poolCommitmentsTable)
    .where(and(eq(poolCommitmentsTable.chain, chain.id), gte(poolCommitmentsTable.index, since)))
    .orderBy(asc(poolCommitmentsTable.index));
  const nullifiers = await db.select({ nullifier: poolNullifiersTable.nullifier, tx: poolNullifiersTable.tx })
    .from(poolNullifiersTable).where(eq(poolNullifiersTable.chain, chain.id));
  const feeRows = await db.select({
    token: poolFeesTable.token, kind: poolFeesTable.kind,
    total: sql<string>`sum(${poolFeesTable.amount}::numeric)::text`, count: sql<number>`count(*)::int`,
  }).from(poolFeesTable).where(eq(poolFeesTable.chain, chain.id)).groupBy(poolFeesTable.token, poolFeesTable.kind);

  const protocolFees = (state.assets ?? []).map((asset) => {
    const of = (kind: string) => BigInt(feeRows.find((f) => f.token === asset.token && f.kind === kind)?.total ?? "0");
    const charged = of("shield") + of("unshield") + of("deposit");
    const unswept = BigInt(state.unswept?.[asset.token] ?? "0");
    // EVM records each sweep as an event. Solana sweeps carry no amount in
    // their instruction data, so swept = charged - still in the pool.
    const swept = chain.kind === "evm" ? of("collected") : charged - unswept;
    return { token: asset.token, symbol: asset.symbol, decimals: asset.decimals, charged: charged.toString(), unswept: unswept.toString(), swept: swept.toString() };
  });

  return {
    nextIndex: row?.nextIndex ?? 0,
    root: row?.root ?? null,
    commitments,
    spentNullifiers: nullifiers.map((n) => n.nullifier),
    spentTx: Object.fromEntries(nullifiers.map((n) => [n.nullifier, n.tx])),
    assets: state.assets ?? [],
    feeBps: state.feeBps ?? null,
    protocolFees,
    indexedAt: row?.updatedAt?.toISOString() ?? null,
  };
}

/** One transact's public arguments, read back out of the call itself. */
export type TransactCall = {
  /** True only for the call the transaction was sent to the pool with. */
  direct: boolean;
  nullifiers: bigint[];
  outputs: Array<{ commitment: bigint; encryptedOutput: string }>;
  extAmount: bigint;
  fee: bigint;
  token: Hex;
};

/**
 * Every pool transact inside one transaction, with the external amounts its
 * logs never publish. Exported for tests.
 *
 * The amounts live only in the call's arguments. A wallet that calls the pool
 * directly puts them at the front of the transaction's input; a batcher, a
 * smart account or an aggregator usually carries the same call somewhere
 * inside its own calldata, which is why it is looked for by its own encoding
 * anywhere in the input rather than only at the start.
 *
 * What this returns is every transact the input *could* describe, not what
 * ran. A match counts only if re-encoding what was decoded reproduces those
 * exact bytes, which rules out a stray selector in unrelated data; it says
 * nothing about whether the call executed, reverted, or was ignored, and a
 * contract that rebuilds the call from its own arguments leaves nothing here
 * to find at all. The caller decides what to believe from the pool's own logs.
 *
 * An RPC failure is not caught here: it is transient and must be retried, not
 * recorded as an unreadable call.
 */
export async function evmTransactCalls(client: ReturnType<typeof createPublicClient>, pool: Hex, hash: Hex): Promise<TransactCall[]> {
  const transaction = await client.getTransaction({ hash });
  const input = transaction.input.toLowerCase();
  const toPool = !!transaction.to && getAddress(transaction.to) === getAddress(pool);
  const calls: TransactCall[] = [];
  for (let at = 2; at + TRANSACT_SELECTOR.length <= input.length; at += 2) {
    if (!input.startsWith(TRANSACT_SELECTOR, at)) continue;
    const call = decodeTransact(`0x${input.slice(at)}`, toPool && at === 2);
    if (call && input.startsWith(call.encoded, at)) calls.push(call.value);
  }
  return calls;
}

/** One transact's arguments, with the canonical encoding they must come from. */
function decodeTransact(data: Hex, direct: boolean): { value: TransactCall; encoded: string } | null {
  try {
    const decoded = decodeFunctionData({ abi: evm.poolAbi, data });
    if (decoded.functionName !== "transact") return null;
    const args = decoded.args as unknown as [
      { inputNullifiers: readonly bigint[]; outputCommitments: readonly bigint[] },
      { extAmount: bigint; fee: bigint; token: Hex; encryptedOutput1: Hex; encryptedOutput2: Hex },
    ];
    const [proof, ext] = args;
    const encrypted = [ext.encryptedOutput1, ext.encryptedOutput2];
    return {
      value: {
        direct,
        nullifiers: proof.inputNullifiers.map(BigInt),
        outputs: proof.outputCommitments.map((commitment, i) => ({ commitment: BigInt(commitment), encryptedOutput: String(encrypted[i] ?? "0x") })),
        extAmount: BigInt(ext.extAmount), fee: BigInt(ext.fee), token: getAddress(ext.token),
      },
      encoded: encodeFunctionData({ abi: evm.poolAbi, functionName: "transact", args: decoded.args }).toLowerCase().slice(2),
    };
  } catch {
    return null; // not a transact at these bytes; re-reading them changes nothing
  }
}
