// Solana chain adapter: PDAs, instruction encoding, log scanning, tree
// sync, and extDataHash exactly as the pool program computes it.
import {
  PublicKey, SystemProgram, TransactionInstruction, Transaction, ComputeBudgetProgram,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import { sha256 } from "@noble/hashes/sha2.js";
import bs58 from "bs58";
import { MerkleTree, LEVELS, zeroLeaf, poseidon, buildInput, stringify, hex32 } from "./lib.js";
import { prove } from "./prover.js";

export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const BPF_UPGRADEABLE = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
export const SOL_MINT = SystemProgram.programId; // all zeros

// pool account layout (see solana/pool/src/lib.rs)
const P_FEE_BPS = 52;
const P_FEE_RECIPIENT = 56;
const P_TREE = 88;
const T_NEXT_INDEX = 0;
const T_CURRENT_SLOT = 16;
const T_ROOTS = 24 + 26 * 32 + 27 * 32;

const be = (buf) => BigInt("0x" + (Buffer.from(buf).toString("hex") || "0"));
const field32 = (x) => Buffer.from(BigInt(x).toString(16).padStart(64, "0"), "hex");
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const i64 = (n) => { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(n)); return b; };
const bytesWithLen = (b) => Buffer.concat([u16(b.length), Buffer.from(b)]);

export function pdas(programId) {
  const find = (...seeds) => PublicKey.findProgramAddressSync(seeds, programId)[0];
  return {
    pool: find(Buffer.from("pool")),
    solVault: find(Buffer.from("sol_vault")),
    asset: (mint) => find(Buffer.from("asset"), mint.toBuffer()),
    vault: (mint) => (mint.equals(SOL_MINT) ? find(Buffer.from("sol_vault")) : find(Buffer.from("vault"), mint.toBuffer())),
    nullifier: (n) => find(Buffer.from("nullifier"), field32(n)),
    programData: PublicKey.findProgramAddressSync([programId.toBuffer()], BPF_UPGRADEABLE)[0],
  };
}

/** Poseidon(high 16 bytes, low 16 bytes) of the mint. */
export function assetIdOf(mint) {
  const b = mint.toBuffer();
  return poseidon([be(b.subarray(0, 16)), be(b.subarray(16))]);
}

export function extDataHash({ programId, recipient, relayer, mint, extAmount, fee, enc0, enc1 }) {
  const h = sha256.create()
    .update(Buffer.from("darkswap.solana.extdata.v1"))
    .update(programId.toBuffer()).update(recipient.toBuffer()).update(relayer.toBuffer()).update(mint.toBuffer())
    .update(i64(extAmount)).update(u64(fee))
    .update(bytesWithLen(enc0)).update(bytesWithLen(enc1))
    .digest();
  h[0] &= 0x1f;
  return be(h);
}

// ---- instructions --------------------------------------------------------------

const ix = (programId, keys, data) => new TransactionInstruction({ programId, keys, data: Buffer.from(data) });
const w = (pubkey, isSigner = false) => ({ pubkey, isSigner, isWritable: true });
const ro = (pubkey, isSigner = false) => ({ pubkey, isSigner, isWritable: false });

export function initializeIx(programId, admin, guardianExpiry, feeRecipient, feeBps) {
  const p = pdas(programId);
  return ix(programId, [w(admin, true), w(p.pool), w(p.solVault), ro(p.programData), ro(SystemProgram.programId)],
    Buffer.concat([Buffer.from([0]), i64(guardianExpiry), feeRecipient.toBuffer(), u16(feeBps)]));
}

export function setFeeIx(programId, admin, bps) {
  const p = pdas(programId);
  return ix(programId, [ro(admin, true), w(p.pool)], Buffer.concat([Buffer.from([7]), u16(bps)]));
}

/** destination: the fee recipient wallet for SOL, or its token account for `mint`. */
export function collectFeesIx(programId, mint, destination) {
  const p = pdas(programId);
  const keys = [ro(p.pool), w(p.asset(mint)), w(p.vault(mint)), w(destination)];
  if (!mint.equals(SOL_MINT)) keys.push(ro(mint), ro(TOKEN_PROGRAM_ID));
  return ix(programId, keys, Buffer.from([8]));
}

