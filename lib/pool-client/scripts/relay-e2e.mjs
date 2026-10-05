// Drives the API server's indexer and relayer against a local anvil pool,
// the way the browser will: shield from a public wallet, send privately
// through the relayer, unshield through the relayer with a fee, then check
// that a low fee and a replay are refused.
//   API=http://localhost:8799/api node scripts/relay-e2e.mjs
import assert from "node:assert/strict";
import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  initPoseidon, useDevProvingKeys, loadDeployment, Keys, scanNotes, unspent, planShield, planTransaction,
  nextDepositNumber, protocolFeeOn, fromServerState, evmRelayBody, evm,
} from "../src/node.js";

const API = process.env.API ?? "http://localhost:8799/api";
const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const CHAIN = "anvil";
await initPoseidon();
useDevProvingKeys();
const dep = loadDeployment(31337);
const transport = http(RPC);
const pub = createPublicClient({ transport });
// anvil account #3 (well-known local test key)
const depositor = createWalletClient({ account: privateKeyToAccount("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"), transport });

const get = async (p) => { const r = await fetch(API + p); const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; };
const post = async (p, body) => { const r = await fetch(API + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json() }; };
async function load(keys) {
  await new Promise((r) => setTimeout(r, 8_500)); // indexer refreshes at most every 8 s
  const raw = await get(`/pool/${CHAIN}/state`);
  const s = fromServerState(raw);
  const onchain = await pub.readContract({ address: dep.pool, abi: evm.poolAbi, functionName: "root" });
  assert.equal(s.tree.root, onchain, "server record matches the chain root");
  return { raw, s, notes: scanNotes(s.commitments, keys, raw.assets.map((a) => BigInt(a.assetId))) };
}
const ETH_ID = evm.assetIdOf(evm.ETH);
const wait = (hash) => pub.waitForTransactionReceipt({ hash });

const alice = Keys.random();
const bob = Keys.random();
let { raw, s, notes } = await load(alice);
const bps = BigInt(raw.feeBps);

// shield 0.01 ETH from a public wallet
const amount = parseEther("0.01");
const plan0 = planShield({ keys: alice, amount, depositNumber: nextDepositNumber(notes) });
await wait(await depositor.writeContract({ address: dep.pool, abi: evm.poolAbi, functionName: "shield", chain: null,
  args: [evm.ETH, amount, plan0.publicKey, plan0.blinding, `0x${Buffer.from(plan0.encryptedOutput).toString("hex")}`], value: amount + protocolFeeOn(amount, bps) }));
({ raw, s, notes } = await load(alice));
assert.equal(unspent(notes, s.spent, ETH_ID).length, 1);
console.log("ok - shield 0.01 ETH; server record verified; note found");

// private send of half to bob through the relayer
{
  const plan = planTransaction({ kind: "send", keys: alice, notes: unspent(notes, s.spent, ETH_ID), assetId: ETH_ID, amount: amount / 2n, to: bob.address });
  const proved = await evm.proveTransaction({ plan, tree: s.tree, token: evm.ETH, chainId: 31337, pool: dep.pool });
  const r = await post(`/pool/${CHAIN}/relay`, evmRelayBody(proved));
  assert.equal(r.status, 200, JSON.stringify(r.json));
  await wait(r.json.hash);
  console.log("ok - private send relayed free", { proveMs: proved.proveMs });
}

// bob unshields through the relayer
const q = await get(`/pool/${CHAIN}/relay`);
let b = await load(bob);
const bobNotes = unspent(b.notes, b.s.spent, ETH_ID);
assert.equal(bobNotes[0].amount, amount / 2n);
const fresh = privateKeyToAccount("0x" + "11".repeat(32)).address;
const before = await pub.getBalance({ address: fresh });
const out = amount / 2n - BigInt(q.fee);
const mk = async (fee) => {
  const plan = planTransaction({ kind: "unshield", keys: bob, notes: bobNotes, assetId: ETH_ID, amount: amount / 2n - fee, fee });
  return evm.proveTransaction({ plan, tree: b.s.tree, token: evm.ETH, recipient: fresh, relayer: q.relayer, chainId: 31337, pool: dep.pool });
};
{
  const low = await post(`/pool/${CHAIN}/relay`, evmRelayBody(await mk(1n)));
  assert.equal(low.status, 400);
  assert.match(low.json.error, /fee too low/);
  console.log("ok - low relayer fee refused:", low.json.error);
}
const good = await mk(BigInt(q.fee));
const r = await post(`/pool/${CHAIN}/relay`, evmRelayBody(good));
assert.equal(r.status, 200, JSON.stringify(r.json));
await wait(r.json.hash);
assert.equal(await pub.getBalance({ address: fresh }) - before, out - protocolFeeOn(out, bps));
console.log("ok - unshield relayed; recipient got amount minus protocol fee");
const replay = await post(`/pool/${CHAIN}/relay`, evmRelayBody(good));
assert.equal(replay.status, 400);
assert.match(replay.json.error, /NullifierAlreadySpent/);
console.log("ok - replay refused:", replay.json.error);
b = await load(bob);
assert.equal(unspent(b.notes, b.s.spent, ETH_ID).length, 0);
console.log("all relay checks passed");
process.exit(0);
