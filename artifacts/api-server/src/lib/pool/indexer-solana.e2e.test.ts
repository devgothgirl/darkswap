// What the indexer actually records for real pool actions on Solana. Public
// actions are run against a deployed program -- two shields, a withdrawal the
// user submits itself, a withdrawal a relayer submits for a fee, a private
// send, and, in an SPL token, a shield and a relayed withdrawal of its own --
// and every row the indexer wrote for them is checked against what the chain
// did: the kind, the asset, the external amount, the relayer fee and the time
// of the slot that carried it.
//
// This is the Solana counterpart of indexer-evm.e2e.test.ts, and the part
// indexer-solana.test.ts cannot reach: that one proves the amounts are read
// out of an instruction correctly, this one proves the instruction is found
// inside a confirmed transaction, placed in time, and recorded exactly once.
//
// A token takes a different path through the indexer than SOL does -- the
// vault is a token account and the decimals come off the mint -- so the token
// half is run against a real listed mint rather than reasoned about. It needs
// POOL_E2E_SOLANA_TEST_MINT (a mint the pool has listed) and
// POOL_E2E_SOLANA_TEST_MINT_HOLDER (a keypair file holding some of it);
// without them those tests are reported as skipped, not quietly passed.
//
// Needs a cluster with the pool program deployed and initialized, and a
// temporary postgres; see scripts/test-pool-indexer-solana.sh, which skips the
// whole run when no cluster is configured and creates the test mint itself
// when it starts a validator of its own.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test, { before } from "node:test";
import { fileURLToPath } from "node:url";
import {
  Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  fromServerState, initPoseidon, Keys, planShield, planTransaction, protocolFeeOn, scanNotes,
  setProverArtifacts, solana, unspent, type SolanaProof,
} from "@darkswap/pool-client";
import { db, poolActivityTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { findChain, rpcUrl, solanaProgramId, type SolanaChain } from "./config";
import { ensureFresh, readState } from "./indexer";

const here = path.dirname(fileURLToPath(import.meta.url));
const poolPackage = path.resolve(here, "../../../../../packages/darkswap-pool");
const keysDir = path.join(poolPackage, "keys-dev");

const SHIELD_ONE = 500_000_000n; // 0.5 SOL
const SHIELD_TWO = 250_000_000n; // 0.25 SOL
const SEND = 300_000_000n; // alice -> bob, privately
const SELF_WITHDRAW = 100_000_000n; // bob takes his own out
const RELAYED_WITHDRAW = 200_000_000n; // alice pays a relayer to take hers out
const RELAYER_FEE = 2_000_000n;
// The token amounts are in the mint's own base units; the test mint the
// deployer kit creates has 6 decimals, so these are 100, 50, 20 and 0.5 of it.
const TOKEN_FUNDING = 100_000_000n; // what alice is given to shield from
const TOKEN_SHIELD = 50_000_000n;
const TOKEN_WITHDRAW = 20_000_000n;
const TOKEN_RELAYER_FEE = 500_000n;

const chain = findChain("solana-devnet") as SolanaChain | undefined;
if (!chain) throw new Error("the Solana chain is not configured");
const programId = solanaProgramId(chain);
if (!programId) throw new Error("POOL_PROGRAM_ID_DEVNET is not set; run this through scripts/test-pool-indexer-solana.sh");
const connection = new Connection(rpcUrl(chain)!, "confirmed");

// A funded wallet to pay from. Without one the cluster must have a faucet (a
// local validator does; devnet's is rate limited, so the script passes a key).
const payerFile = process.env.POOL_E2E_SOLANA_PAYER;
const payer = payerFile
  ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(payerFile, "utf8")) as number[]))
  : null;

/** One action on the chain: its signature and the time of the slot that carried it. */
type Done = { sig: string; occurredAt: Date };
const done: Record<string, Done> = {};

const alicePublic = Keypair.generate(); // the public wallet that shields
const bobPublic = Keypair.generate(); // submits his own withdrawal
const relayer = Keypair.generate(); // submits for other people
const recipient = Keypair.generate().publicKey; // a fresh address money leaves to
const SOL_ID = () => solana.assetIdOf(solana.SOL_MINT);

