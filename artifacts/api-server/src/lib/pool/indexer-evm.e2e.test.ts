// What the indexer actually records for real pool actions. Four public
// actions are run against a freshly deployed local anvil pool -- a shield, a
// withdrawal the user submits itself, a withdrawal a relayer submits for a
// fee, and a private send -- and every row the indexer wrote for them is
// checked against what the chain did: the kind, the asset, the external
// amount, the relayer fee and the time of the block.
//
// The protocol's own earnings are checked the same way. Each action's
// pool_fees row is compared with the fee the pool charged for it, and the
// total recorded per asset with the balance the pool is actually holding in
// protocolFees(token), so a missed or double-counted fee fails. The fee rate
// is changed twice during the run, so a record that priced every action at
// the rate in force at the end could not pass.
//
// This is the step the monthly volume export depends on and that
// volumes.db.test.ts cannot see: that test starts from rows in the table,
// this one proves the rows describe the chain. Needs anvil, forge and a
// temporary postgres; see scripts/test-pool-indexer-evm.sh.
import assert from "node:assert/strict";
import path from "node:path";
import test, { before } from "node:test";
import { fileURLToPath } from "node:url";
import {
  createPublicClient, createWalletClient, getAddress, http, parseAbi, parseEther, parseUnits, toHex,
  type Hex, type PublicClient, type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import {
  evm, fromServerState, initPoseidon, Keys, planShield, planTransaction, protocolFeeOn, scanNotes,
  setProverArtifacts, unspent, type EvmExt, type EvmProof,
} from "@darkswap/pool-client";
import { db, poolActivityTable, poolFeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { evmDeployment, findChain, rpcUrl, type EvmChain } from "./config";
import { ensureFresh, readState } from "./indexer";

const here = path.dirname(fileURLToPath(import.meta.url));
const keysDir = path.resolve(here, "../../../../../packages/darkswap-pool/keys-dev");

// anvil's well-known test keys: #0 deployed the pool and holds the test
// token, #1 is the public wallet that shields, #2 plays the relayer, and #3
// submits one withdrawal for itself.
const DEPLOYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const ALICE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const RELAYER_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
const BOB_KEY = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6";

const SHIELD_ETH = parseEther("0.05");
const SEND_ETH = parseEther("0.02");
const SELF_WITHDRAW_ETH = parseEther("0.01");
const RELAYED_WITHDRAW_ETH = parseEther("0.02");
const RELAYER_FEE_ETH = parseEther("0.0005");
const SHIELD_TOKEN = parseUnits("250", 6);

// The two rates the owner moves the pool to part way through the run. Both
// differ from the rate it was deployed with (and from each other), so the
// fee on every action can only be right if it was read at the time: a record
// that priced the whole run at the closing rate gets different numbers.
const MID_RUN_BPS = 100n; // the contract's MAX_PROTOCOL_FEE_BPS
const CLOSING_BPS = 25n;

const erc20 = parseAbi([
  "function approve(address, uint256) returns (bool)",
  "function transfer(address, uint256) returns (bool)",
]);
// Not part of the wallet's ABI: only the owner ever changes the fee rate.
const ownerAbi = parseAbi(["function setProtocolFee(uint16)"]);

const chain = findChain("anvil") as EvmChain | undefined;
if (!chain) throw new Error("the local anvil chain is not configured; run this through scripts/test-pool-indexer-evm.sh");
const dep = evmDeployment(chain);
if (!dep) throw new Error("no deployment file for chain 31337; run this through scripts/test-pool-indexer-evm.sh");
const url = rpcUrl(chain)!;
const pool = getAddress(dep.pool);
const ETH = getAddress(evm.ETH);
const token = getAddress(dep.token!);

const pub = createPublicClient({ chain: foundry, transport: http(url) }) as PublicClient;
const walletOf = (key: Hex) => createWalletClient({ account: privateKeyToAccount(key), chain: foundry, transport: http(url) });
const alicePublic = walletOf(ALICE_KEY);
const relayerPublic = walletOf(RELAYER_KEY);
const bobPublic = walletOf(BOB_KEY);
const deployer = walletOf(DEPLOYER_KEY);

/** One action on the chain: its transaction and the block that carried it. */
type Done = { tx: Hex; occurredAt: Date };
const done: Record<string, Done> = {};

/**
 * What the pool charged itself for each action, at the rate in force when
 * the action was mined -- not the rate the run ends on.
 */
const charged: Record<string, { token: Hex; kind: string; amount: bigint }> = {};

// Both wallets are made once the hash is ready, in before().
let alice: Keys;
let bob: Keys;
const ETH_ID = evm.assetIdOf(ETH);
const TOKEN_ID = evm.assetIdOf(token);
let lastSync = 0;

async function send(client: WalletClient, args: Record<string, unknown>): Promise<Done> {
  const hash = await client.writeContract({
    address: pool, abi: evm.poolAbi, chain: null, account: client.account!, ...args,
  } as Parameters<WalletClient["writeContract"]>[0]);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success", `${String(args.functionName)} failed`);
  const block = await pub.getBlock({ blockNumber: receipt.blockNumber });
  return { tx: hash, occurredAt: new Date(Number(block.timestamp) * 1000) };
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
  const onchain = await pub.readContract({ address: pool, abi: evm.poolAbi, functionName: "root" }) as bigint;
  const state = fromServerState(raw);
  assert.equal(state.tree.root, onchain, "the indexed tree matches the pool's own root");
  return { raw, state };
}

async function notesOf(keys: Keys) {
  const { raw, state } = await sync();
  return { state, notes: scanNotes(state.commitments, keys, raw.assets.map((a) => BigInt(a.assetId))) };
}

const submit = (client: WalletClient, proved: { proof: EvmProof; ext: EvmExt }) =>
  send(client, { functionName: "transact", args: [proved.proof, proved.ext] });

/** The protocol fee rate the pool is charging right now. */
const feeRate = async () =>
  BigInt(await pub.readContract({ address: pool, abi: evm.poolAbi, functionName: "protocolFeeBps" }) as number);

/** Moves the pool to a new fee rate, as its owner, before the next action. */
async function setFeeRate(bps: bigint) {
  await send(deployer, { abi: ownerAbi, functionName: "setProtocolFee", args: [Number(bps)] });
  assert.equal(await feeRate(), bps, "the pool moved to the new fee rate");
}

/** What the pool is still holding of an asset's fees, having swept none. */
const feesHeld = (asset: Hex) =>
  pub.readContract({ address: pool, abi: evm.poolAbi, functionName: "protocolFees", args: [asset] }) as Promise<bigint>;

before(async () => {
  await initPoseidon();
  setProverArtifacts({ wasm: path.join(keysDir, "transaction2.wasm"), zkey: path.join(keysDir, "transaction2.zkey") });
  alice = Keys.random();
  bob = Keys.random();
  const deployedBps = await feeRate();
  assert.ok(
    deployedBps > 0n && deployedBps !== MID_RUN_BPS && deployedBps !== CLOSING_BPS,
    `this run needs three different fee rates; the pool was deployed charging ${deployedBps} bps`,
  );

  // 1. Alice shields ETH, and the test token, from her public wallet. The
  //    depositor pays the protocol fee on top of the amount.
  const shield = async (keys: Keys, depositNumber: number, asset: Hex, amount: bigint, bps: bigint) => {
    const s = planShield({ keys, amount, depositNumber });
    const act = await send(alicePublic, {
      functionName: "shield",
      args: [asset, amount, s.publicKey, s.blinding, toHex(s.encryptedOutput)],
      value: asset === ETH ? amount + protocolFeeOn(amount, bps) : 0n,
    });
    return { act, fee: { token: asset, kind: "shield", amount: protocolFeeOn(amount, bps) } };
  };
  {
    const { act, fee } = await shield(alice, 0, ETH, SHIELD_ETH, deployedBps);
    done.shieldEth = act;
    charged.shieldEth = fee;
  }

  // The owner raises the fee here, so the rest of the run is charged at a
  // different rate than the ETH shield above.
  await setFeeRate(MID_RUN_BPS);

  // The pool pulls the amount plus the protocol fee, so she holds more than she shields.
  await send(deployer, { address: token, abi: erc20, functionName: "transfer", args: [alicePublic.account.address, SHIELD_TOKEN * 2n] });
  await send(alicePublic, { address: token, abi: erc20, functionName: "approve", args: [pool, SHIELD_TOKEN * 2n] });
  {
    const { act, fee } = await shield(alice, 1, token, SHIELD_TOKEN, MID_RUN_BPS);
    done.shieldToken = act;
    charged.shieldToken = fee;
  }

  // 2. Alice sends part of it to Bob privately. A send moves nothing in or out
  //    of the pool and names no asset; a relayer submits it, free of charge.
  {
    const { state, notes } = await notesOf(alice);
    const plan = planTransaction({ kind: "send", keys: alice, notes: unspent(notes, state.spent, ETH_ID), assetId: ETH_ID, amount: SEND_ETH, to: bob.address });
    const proved = await evm.proveTransaction({ plan, tree: state.tree, token: ETH, chainId: chain!.chainId, pool });
    assert.equal(proved.ext.extAmount, 0n, "a private send has no external amount");
    done.send = await submit(relayerPublic, proved);
  }

  // 3 and 4. Two withdrawals of the same ETH: Bob's, which he submits himself
  //    for no fee, and Alice's, which a relayer submits and is paid for out of
  //    the withdrawal. Both are planned from the same record and proved
  //    together -- proving is nearly all of this test's running time, and the
  //    pool accepts a proof against any root in its recent history.
  {
    const { raw, state } = await sync();
    const assetIds = raw.assets.map((a) => BigInt(a.assetId));
    const bobNotes = unspent(scanNotes(state.commitments, bob, assetIds), state.spent, ETH_ID);
    assert.equal(bobNotes.length, 1, "bob received the private send");
    assert.equal(bobNotes[0].amount, SEND_ETH);
    const aliceNotes = unspent(scanNotes(state.commitments, alice, assetIds), state.spent, ETH_ID);

    const bobPlan = planTransaction({ kind: "unshield", keys: bob, notes: bobNotes, assetId: ETH_ID, amount: SELF_WITHDRAW_ETH });
    const alicePlan = planTransaction({
      kind: "unshield", keys: alice, notes: aliceNotes, assetId: ETH_ID,
      amount: RELAYED_WITHDRAW_ETH, fee: RELAYER_FEE_ETH,
    });
    const [bobProved, aliceProved] = await Promise.all([
      evm.proveTransaction({ plan: bobPlan, tree: state.tree, token: ETH, recipient: bobPublic.account.address, chainId: chain!.chainId, pool }),
      evm.proveTransaction({
        plan: alicePlan, tree: state.tree, token: ETH, recipient: privateKeyToAccount(`0x${"11".repeat(32)}`).address,
        relayer: relayerPublic.account.address, chainId: chain!.chainId, pool,
      }),
    ]);
    assert.equal(bobProved.ext.fee, 0n, "a self-submitted withdrawal pays no relayer");
    done.selfWithdraw = await submit(bobPublic, bobProved);
    charged.selfWithdraw = { token: ETH, kind: "unshield", amount: protocolFeeOn(SELF_WITHDRAW_ETH, MID_RUN_BPS) };

    // The rate moves again between the two withdrawals. Neither proof covers
    // the protocol fee -- the pool takes it out of the payout -- so the
    // second one is still valid, and is charged at the new rate.
    await setFeeRate(CLOSING_BPS);
    done.relayedWithdraw = await submit(relayerPublic, aliceProved);
    charged.relayedWithdraw = { token: ETH, kind: "unshield", amount: protocolFeeOn(RELAYED_WITHDRAW_ETH, CLOSING_BPS) };
  }

  await sync();
});

/** Every activity row for this chain, keyed by transaction. */
async function recorded() {
  const rows = await db.select().from(poolActivityTable).where(eq(poolActivityTable.chain, chain!.id));
  return new Map(rows.map((r) => [r.tx.toLowerCase(), r]));
}

/**
 * Every protocol-fee row for this chain: the earnings the comparison and the
 * monthly export read. Grouped by transaction, in the order they were charged.
 */
async function earnings() {
  const rows = await db.select().from(poolFeesTable).where(eq(poolFeesTable.chain, chain!.id));
  const byTx = new Map<string, typeof rows>();
  for (const row of rows.sort((a, b) => a.position - b.position)) {
    byTx.set(row.tx.toLowerCase(), [...(byTx.get(row.tx.toLowerCase()) ?? []), row]);
  }
  return { rows, byTx };
}

/** The one fee row an action was charged, named for the failure message. */
async function feeOf(action: string) {
  const rows = (await earnings()).byTx.get(done[action].tx.toLowerCase()) ?? [];
  assert.equal(rows.length, 1, `${action} charged exactly one protocol fee, got ${rows.length}`);
  return rows[0];
}

test("a shield is recorded with the amount and asset the chain published", async () => {
  const rows = await recorded();
  const eth = rows.get(done.shieldEth.tx.toLowerCase());
  assert.ok(eth, "the ETH shield is in the record");
  assert.equal(eth.kind, "shield");
  assert.equal(eth.token, ETH);
  // The amount credited to the note, not the protocol fee the depositor paid on top.
  assert.equal(eth.amount, SHIELD_ETH.toString());
  assert.equal(eth.relayerFee, "0");
  assert.equal(eth.occurredAt.getTime(), done.shieldEth.occurredAt.getTime());

  const tok = rows.get(done.shieldToken.tx.toLowerCase());
  assert.ok(tok, "the token shield is in the record");
  assert.equal(tok.kind, "shield");
  assert.equal(tok.token, token, "a shield names the asset, so the month can be priced per token");
  assert.equal(tok.amount, SHIELD_TOKEN.toString());
  assert.equal(tok.relayerFee, "0");
  assert.equal(tok.occurredAt.getTime(), done.shieldToken.occurredAt.getTime());
});

test("a withdrawal the user submits itself is recorded as leaving the pool, with no relayer fee", async () => {
  const row = (await recorded()).get(done.selfWithdraw.tx.toLowerCase());
  assert.ok(row, "the self-submitted withdrawal is in the record");
  assert.equal(row.kind, "unshield", "a negative external amount is money leaving the pool");
  assert.equal(row.token, ETH);
  assert.equal(row.amount, SELF_WITHDRAW_ETH.toString(), "the amount is recorded unsigned");
  assert.equal(row.relayerFee, "0");
  assert.equal(row.occurredAt.getTime(), done.selfWithdraw.occurredAt.getTime());
});

test("a relayed withdrawal keeps the fee the sender paid apart from the amount", async () => {
  const row = (await recorded()).get(done.relayedWithdraw.tx.toLowerCase());
  assert.ok(row, "the relayed withdrawal is in the record");
  assert.equal(row.kind, "unshield");
  assert.equal(row.token, ETH);
  // The fee comes out of the same notes but is not part of the withdrawal:
  // the month's relayed share and gas price are read back out of it.
  assert.equal(row.amount, RELAYED_WITHDRAW_ETH.toString());
  assert.equal(row.relayerFee, RELAYER_FEE_ETH.toString());
  assert.equal(row.occurredAt.getTime(), done.relayedWithdraw.occurredAt.getTime());
});

test("a private send is recorded as moving nothing in or out, and names no asset", async () => {
  const row = (await recorded()).get(done.send.tx.toLowerCase());
  assert.ok(row, "the private send is in the record");
  assert.equal(row.kind, "send");
  assert.equal(row.token, "", "the asset of a private send is not public, and is not guessed");
  assert.equal(row.amount, "0");
  assert.equal(row.relayerFee, "0");
  assert.equal(row.occurredAt.getTime(), done.send.occurredAt.getTime());
});

test("each shield's protocol fee is recorded against its own asset", async () => {
  const eth = await feeOf("shieldEth");
  assert.equal(eth.token, ETH);
  assert.equal(eth.kind, "shield", "a shield's fee is charged as kind 0, the depositor paying on top");
  assert.equal(eth.amount, charged.shieldEth.amount.toString());

  const tok = await feeOf("shieldToken");
  assert.equal(tok.token, token, "the fee names the asset it was taken in, so earnings can be priced per token");
  assert.equal(tok.kind, "shield");
  assert.equal(tok.amount, charged.shieldToken.amount.toString());
});

test("each withdrawal's protocol fee is recorded, apart from what the relayer was paid", async () => {
  const self = await feeOf("selfWithdraw");
  assert.equal(self.token, ETH);
  assert.equal(self.kind, "unshield", "money leaving the pool is charged as kind 1, out of the payout");
  assert.equal(self.amount, charged.selfWithdraw.amount.toString());

  const relayed = await feeOf("relayedWithdraw");
  assert.equal(relayed.token, ETH);
  assert.equal(relayed.kind, "unshield");
  // The protocol is paid on the amount withdrawn; the relayer's fee is the
  // sender's own cost and earns the protocol nothing.
  assert.equal(relayed.amount, charged.relayedWithdraw.amount.toString());
  assert.notEqual(relayed.amount, protocolFeeOn(RELAYED_WITHDRAW_ETH + RELAYER_FEE_ETH, CLOSING_BPS).toString());
});

test("a private send earns the protocol nothing", async () => {
  const rows = (await earnings()).byTx.get(done.send.tx.toLowerCase()) ?? [];
  assert.deepEqual(rows, [], "nothing entered or left the pool, so there was nothing to charge");
});

test("fees are priced at the rate in force, not the rate the run ended on", async () => {
  const closing = await feeRate();
  assert.equal(closing, CLOSING_BPS, "the pool ends the run on a different rate than it started");
  const atClosing = (amount: bigint) => protocolFeeOn(amount, closing).toString();

  // Each of these was charged at an earlier rate. Were the record to price
  // the run at whatever the rate happens to be now, all three would differ.
  assert.notEqual((await feeOf("shieldEth")).amount, atClosing(SHIELD_ETH));
  assert.notEqual((await feeOf("shieldToken")).amount, atClosing(SHIELD_TOKEN));
  assert.notEqual((await feeOf("selfWithdraw")).amount, atClosing(SELF_WITHDRAW_ETH));
});

test("what the record says the pool earned is what the pool kept", async () => {
  const { rows } = await earnings();
  assert.equal(rows.length, 4, `expected a fee for each shield and withdrawal, got ${rows.length}`);
  assert.equal(rows.filter((r) => r.kind === "collected").length, 0, "nothing was swept during the run");

  const recordedPer = new Map<string, bigint>();
  for (const r of rows) recordedPer.set(r.token, (recordedPer.get(r.token) ?? 0n) + BigInt(r.amount));

  // Nothing was swept, so every fee the pool charged is still sitting in
  // protocolFees(token). A missed fee, a double-counted one, or one priced
  // at the wrong rate leaves the two sides apart.
  for (const asset of [ETH, token]) {
    const kept = await feesHeld(asset);
    assert.ok(kept > 0n, `the pool charged something for ${asset}`);
    assert.equal(recordedPer.get(asset) ?? 0n, kept, `the record of ${asset} fees matches the pool's own balance`);
  }

  // The same totals as the earnings comparison reads them back, per asset.
  const state = await readState(chain!, 0);
  assert.deepEqual(
    state.protocolFees.map((f) => [f.token, f.charged, f.unswept, f.swept]).sort(),
    [ETH, token].map((a) => [a, String(recordedPer.get(a)), String(recordedPer.get(a)), "0"]).sort(),
  );
});

test("the month holds these five actions and nothing it could not read", async () => {
  const rows = [...(await recorded()).values()];
  assert.equal(rows.length, 5, `expected the five actions, got ${rows.map((r) => r.kind).join(", ")}`);
  assert.deepEqual(
    rows.map((r) => r.kind).sort(),
    ["send", "shield", "shield", "unshield", "unshield"],
  );
  assert.equal(rows.filter((r) => r.kind === "unreadable").length, 0);
});

test("syncing again changes nothing: the same actions and fees, recorded once", async () => {
  const before = await recorded();
  const feesBefore = (await earnings()).rows;
  await sync();
  const after = await recorded();
  assert.equal(after.size, before.size);
  for (const [tx, row] of after) assert.deepEqual(row, before.get(tx));
  // A fee counted twice would double what the month says the pool earned.
  assert.deepEqual((await earnings()).rows, feesBefore);
});

test.after(async () => {
  const { pool: pg } = await import("@workspace/db");
  await pg.end();
  // snarkjs leaves its proving threads running; without this the process
  // never exits and the run is reported as hung rather than passed.
  await (globalThis as { curve_bn128?: { terminate(): Promise<void> } }).curve_bn128?.terminate();
});