export function listAssetIx(programId, admin, mint, minDeposit, maxDeposit, cap) {
  const p = pdas(programId);
  const isSol = mint.equals(SOL_MINT);
  return ix(programId, [
    w(admin, true), ro(p.pool), w(p.asset(mint)), ro(mint), w(p.vault(mint)),
    ro(isSol ? SystemProgram.programId : TOKEN_PROGRAM_ID), ro(SystemProgram.programId),
  ], Buffer.concat([Buffer.from([1]), u64(minDeposit), u64(maxDeposit), u64(cap)]));
}

export function setPausedIx(programId, admin, paused) {
  const p = pdas(programId);
  return ix(programId, [ro(admin, true), w(p.pool)], Buffer.from([3, paused ? 1 : 0]));
}

export function shieldIx(programId, depositor, mint, amount, publicKey, blinding, encryptedOutput, depositorToken) {
  const p = pdas(programId);
  const keys = [w(depositor, true), w(p.pool), w(p.asset(mint)), w(p.vault(mint)), ro(SystemProgram.programId)];
  if (!mint.equals(SOL_MINT)) keys.push(w(depositorToken), ro(mint), ro(TOKEN_PROGRAM_ID));
  return ix(programId, keys, Buffer.concat([
    Buffer.from([5]), u64(amount), field32(publicKey), field32(blinding), bytesWithLen(encryptedOutput),
  ]));
}

/**
 * proof: { a: [x,y], b: [x1,x0,y1,y0], c: [x,y], root, nullifiers[2], commitments[2] } (bigints)
 * value: null for a private transfer, else { mint, recipient, relayer }
 */
export function transactIx(programId, payer, proof, extAmount, fee, enc0, enc1, value) {
  const p = pdas(programId);
  const keys = [w(payer, true), w(p.pool), w(p.nullifier(proof.nullifiers[0])), w(p.nullifier(proof.nullifiers[1])), ro(SystemProgram.programId)];
  if (value) {
    keys.push(w(p.asset(value.mint)), w(p.vault(value.mint)), w(value.recipient), w(value.relayer));
    if (!value.mint.equals(SOL_MINT)) keys.push(ro(value.mint), ro(TOKEN_PROGRAM_ID));
  }
  return ix(programId, keys, Buffer.concat([
    Buffer.from([6]),
    ...proof.a.map(field32), ...proof.b.map(field32), ...proof.c.map(field32),
    field32(proof.root), ...proof.nullifiers.map(field32), ...proof.commitments.map(field32),
    i64(extAmount), u64(fee), bytesWithLen(enc0), bytesWithLen(enc1),
  ]));
}

export const computeBudget = (units = 400_000) => ComputeBudgetProgram.setComputeUnitLimit({ units });

// ---- reading state -------------------------------------------------------------

export async function readPool(connection, programId) {
  const info = await connection.getAccountInfo(pdas(programId).pool, "confirmed");
  const d = info.data;
  const nextIndex = Number(d.readBigUInt64LE(P_TREE + T_NEXT_INDEX));
  const slot = d.readUInt32LE(P_TREE + T_CURRENT_SLOT);
  const root = be(d.subarray(P_TREE + T_ROOTS + slot * 32, P_TREE + T_ROOTS + slot * 32 + 32));
  return {
    nextIndex, root, paused: d[48] === 1,
    feeBps: d.readUInt16LE(P_FEE_BPS), feeRecipient: new PublicKey(d.subarray(P_FEE_RECIPIENT, P_FEE_RECIPIENT + 32)),
  };
}