// The SPL half of the run: a mint the pool has listed, and a wallet holding
// enough of it to give alice something to shield.
const tokenMint = process.env.POOL_E2E_SOLANA_TEST_MINT ? new PublicKey(process.env.POOL_E2E_SOLANA_TEST_MINT) : null;
const tokenHolderFile = process.env.POOL_E2E_SOLANA_TEST_MINT_HOLDER;
const skipToken = tokenMint && tokenHolderFile
  ? false
  : "no test SPL mint: set POOL_E2E_SOLANA_TEST_MINT and POOL_E2E_SOLANA_TEST_MINT_HOLDER, or run this through scripts/test-pool-indexer-solana.sh";

let alice: Keys;
let bob: Keys;
let lastSync = 0;
let rowsBefore: number;
let aliceTokens: PublicKey; // the token account alice shields from
let tokenPayout: PublicKey; // where a token withdrawal lands
let relayerTokens: PublicKey; // where the relayer's token fee lands

async function fund(to: PublicKey, lamports: bigint) {
  if (payer) {
    const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: to, lamports }));
    await sendAndConfirmTransaction(connection, tx, [payer], { commitment: "confirmed" });
    return;
  }
  const sig = await connection.requestAirdrop(to, Number(lamports));
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature: sig, ...latest }, "confirmed");
}

/**
 * Sends one pool instruction and reads back the slot time the chain gave it.
 * A cluster confirms a signature a moment before it will serve the
 * transaction behind it, and fills in the slot's time later still, so this
 * waits for both rather than reading once -- a transaction that is not there
 * yet is not a transaction that failed.
 */
async function send(signers: Keypair[], ix: TransactionInstruction): Promise<Done> {
  const tx = new Transaction().add(solana.computeBudget(), ix);
  const sig = await sendAndConfirmTransaction(connection, tx, signers, { commitment: "confirmed" });
  const deadline = Date.now() + 60_000;
  for (;;) {
    const confirmed = await connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    assert.ok(!confirmed?.meta?.err, `the transaction failed: ${sig} (${JSON.stringify(confirmed?.meta?.err)})`);
    if (confirmed?.blockTime) return { sig, occurredAt: new Date(confirmed.blockTime * 1000) };
    assert.ok(
      Date.now() < deadline,
      `the cluster confirmed ${sig} but did not serve ${confirmed ? "the time of its slot" : "the transaction"} within a minute`,
    );
    await new Promise((r) => setTimeout(r, 500));
  }
}

/**
 * Syncs the indexer and reads back the record a wallet would plan from. The
 * indexer refuses to sync again for a few seconds, so this waits that out
 * rather than planning a transaction against a stale tree.
 */
async function sync() {
  const wait = 8_500 - (Date.now() - lastSync);
  if (lastSync && wait > 0) await new Promise((r) => setTimeout(r, wait));
  await ensureFresh(chain!);
  lastSync = Date.now();
  const raw = await readState(chain!, 0);
  const onchain = await solana.readPool(connection, programId!);
  const state = fromServerState(raw);
  assert.equal(state.tree.root, onchain.root, "the indexed tree matches the pool's own root");
  return { raw, state };
}

async function notesOf(keys: Keys) {
  const { raw, state } = await sync();
  return { state, notes: scanNotes(state.commitments, keys, raw.assets.map((a) => BigInt(a.assetId))) };
}

const transact = (
  from: Keypair, proof: SolanaProof, extAmount: bigint, fee: bigint, encs: [Uint8Array, Uint8Array],
  value: { mint: PublicKey; recipient: PublicKey; relayer: PublicKey } | null,
) => send([from], solana.transactIx(programId!, from.publicKey, proof, extAmount, fee, encs[0], encs[1], value));

// ---- the SPL token side ----------------------------------------------------

