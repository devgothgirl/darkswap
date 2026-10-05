// End to end on a local EVM chain with the real verifier and real proofs.
//   anvil &
//   (cd evm && TEST_TOKEN=true forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 \
//        --private-key <anvil key 0> --broadcast)
//   node scripts/e2e-evm.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient, createWalletClient, http, parseEther, parseUnits, parseAbi, BaseError,
  ContractFunctionRevertedError, toHex,
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { foundry } from "viem/chains";
import { initPoseidon } from "./lib.mjs";
import { Keys, scanNotes, unspent, planTransaction, planShield, protocolFeeOn } from "./wallet.mjs";
import { ETH, poolAbi, sync, proveTransaction, assetIdOf, loadDeployment, extDataHash } from "./evm.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
// anvil's well-known test keys
const KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
];

const erc20 = parseAbi([
  "function approve(address, uint256) returns (bool)",
  "function transfer(address, uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]);

await initPoseidon();
const pub = createPublicClient({ chain: foundry, transport: http(RPC) });
const chainId = await pub.getChainId();
const dep = loadDeployment(chainId);
const pool = dep.pool;
const tUSD = dep.token;
const wallet = (k) => createWalletClient({ account: privateKeyToAccount(k), chain: foundry, transport: http(RPC) });
const deployer = wallet(KEYS[0]);
const alicePublic = wallet(KEYS[1]);
const relayer = wallet(KEYS[2]);

const report = { chainId, pool, steps: [] };
const step = (name, data = {}) => { report.steps.push({ name, ...data }); console.log("ok -", name, JSON.stringify(data, (_, v) => typeof v === "bigint" ? v.toString() : v)); };

async function send(client, args) {
  const hash = await client.writeContract({ ...args, address: args.address ?? pool, abi: args.abi ?? poolAbi });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success", `${args.functionName} failed`);
  return receipt;
}

async function revertName(client, args) {
  try {
    await pub.simulateContract({ ...args, address: pool, abi: poolAbi, account: client.account });
    return null;
  } catch (err) {
    const reverted = err instanceof BaseError && err.walk((e) => e instanceof ContractFunctionRevertedError);
    return reverted?.data?.errorName ?? reverted?.shortMessage ?? err.shortMessage;
  }
}

async function notesOf(keys) {
  const state = await sync(pub, pool, dep.deployBlock);
  const assetIds = state.tokens.map(assetIdOf);
  return { state, notes: scanNotes(state.commitments, keys, assetIds) };
}

// ---------------------------------------------------------------------------
const alice = Keys.random();
const bob = Keys.random();

const book = async (token) => (await pub.readContract({ address: pool, abi: poolAbi, functionName: "assets", args: [token] }))[5];
const feeBps = await pub.readContract({ address: pool, abi: poolAbi, functionName: "protocolFeeBps" });
const feeRecipient = await pub.readContract({ address: pool, abi: poolAbi, functionName: "feeRecipient" });
const fee = (x) => protocolFeeOn(x, feeBps);
report.protocolFeeBps = Number(feeBps);
const startEth = await book(ETH);
const startToken = await book(tUSD);
const startPoolEth = await pub.getBalance({ address: pool });

// 1. Alice shields 1 ETH, 0.5 ETH and 500 tUSD from her public wallet.
await send(deployer, { address: tUSD, abi: erc20, functionName: "transfer", args: [alicePublic.account.address, parseUnits("1000", 6)] });
await send(alicePublic, { address: tUSD, abi: erc20, functionName: "approve", args: [pool, 2n ** 256n - 1n] });
const gas = {};
for (const [n, token, amount] of [[0, ETH, parseEther("1")], [1, ETH, parseEther("0.5")], [2, tUSD, parseUnits("500", 6)]]) {
  const s = planShield({ keys: alice, amount, depositNumber: n });
  const receipt = await send(alicePublic, {
    functionName: "shield",
    args: [token, amount, s.publicKey, s.blinding, toHex(s.encryptedOutput)],
    value: token === ETH ? amount + fee(amount) : 0n, // the depositor pays the protocol fee on top
  });
  gas[`shield ${token === ETH ? "ETH" : "token"}`] = receipt.gasUsed;
}
let { state, notes } = await notesOf(alice);
assert.equal(notes.length, 3, "alice finds her 3 deposits");
step("shield 1 ETH, 0.5 ETH, 500 tUSD (plus the protocol fee); wallet finds all three notes", { notes: notes.map((n) => n.amount), feeBps: Number(feeBps) });

// 2. Alice privately sends 1.2 ETH to Bob. The relayer submits it; no fee.
{
  const plan = planTransaction({ kind: "send", keys: alice, notes: unspent(notes, state.spent, assetIdOf(ETH)), assetId: assetIdOf(ETH), amount: parseEther("1.2"), to: bob.address });
  assert.equal(plan.inputs.length, 2, "needs both ETH notes");
  const { proof, ext, proveMs } = await proveTransaction({ plan, tree: state.tree, token: ETH, chainId, pool });
  assert.equal(ext.token, "0x0000000000000000000000000000000000000000", "a private send names no token");
  const receipt = await send(relayer, { functionName: "transact", args: [proof, ext] });
  gas["private send (relayed)"] = receipt.gasUsed;
  step("alice sends 1.2 ETH privately to bob, relayed, asset hidden", { proveMs, gas: receipt.gasUsed });
}

// 3. Bob finds 1.2 ETH; Alice finds her 0.3 ETH change.
({ state, notes } = await notesOf(bob));
const bobNotes = unspent(notes, state.spent, assetIdOf(ETH));
assert.equal(bobNotes.length, 1);
assert.equal(bobNotes[0].amount, parseEther("1.2"));
const aliceNow = (await notesOf(alice));
const aliceEth = unspent(aliceNow.notes, aliceNow.state.spent, assetIdOf(ETH));
assert.equal(aliceEth.length, 1);
assert.equal(aliceEth[0].amount, parseEther("0.3"));
step("bob finds 1.2 ETH; alice finds 0.3 ETH change; spent notes drop out");

// 4. Bob unshields 1 ETH to a brand-new address. The relayer submits and takes 0.001 ETH.
const fresh = privateKeyToAccount(generatePrivateKey()).address;
let bobUnshield;
{
  const plan = planTransaction({ kind: "unshield", keys: bob, notes: bobNotes, assetId: assetIdOf(ETH), amount: parseEther("1"), fee: parseEther("0.001") });
  const proved = await proveTransaction({ plan, tree: state.tree, token: ETH, recipient: fresh, relayer: relayer.account.address, chainId, pool });
  bobUnshield = proved;
  const before = await pub.getBalance({ address: relayer.account.address });
  const receipt = await send(relayer, { functionName: "transact", args: [proved.proof, proved.ext] });
  gas["unshield ETH with fee (relayed)"] = receipt.gasUsed;
  assert.equal(await pub.getBalance({ address: fresh }), parseEther("1") - fee(parseEther("1")), "fresh address receives 1 ETH minus the protocol fee");
  const after = await pub.getBalance({ address: relayer.account.address });
  const relayerNet = after - before;
  step("bob unshields 1 ETH to a fresh address (0.995 after the fee); relayer paid 0.001 ETH", { gas: receipt.gasUsed, relayerNetWei: relayerNet });
}

// 5. Replaying Bob's transaction is refused.
assert.equal(await revertName(relayer, { functionName: "transact", args: [bobUnshield.proof, bobUnshield.ext] }), "NullifierAlreadySpent");
step("replaying the same proof is refused: NullifierAlreadySpent");

// 6. A relayer that changes the recipient after proving is refused.
({ state, notes } = await notesOf(alice));
{
  const tokenNotes = unspent(notes, state.spent, assetIdOf(tUSD));
  const plan = planTransaction({ kind: "unshield", keys: alice, notes: tokenNotes, assetId: assetIdOf(tUSD), amount: parseUnits("100", 6) });
  const honest = privateKeyToAccount(generatePrivateKey()).address;
  const proved = await proveTransaction({ plan, tree: state.tree, token: tUSD, recipient: honest, chainId, pool });
  const stolen = { ...proved.ext, recipient: relayer.account.address };
  assert.equal(await revertName(relayer, { functionName: "transact", args: [proved.proof, stolen] }), "InvalidProof");
  const bigger = { ...proved.ext, extAmount: proved.ext.extAmount * 2n };
  assert.equal(await revertName(relayer, { functionName: "transact", args: [proved.proof, bigger] }), "InvalidProof");
  step("changing the recipient or the amount after proving is refused: InvalidProof");

  // extDataHash in JS matches the contract
  const onchain = await pub.readContract({ address: pool, abi: poolAbi, functionName: "extDataHash", args: [proved.ext] });
  assert.equal(onchain, extDataHash(proved.ext, chainId, pool));

  const receipt = await send(relayer, { functionName: "transact", args: [proved.proof, proved.ext] });
  gas["unshield token, no fee (relayed)"] = receipt.gasUsed;
  assert.equal(await pub.readContract({ address: tUSD, abi: erc20, functionName: "balanceOf", args: [honest] }), parseUnits("100", 6) - fee(parseUnits("100", 6)));
  step("honest version of the same token unshield goes through", { gas: receipt.gasUsed });
}

// 7. The pool's books balance, fees sit apart from them, and anyone can sweep the fees.
assert.equal(await book(ETH) - startEth, parseEther("0.499"), "notes: 1.5 in, 1 + 0.001 out");
assert.equal(await book(tUSD) - startToken, parseUnits("400", 6));
const ethFees = await pub.readContract({ address: pool, abi: poolAbi, functionName: "protocolFees", args: [ETH] });
const tokenFees = await pub.readContract({ address: pool, abi: poolAbi, functionName: "protocolFees", args: [tUSD] });
assert.equal(await pub.getBalance({ address: pool }), (await book(ETH)) + ethFees, "pool ETH = note books + unswept fees");
const expectedEthFees = fee(parseEther("1")) + fee(parseEther("0.5")) + fee(parseEther("1"));
assert.ok(ethFees >= expectedEthFees, "this run's ETH fees accrued");
step("pool books match its balances; protocol fees accrue apart from them", { ethFees, tokenFees });

{
  const before = await pub.getBalance({ address: feeRecipient });
  const r1 = await send(relayer, { functionName: "collectFees", args: [ETH] }); // a stranger sweeps
  const r2 = await send(relayer, { functionName: "collectFees", args: [tUSD] });
  assert.equal((await pub.getBalance({ address: feeRecipient })) - before, ethFees);
  assert.equal(await pub.readContract({ address: pool, abi: poolAbi, functionName: "protocolFees", args: [ETH] }), 0n);
  assert.equal(await pub.getBalance({ address: pool }), await book(ETH), "after the sweep the pool holds only the notes' money");
  gas["collect fees ETH"] = r1.gasUsed;
  gas["collect fees token"] = r2.gasUsed;
  step("anyone sweeps the fees to the fixed fee recipient", { ethFees, tokenFees });
}

report.gas = gas;
fs.mkdirSync(path.join(root, "fixtures"), { recursive: true });
fs.writeFileSync(path.join(root, "fixtures/e2e-evm-result.json"), JSON.stringify(report, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
console.log("gas:", Object.fromEntries(Object.entries(gas).map(([k, v]) => [k, Number(v)])));
console.log("all EVM end-to-end checks passed");
process.exit(0);