export async function readAsset(connection, programId, mint) {
  const info = await connection.getAccountInfo(pdas(programId).asset(mint), "confirmed");
  if (!info) return null;
  const d = info.data;
  return {
    mint: new PublicKey(d.subarray(8, 40)), enabled: d[72] === 1, decimals: d[73],
    maxDeposit: d.readBigUInt64LE(80), cap: d.readBigUInt64LE(88), balance: d.readBigUInt64LE(96), minDeposit: d.readBigUInt64LE(104),
    fees: d.readBigUInt64LE(112),
  };
}

const MAX_LEAVES = 2 ** LEVELS;

/**
 * Every call to the pool program in one transaction, in execution order:
 * each top-level instruction, then the calls it made (inner instructions).
 * Reads instruction data, not logs: Solana cuts logs off at about 10 KB, so
 * anyone could hide a log line, but instruction data is always complete.
 */
export function poolCalls(tx, programId) {
  const msg = tx.transaction.message;
  const keys = [
    ...msg.staticAccountKeys,
    ...(tx.meta.loadedAddresses?.writable ?? []).map((k) => new PublicKey(k)),
    ...(tx.meta.loadedAddresses?.readonly ?? []).map((k) => new PublicKey(k)),
  ];
  const inner = new Map((tx.meta.innerInstructions ?? []).map((g) => [g.index, g.instructions]));
  const calls = [];
  msg.compiledInstructions.forEach((ix, i) => {
    if (keys[ix.programIdIndex].equals(programId))
      calls.push({ data: Buffer.from(ix.data), accounts: ix.accountKeyIndexes.map((k) => keys[k]) });
    for (const sub of inner.get(i) ?? []) {
      if (keys[sub.programIdIndex].equals(programId))
        calls.push({ data: Buffer.from(bs58.decode(sub.data)), accounts: sub.accounts.map((k) => keys[k]) });
    }
  });
  return calls;
}

/** Orders signatures as the chain executed them: by slot, then block position. */
export async function inExecutionOrder(connection, sigs) {
  const bySlot = new Map();
  for (const s of sigs) bySlot.set(s.slot, [...(bySlot.get(s.slot) ?? []), s.signature]);
  const ordered = [];
  for (const slot of [...bySlot.keys()].sort((x, y) => x - y)) {
    const inSlot = bySlot.get(slot);
    if (inSlot.length > 1) {
      const block = await connection.getBlock(slot, { transactionDetails: "signatures", rewards: false, maxSupportedTransactionVersion: 0 });
      const position = new Map(block.signatures.map((sig, i) => [sig, i]));
      inSlot.sort((x, y) => position.get(x) - position.get(y));
    }
    ordered.push(...inSlot);
  }
  return ordered;
}