// The token helpers come from the pool kit, which already depends on them:
// the server does not take an SPL library of its own on for a test. They are
// loaded out of that package's node_modules, so the instructions they build
// carry its copy of @solana/web3.js; `asIx` rebuilds each one with the copy
// this test sends with rather than mixing two copies of the same classes
// into one transaction.
type Pubkeyish = { toBase58(): string };
type Ixish = { programId: Pubkeyish; keys: Array<{ pubkey: Pubkeyish; isSigner: boolean; isWritable: boolean }>; data: Uint8Array };
type SplToken = {
  getAssociatedTokenAddressSync(mint: Pubkeyish, owner: Pubkeyish): Pubkeyish;
  createAssociatedTokenAccountInstruction(payer: Pubkeyish, account: Pubkeyish, owner: Pubkeyish, mint: Pubkeyish): Ixish;
  createTransferCheckedInstruction(
    source: Pubkeyish, mint: Pubkeyish, destination: Pubkeyish, owner: Pubkeyish, amount: bigint, decimals: number,
  ): Ixish;
};
const splToken = () => createRequire(path.join(poolPackage, "package.json"))("@solana/spl-token") as SplToken;
const asKey = (k: Pubkeyish) => new PublicKey(k.toBase58());
const asIx = (i: Ixish) => new TransactionInstruction({
  programId: asKey(i.programId),
  keys: i.keys.map((k) => ({ pubkey: asKey(k.pubkey), isSigner: k.isSigner, isWritable: k.isWritable })),
  data: Buffer.from(i.data),
});

/**
 * Opens the token accounts the run needs and gives alice something to shield.
 * A token payout goes to a token account, not a wallet, so the payout and the
 * relayer's fee account have to exist before the pool can pay into them.
 */
async function setUpTokens(mint: PublicKey, holderFile: string) {
  const asset = await solana.readAsset(connection, programId!, mint);
  assert.ok(asset, `the pool has not listed ${mint.toBase58()}; list it first (scripts/devnet-setup.mjs --test-token)`);
  assert.ok(asset.enabled, "deposits in the test token are paused on this pool, so nothing can be shielded");
  assert.ok(
    asset.minDeposit <= TOKEN_SHIELD && asset.maxDeposit >= TOKEN_SHIELD,
    `this test shields ${TOKEN_SHIELD} of the token, outside the pool's ${asset.minDeposit}..${asset.maxDeposit}`,
  );

  const spl = splToken();
  const holder = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(holderFile, "utf8")) as number[]));
  const accountOf = (owner: PublicKey) => asKey(spl.getAssociatedTokenAddressSync(mint, owner));
  const payoutOwner = Keypair.generate().publicKey;
  aliceTokens = accountOf(alicePublic.publicKey);
  tokenPayout = accountOf(payoutOwner);
  relayerTokens = accountOf(relayer.publicKey);

  const tx = new Transaction().add(
    asIx(spl.createAssociatedTokenAccountInstruction(alicePublic.publicKey, aliceTokens, alicePublic.publicKey, mint)),
    asIx(spl.createAssociatedTokenAccountInstruction(relayer.publicKey, tokenPayout, payoutOwner, mint)),
    asIx(spl.createAssociatedTokenAccountInstruction(relayer.publicKey, relayerTokens, relayer.publicKey, mint)),
    asIx(spl.createTransferCheckedInstruction(
      accountOf(holder.publicKey), mint, aliceTokens, holder.publicKey, TOKEN_FUNDING, asset.decimals,
    )),
  );
  await sendAndConfirmTransaction(connection, tx, [alicePublic, relayer, holder], { commitment: "confirmed" });
  assert.equal(
    (await connection.getTokenAccountBalance(aliceTokens)).value.amount, TOKEN_FUNDING.toString(),
    `the holder ${holder.publicKey.toBase58()} did not have ${TOKEN_FUNDING} of ${mint.toBase58()} to give`,
  );
}

