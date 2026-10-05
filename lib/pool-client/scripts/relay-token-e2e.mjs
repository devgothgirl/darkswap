// Token withdrawals against a local anvil pool and the real API server:
// the relayer takes its fee in the token (at the operator's configured rate),
// refuses a fee below that, and a wallet can submit a withdrawal itself with
// no relayer and no fee. Needs the deploy script's test token (TEST_TOKEN=true)
// and the server started with
//   POOL_RELAY_TOKEN_RATES_ANVIL='{"<test token>":"2500"}'
//   API=http://localhost:8799/api node scripts/relay-token-e2e.mjs
import assert from "node:assert/strict";
import { createPublicClient, createWalletClient, encodeFunctionData, erc20Abi, getAddress, http, parseUnits } from "viem";
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
const token = getAddress(dep.token);
const transport = http(RPC);
const pub = createPublicClient({ transport });
// Well-known anvil test keys: #0 holds the test token; #4 submits a withdrawal itself.
const holder = createWalletClient({ account: privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"), transport });
const submitter = createWalletClient({ account: privateKeyToAccount("0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a"), transport });

const get = async (p) => { const r = await fetch(API + p); const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; };
const post = async (p, body) => { const r = await fetch(API + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json() }; };
const wait = async (hash) => { const r = await pub.waitForTransactionReceipt({ hash }); assert.equal(r.status, "success"); return r; };
const balanceOf = (a) => pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [a] });
async function load(keys) {
  await new Promise((r) => setTimeout(r, 8_500)); // indexer refreshes at most every 8 s
  const raw = await get(`/pool/${CHAIN}/state`);
  const s = fromServerState(raw);
  assert.equal(s.tree.root, await pub.readContract({ address: dep.pool, abi: evm.poolAbi, functionName: "root" }), "server record matches the chain root");
  return { raw, s, notes: scanNotes(s.commitments, keys, raw.assets.map((a) => BigInt(a.assetId))) };
}
const TOKEN_ID = evm.assetIdOf(token);

const alice = Keys.random();
let { raw, s, notes } = await load(alice);
const bps = BigInt(raw.feeBps);

// 1. Shield 500 test tokens (6 decimals) for alice.
const amount = parseUnits("500", 6);
await wait(await holder.writeContract({ address: token, abi: erc20Abi, functionName: "approve", args: [dep.pool, amount + protocolFeeOn(amount, bps)], chain: null }));
const plan0 = planShield({ keys: alice, amount, depositNumber: nextDepositNumber(notes) });
await wait(await holder.writeContract({ address: dep.pool, abi: evm.poolAbi, functionName: "shield", chain: null,
  args: [token, amount, plan0.publicKey, plan0.blinding, `0x${Buffer.from(plan0.encryptedOutput).toString("hex")}`] }));
({ raw, s, notes } = await load(alice));
assert.equal(unspent(notes, s.spent, TOKEN_ID).length, 1);
console.log("ok - shield 500 tokens; note found");

// 2. The quote prices the relayer fee in the token: the ETH fee × the configured rate.
const q = await get(`/pool/${CHAIN}/relay`);
const tokenFee = BigInt(Object.entries(q.tokenFees).find(([t]) => getAddress(t) === token)[1]);
const expected = (BigInt(q.fee) * 2500n * 10n ** 6n + 10n ** 18n - 1n) / 10n ** 18n;
assert.equal(tokenFee, expected, "token fee = ETH fee × 2500, in 6-decimal units, rounded up");
console.log("ok - token fee quoted", { ethFee: q.fee, tokenFee: tokenFee.toString() });

// 3. Relayed token unshield: a low fee is refused, the quoted fee goes through.
const fresh = privateKeyToAccount("0x" + "22".repeat(32)).address;
const out = parseUnits("100", 6);
const mk = (fee) => {
  const plan = planTransaction({ kind: "unshield", keys: alice, notes: unspent(notes, s.spent, TOKEN_ID), assetId: TOKEN_ID, amount: out, fee });
  return evm.proveTransaction({ plan, tree: s.tree, token, recipient: fresh, relayer: q.relayer, chainId: 31337, pool: dep.pool });
};
{
  const low = await post(`/pool/${CHAIN}/relay`, evmRelayBody(await mk(tokenFee / 10n)));
  assert.equal(low.status, 400);
  assert.match(low.json.error, /fee too low/);
  console.log("ok - low token fee refused:", low.json.error);
}
const relayerBefore = await balanceOf(q.relayer);
const r = await post(`/pool/${CHAIN}/relay`, evmRelayBody(await mk(tokenFee)));
assert.equal(r.status, 200, JSON.stringify(r.json));
await wait(r.json.hash);
assert.equal(await balanceOf(fresh), out - protocolFeeOn(out, bps), "recipient gets the amount minus the protocol fee");
assert.equal(await balanceOf(q.relayer) - relayerBefore, tokenFee, "relayer is paid in the token");
console.log("ok - token unshield relayed; relayer paid in the token");

// 4. Self-submitted unshield: the user's wallet calls transact, no relayer, no fee.
({ raw, s, notes } = await load(alice));
const change = unspent(notes, s.spent, TOKEN_ID);
assert.equal(change.length, 1);
assert.equal(change[0].amount, amount - out - tokenFee);
const second = privateKeyToAccount("0x" + "33".repeat(32)).address;
const out2 = parseUnits("50", 6);
{
  const plan = planTransaction({ kind: "unshield", keys: alice, notes: change, assetId: TOKEN_ID, amount: out2, fee: 0n });
  const { proof, ext } = await evm.proveTransaction({ plan, tree: s.tree, token, recipient: second, chainId: 31337, pool: dep.pool });
  assert.equal(ext.relayer, "0x0000000000000000000000000000000000000000");
  await wait(await submitter.sendTransaction({ chain: null, to: dep.pool, data: encodeFunctionData({ abi: evm.poolAbi, functionName: "transact", args: [proof, ext] }) }));
}
assert.equal(await balanceOf(second), out2 - protocolFeeOn(out2, bps));
({ raw, s, notes } = await load(alice));
assert.equal(unspent(notes, s.spent, TOKEN_ID)[0].amount, amount - out - tokenFee - out2, "change returns to alice");
console.log("ok - self-submitted token unshield; no relayer fee; change found");
console.log("all token withdrawal checks passed");
process.exit(0);