/** Reads every pool call, rebuilds the tree and checks it against the chain. */
export async function sync(connection, programId) {
  const pool = pdas(programId).pool;
  const sigs = [];
  let before;
  for (;;) {
    const page = await connection.getSignaturesForAddress(pool, { before, limit: 1000 }, "confirmed");
    if (!page.length) break;
    sigs.push(...page.filter((s) => !s.err));
    before = page.at(-1).signature;
    if (page.length < 1000) break;
  }

  const commitments = [];
  const spent = new Set();
  const assets = [];
  const mintOfAsset = new Map();
  let nextIndex = 0;
  const add = (commitment, encryptedOutput) => {
    commitments.push({ commitment, index: nextIndex, encryptedOutput: new Uint8Array(encryptedOutput) });
    nextIndex += 1;
  };

  for (const sig of await inExecutionOrder(connection, sigs)) {
    const tx = await connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (!tx || tx.meta.err) continue;
    for (const { data, accounts } of poolCalls(tx, programId)) {
      const tag = data[0];
      const r = data.subarray(1);
      if (tag === 1) {
        // list_asset: accounts [admin, pool, asset, mint, ...]
        const mint = accounts[3];
        mintOfAsset.set(accounts[2].toBase58(), mint);
        assets.push({ mint, assetId: assetIdOf(mint) });
      } else if (tag === 5) {
        // shield: amount u64, public_key, blinding, encrypted_output
        const assetKey = accounts[2].toBase58();
        if (!mintOfAsset.has(assetKey)) mintOfAsset.set(assetKey, (await readAssetAt(connection, accounts[2])).mint);
        const amount = r.readBigUInt64LE(0);
        const publicKey = be(r.subarray(8, 40));
        const blinding = be(r.subarray(40, 72));
        const len = r.readUInt16LE(72);
        const commitment = poseidon([amount, assetIdOf(mintOfAsset.get(assetKey)), publicKey, blinding]);
        add(commitment, r.subarray(74, 74 + len));
        add(zeroLeaf(), []);
      } else if (tag === 6) {
        // transact: proof(256) root(32) n0 n1 c0 c1 ext_amount fee enc0 enc1
        spent.add(be(r.subarray(288, 320)));
        spent.add(be(r.subarray(320, 352)));
        const c0 = be(r.subarray(352, 384));
        const c1 = be(r.subarray(384, 416));
        const len0 = r.readUInt16LE(432);
        const enc0 = r.subarray(434, 434 + len0);
        const len1 = r.readUInt16LE(434 + len0);
        const enc1 = r.subarray(436 + len0, 436 + len0 + len1);
        if (nextIndex + 2 > MAX_LEAVES) continue; // full tree: outputs dropped
        add(c0, enc0);
        add(c1, enc1);
      }
    }
  }

  const state = await readPool(connection, programId);
  if (state.nextIndex !== nextIndex) throw new Error(`rebuilt ${nextIndex} leaves, pool has ${state.nextIndex}`);
  const tree = new MerkleTree(commitments.map((c) => c.commitment), LEVELS);
  if (tree.root !== state.root) throw new Error(`local tree root ${hex32(tree.root)} != pool root ${hex32(state.root)}`);
  return { tree, commitments: commitments.filter((c) => c.encryptedOutput.length), spent, assets };
}

async function readAssetAt(connection, assetKey) {
  const info = await connection.getAccountInfo(assetKey, "confirmed");
  return { mint: new PublicKey(info.data.subarray(8, 40)) };
}

/**
 * A SOL payout to an account that does not exist yet must be at least the
 * rent minimum, or the transaction fails. Check before proving.
 */
export async function checkSolRecipient(connection, recipient, lamports) {
  const info = await connection.getAccountInfo(recipient, "confirmed");
  if (info) return;
  const floor = await connection.getMinimumBalanceForRentExemption(0);
  if (BigInt(lamports) < BigInt(floor))
    throw new Error(`a new address needs at least ${floor} lamports; send more or pick an existing address`);
}

/**
 * Proves a planned transaction. `value` is null for a private transfer,
 * else { mint, recipient, relayer } (token accounts for SPL, wallets for SOL).
 */
export async function proveTransaction({ plan, tree, mint, value, programId }) {
  const isTransfer = plan.extAmount === 0n && plan.fee === 0n;
  if (isTransfer !== !value) throw new Error("value accounts are needed exactly when value leaves the pool");
  const zero = PublicKey.default;
  const hash = extDataHash({
    programId,
    recipient: value?.recipient ?? zero, relayer: value?.relayer ?? zero, mint: value?.mint ?? zero,
    extAmount: plan.extAmount, fee: plan.fee, enc0: plan.encryptedOutputs[0], enc1: plan.encryptedOutputs[1],
  });
  const input = buildInput({
    tree, inputs: plan.inputs, outputs: plan.outputs, assetId: assetIdOf(mint),
    publicAmount: plan.extAmount - plan.fee, publicAssetId: isTransfer ? 0n : assetIdOf(mint), extDataHash: hash,
  });
  const started = Date.now();
  const { proof, publicSignals } = await prove(stringify(input));
  return {
    proveMs: Date.now() - started,
    proof: {
      a: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
      b: [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0]), BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
      c: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
      root: BigInt(publicSignals[0]),
      nullifiers: [BigInt(publicSignals[4]), BigInt(publicSignals[5])],
      commitments: [BigInt(publicSignals[6]), BigInt(publicSignals[7])],
    },
  };
}

export { Transaction };