before(async () => {
  await initPoseidon();
  setProverArtifacts({ wasm: path.join(keysDir, "transaction2.wasm"), zkey: path.join(keysDir, "transaction2.zkey") });
  alice = Keys.random();
  bob = Keys.random();

  // The pool has to be deployed, initialized and have SOL listed: this test
  // runs real actions, it does not set a pool up.
  const sol = await solana.readAsset(connection, programId!, solana.SOL_MINT);
  assert.ok(sol, `the pool at ${programId!.toBase58()} has not listed SOL; initialize it first (scripts/devnet-setup.mjs)`);
  assert.ok(sol.enabled, "deposits are paused on this pool, so nothing can be shielded");
  assert.ok(
    sol.minDeposit <= SHIELD_TWO && sol.maxDeposit >= SHIELD_ONE,
    `this test shields ${SHIELD_TWO} and ${SHIELD_ONE} lamports, outside the pool's ${sol.minDeposit}..${sol.maxDeposit}`,
  );

  // Enough for the deposits, the protocol fee on top of each, the network
  // fees, and the rent on the token accounts the SPL half opens.
  await fund(alicePublic.publicKey, 2n * BigInt(LAMPORTS_PER_SOL));
  await fund(bobPublic.publicKey, BigInt(LAMPORTS_PER_SOL) / 10n);
  await fund(relayer.publicKey, BigInt(LAMPORTS_PER_SOL) / 5n);
  if (tokenMint && tokenHolderFile) await setUpTokens(tokenMint, tokenHolderFile);

  // A pool that has been used before brings its whole history with it on the
  // first sync, and that history is not this test's business: it is indexed
  // first, and only what the actions below add to the record is checked.
  await sync();
  rowsBefore = (await recorded()).length;

  // 1. Alice shields twice from her public wallet.
  const shield = (depositNumber: number, amount: bigint) => {
    const s = planShield({ keys: alice, amount, depositNumber });
    return send([alicePublic], solana.shieldIx(
      programId!, alicePublic.publicKey, solana.SOL_MINT, amount, s.publicKey, s.blinding, s.encryptedOutput,
    ));
  };
  done.shieldOne = await shield(0, SHIELD_ONE);
  done.shieldTwo = await shield(1, SHIELD_TWO);

  // 1b. And shields the SPL token, which the pool takes into a token vault of
  //     its own rather than the SOL one.
  if (tokenMint) {
    const s = planShield({ keys: alice, amount: TOKEN_SHIELD, depositNumber: 2 });
    done.shieldToken = await send([alicePublic], solana.shieldIx(
      programId!, alicePublic.publicKey, tokenMint, TOKEN_SHIELD, s.publicKey, s.blinding, s.encryptedOutput, aliceTokens,
    ));
  }

  // 2. Alice sends part of it to Bob privately. A send moves nothing in or out
  //    of the pool and names no asset; a relayer submits it, free of charge.
  {
    const { state, notes } = await notesOf(alice);
    const plan = planTransaction({
      kind: "send", keys: alice, notes: unspent(notes, state.spent, SOL_ID()), assetId: SOL_ID(), amount: SEND, to: bob.address,
    });
    assert.equal(plan.extAmount, 0n, "a private send has no external amount");
    const { proof } = await solana.proveTransaction({ plan, tree: state.tree, mint: solana.SOL_MINT, value: null, programId: programId! });
    done.send = await transact(relayer, proof, 0n, 0n, plan.encryptedOutputs, null);
  }

  // 3. Bob takes some of it out himself, paying no relayer.
  {
    const { state, notes } = await notesOf(bob);
    const bobNotes = unspent(notes, state.spent, SOL_ID());
    assert.equal(bobNotes.length, 1, "bob received the private send");
    assert.equal(bobNotes[0].amount, SEND);
    const plan = planTransaction({ kind: "unshield", keys: bob, notes: bobNotes, assetId: SOL_ID(), amount: SELF_WITHDRAW });
    assert.equal(plan.fee, 0n, "a self-submitted withdrawal pays no relayer");
    const value = { mint: solana.SOL_MINT, recipient, relayer: bobPublic.publicKey };
    await solana.checkSolRecipient(connection, recipient, SELF_WITHDRAW);
    const { proof } = await solana.proveTransaction({ plan, tree: state.tree, mint: solana.SOL_MINT, value, programId: programId! });
    done.selfWithdraw = await transact(bobPublic, proof, plan.extAmount, plan.fee, plan.encryptedOutputs, value);
  }

  // 4. Alice takes hers out through a relayer, which is paid out of the
  //    withdrawal itself.
  {
    const { state, notes } = await notesOf(alice);
    const plan = planTransaction({
      kind: "unshield", keys: alice, notes: unspent(notes, state.spent, SOL_ID()), assetId: SOL_ID(),
      amount: RELAYED_WITHDRAW, fee: RELAYER_FEE,
    });
    const value = { mint: solana.SOL_MINT, recipient, relayer: relayer.publicKey };
    const { proof } = await solana.proveTransaction({ plan, tree: state.tree, mint: solana.SOL_MINT, value, programId: programId! });
    done.relayedWithdraw = await transact(relayer, proof, plan.extAmount, plan.fee, plan.encryptedOutputs, value);
  }

  // 5. Alice takes part of the token out through a relayer too. The payout
  //    and the relayer's fee leave the token vault into token accounts.
  if (tokenMint) {
    const { state, notes } = await notesOf(alice);
    const assetId = solana.assetIdOf(tokenMint);
    const plan = planTransaction({
      kind: "unshield", keys: alice, notes: unspent(notes, state.spent, assetId), assetId,
      amount: TOKEN_WITHDRAW, fee: TOKEN_RELAYER_FEE,
    });
    const value = { mint: tokenMint, recipient: tokenPayout, relayer: relayerTokens };
    const { proof } = await solana.proveTransaction({ plan, tree: state.tree, mint: tokenMint, value, programId: programId! });
    done.tokenWithdraw = await transact(relayer, proof, plan.extAmount, plan.fee, plan.encryptedOutputs, value);
  }

  await sync();
});

/** Every activity row for this chain, this run's and any the pool already had. */
async function recorded() {
  return await db.select().from(poolActivityTable).where(eq(poolActivityTable.chain, chain!.id));
}

type Row = Awaited<ReturnType<typeof recorded>>[number];

/** The one row for an action. A second row for the same call is a double count. */
function rowFor(rows: Row[], action: Done, what: string) {
  const found = rows.filter((r) => r.tx === action.sig);
  assert.equal(found.length, 1, `${what} is in the record exactly once (${found.length} rows for ${action.sig})`);
  return found[0];
}

const SOL = solana.SOL_MINT.toBase58();

test("a shield is recorded with the amount the chain published", async () => {
  const rows = await recorded();
  for (const [name, amount] of [["shieldOne", SHIELD_ONE], ["shieldTwo", SHIELD_TWO]] as const) {
    const row = rowFor(rows, done[name], `the ${name} deposit`);
    assert.equal(row.kind, "shield");
    assert.equal(row.token, SOL, "a shield names the asset, so the month can be priced per token");
    // The amount credited to the note, not the protocol fee the depositor paid on top.
    assert.equal(row.amount, amount.toString());
    assert.equal(row.relayerFee, "0");
    assert.equal(row.occurredAt.getTime(), done[name].occurredAt.getTime(), "the slot's time is what the record holds");
  }
});

test("a token shield is recorded against its own mint", { skip: skipToken }, async () => {
  const row = rowFor(await recorded(), done.shieldToken, "the token deposit");
  assert.equal(row.kind, "shield");
  // The asset of a token shield is read from a different account of the
  // instruction than SOL's, and a month of token volume is priced from it.
  assert.equal(row.token, tokenMint!.toBase58(), "a token shield names the mint it went into");
  assert.equal(row.amount, TOKEN_SHIELD.toString());
  assert.equal(row.relayerFee, "0");
  assert.equal(row.occurredAt.getTime(), done.shieldToken.occurredAt.getTime(), "the slot's time is what the record holds");
});

test("the listed token is indexed with the decimals of its own mint", { skip: skipToken }, async () => {
  const raw = await readState(chain!, 0);
  const asset = raw.assets.find((a) => a.token === tokenMint!.toBase58());
  assert.ok(asset, "the listed token is part of the indexed state");
  const { decimals } = (await connection.getTokenSupply(tokenMint!)).value;
  assert.equal(asset.decimals, decimals, "the mint's decimals are read, not assumed");
  assert.equal(asset.assetId, solana.assetIdOf(tokenMint!).toString());
});

test("a relayed token withdrawal records the mint, the amount and the fee", { skip: skipToken }, async () => {
  const row = rowFor(await recorded(), done.tokenWithdraw, "the relayed token withdrawal");
  assert.equal(row.kind, "unshield");
  assert.equal(row.token, tokenMint!.toBase58());
  assert.equal(row.amount, TOKEN_WITHDRAW.toString(), "the amount is recorded unsigned");
  assert.equal(row.relayerFee, TOKEN_RELAYER_FEE.toString());
  assert.equal(row.occurredAt.getTime(), done.tokenWithdraw.occurredAt.getTime());
  // And the tokens the row describes did move: the payout less the protocol
  // fee to the recipient, the relayer's fee to the relayer, both in the token
  // rather than in SOL.
  const { feeBps } = await solana.readPool(connection, programId!);
  assert.equal(
    (await connection.getTokenAccountBalance(tokenPayout)).value.amount,
    (TOKEN_WITHDRAW - protocolFeeOn(TOKEN_WITHDRAW, feeBps)).toString(),
  );
  assert.equal((await connection.getTokenAccountBalance(relayerTokens)).value.amount, TOKEN_RELAYER_FEE.toString());
});

test("a withdrawal the user submits itself is recorded as leaving the pool, with no relayer fee", async () => {
  const row = rowFor(await recorded(), done.selfWithdraw, "the self-submitted withdrawal");
  assert.equal(row.kind, "unshield", "a negative external amount is money leaving the pool");
  assert.equal(row.token, SOL);
  assert.equal(row.amount, SELF_WITHDRAW.toString(), "the amount is recorded unsigned");
  assert.equal(row.relayerFee, "0");
  assert.equal(row.occurredAt.getTime(), done.selfWithdraw.occurredAt.getTime());
});

test("a relayed withdrawal keeps the fee the sender paid apart from the amount", async () => {
  const row = rowFor(await recorded(), done.relayedWithdraw, "the relayed withdrawal");
  assert.equal(row.kind, "unshield");
  assert.equal(row.token, SOL);
  // The fee comes out of the same notes but is not part of the withdrawal:
  // the month's relayed share is read back out of it.
  assert.equal(row.amount, RELAYED_WITHDRAW.toString());
  assert.equal(row.relayerFee, RELAYER_FEE.toString());
  assert.equal(row.occurredAt.getTime(), done.relayedWithdraw.occurredAt.getTime());
});

test("a private send is recorded as moving nothing in or out, and names no asset", async () => {
  const row = rowFor(await recorded(), done.send, "the private send");
  assert.equal(row.kind, "send");
  assert.equal(row.token, "", "the asset of a private send is not public, and is not guessed");
  assert.equal(row.amount, "0");
  assert.equal(row.relayerFee, "0");
  assert.equal(row.occurredAt.getTime(), done.send.occurredAt.getTime());
});

test("every action this run made added one row to the month, and nothing it could not read", async () => {
  const rows = await recorded();
  const mine: Array<[Done, string, string]> = [
    [done.shieldOne, "the first shield", "shield"], [done.shieldTwo, "the second shield", "shield"],
    [done.send, "the private send", "send"], [done.selfWithdraw, "the self-submitted withdrawal", "unshield"],
    [done.relayedWithdraw, "the relayed withdrawal", "unshield"],
    ...(skipToken
      ? []
      : [
        [done.shieldToken, "the token shield", "shield"] as [Done, string, string],
        [done.tokenWithdraw, "the relayed token withdrawal", "unshield"] as [Done, string, string],
      ]),
  ];
  const ours = mine.map(([action, what]) => rowFor(rows, action, what));
  assert.deepEqual(ours.map((r) => r.kind).sort(), mine.map(([, , kind]) => kind).sort());
  assert.equal(ours.filter((r) => r.kind === "unreadable").length, 0);
  // One row per action on top of whatever the pool already had. A pool
  // someone else is using at the same time would show their actions too, so
  // this counts rows, not the signatures above, which are checked one by one.
  assert.equal(
    rows.length - rowsBefore, mine.length,
    `${mine.length} actions were run; the record grew by ${rows.length - rowsBefore}`,
  );
});

test("syncing again changes nothing: the same actions, recorded once", async () => {
  const key = (r: Row) => `${r.tx}:${r.position}`;
  const first = new Map((await recorded()).map((r) => [key(r), r]));
  await sync();
  const second = await recorded();
  assert.equal(second.length, first.size);
  for (const row of second) assert.deepEqual(row, first.get(key(row)));
});

test.after(async () => {
  const { pool: pg } = await import("@workspace/db");
  await pg.end();
  // snarkjs leaves its proving threads running; without this the process
  // never exits and the run is reported as hung rather than passed.
  await (globalThis as { curve_bn128?: { terminate(): Promise<void> } }).curve_bn128?.terminate();
});
