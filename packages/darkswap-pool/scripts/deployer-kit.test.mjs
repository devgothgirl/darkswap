// Tests for the testnet deployer kit (deploy-evm.sh, devnet-setup.mjs,
// check-deployment.mjs). They never touch a real network: small local
// JSON-RPC mocks stand in for the chains. Run: npm run test:kit
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { execFile, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Keypair } from "@solana/web3.js";
import { toFunctionSelector } from "viem";

const PKG = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const haveCast = spawnSync("cast", ["--version"]).status === 0;
const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";

function mockRpc(handler) {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      const reqs = JSON.parse(body);
      const answer = (r) => ({ jsonrpc: "2.0", id: r.id, result: handler(r.method, r.params ?? []) });
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(Array.isArray(reqs) ? reqs.map(answer) : answer(reqs)));
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => { server.closeAllConnections(); server.close(); } })));
}

// Asynchronous on purpose: the mock RPC servers live in this process, so a
// blocking spawnSync would stop them from answering.
const run = (cmd, args, env = {}) => new Promise((resolve) => {
  execFile(cmd, args, { cwd: PKG, encoding: "utf8", env: { ...process.env, ...env }, timeout: 60_000 }, (err, stdout, stderr) => {
    resolve({ status: err ? (typeof err.code === "number" ? err.code : 1) : 0, stdout, stderr });
  });
});
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "pool-kit-"));
const writeEnv = (dir, overrides) => {
  const base = fs.readFileSync(path.join(PKG, "scripts/.env.deploy.example"), "utf8");
  const vals = {
    RPC_URL: "http://127.0.0.1:1",
    DEPLOYER_PRIVATE_KEY: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    OWNER: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    FEE_RECIPIENT: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    ...overrides,
  };
  let out = base;
  for (const [k, v] of Object.entries(vals)) out = out.replace(new RegExp(`^${k}=.*$`, "m"), `${k}=${v}`);
  const file = path.join(dir, ".env.deploy");
  fs.writeFileSync(file, out);
  return file;
};

// ---- deploy-evm.sh ------------------------------------------------------------------

test("deploy-evm.sh refuses an empty fee recipient before touching the network", async () => {
  const file = writeEnv(tmpDir(), { FEE_RECIPIENT: "" });
  const r = await run("bash", ["scripts/deploy-evm.sh", file]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /FEE_RECIPIENT is empty/);
  assert.doesNotMatch(r.stdout + r.stderr, /Deploying to/);
});

test("deploy-evm.sh refuses a fee recipient equal to the deployer", { skip: !haveCast && "cast not installed" }, async () => {
  const rpc = await mockRpc((m) => (m === "eth_chainId" ? "0xaa36a7" : "0x0"));
  try {
    const file = writeEnv(tmpDir(), { RPC_URL: rpc.url, FEE_RECIPIENT: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", OWNER: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" });
    // deployer of the key above is 0x7099...; make the fee recipient that address
    const r = await run("bash", ["scripts/deploy-evm.sh", file]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /OWNER is the deployer wallet|FEE_RECIPIENT is the deployer wallet/);
    assert.doesNotMatch(r.stdout, /Deploying to/);
  } finally { rpc.close(); }
});

test("deploy-evm.sh refuses a mainnet RPC (chain id 1) and sends nothing", { skip: !haveCast && "cast not installed" }, async () => {
  let balanceAsked = false;
  const rpc = await mockRpc((m) => { if (m === "eth_getBalance") balanceAsked = true; return m === "eth_chainId" ? "0x1" : "0xde0b6b3a7640000"; });
  try {
    const r = await run("bash", ["scripts/deploy-evm.sh", writeEnv(tmpDir(), { RPC_URL: rpc.url })]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /chain id 1, which is not Sepolia/);
    assert.match(r.stderr, /TESTNET only/);
    assert.doesNotMatch(r.stdout, /Deploying to/);
    assert.equal(balanceAsked, false, "refused before reading the wallet");
  } finally { rpc.close(); }
});

test("deploy-evm.sh refuses local anvil unless ALLOW_LOCAL_ANVIL=1", { skip: !haveCast && "cast not installed" }, async () => {
  const rpc = await mockRpc((m) => (m === "eth_chainId" ? "0x7a69" : "0xde0b6b3a7640000"));
  try {
    const r = await run("bash", ["scripts/deploy-evm.sh", writeEnv(tmpDir(), { RPC_URL: rpc.url })]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /ALLOW_LOCAL_ANVIL=1/);
  } finally { rpc.close(); }
});

test("deploy-evm.sh accepts Sepolia's chain id and continues to the wallet checks", { skip: !haveCast && "cast not installed" }, async () => {
  const rpc = await mockRpc((m) => (m === "eth_chainId" ? "0xaa36a7" : "0x0"));
  try {
    const r = await run("bash", ["scripts/deploy-evm.sh", writeEnv(tmpDir(), { RPC_URL: rpc.url })]);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /RPC reachable: Sepolia \(chain id 11155111\)/);
    assert.match(r.stderr, /deployer balance is 0/); // empty mock wallet: stops here, nothing deployed
    assert.doesNotMatch(r.stdout, /Deploying to/);
  } finally { rpc.close(); }
});

// ---- devnet-setup.mjs -----------------------------------------------------------------

const authority = Keypair.generate();
const feeRecipient = Keypair.generate().publicKey.toBase58();
const programId = Keypair.generate().publicKey.toBase58();
const authorityFile = path.join(tmpDir(), "authority.json");
fs.writeFileSync(authorityFile, JSON.stringify(Array.from(authority.secretKey)));
const baseArgs = ["scripts/devnet-setup.mjs", "--program", programId, "--authority", authorityFile, "--fee-recipient", feeRecipient];

function solanaMock({ genesis = DEVNET_GENESIS, accounts = {} } = {}) {
  return mockRpc((m, params) => {
    switch (m) {
      case "getGenesisHash": return genesis;
      case "getAccountInfo": return { context: { slot: 1 }, value: accounts[params[0]] ?? null };
      case "getBalance": return { context: { slot: 1 }, value: 0 };
      case "getMinimumBalanceForRentExemption": return 1_000_000;
      default: return null;
    }
  });
}

test("devnet-setup.mjs refuses a mainnet RPC", async () => {
  const rpc = await solanaMock({ genesis: MAINNET_GENESIS });
  try {
    const r = await run("node", [...baseArgs, "--rpc", rpc.url]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /MAINNET/);
    assert.doesNotMatch(r.stdout, /Step 1/);
  } finally { rpc.close(); }
});

test("devnet-setup.mjs refuses a fee recipient equal to the authority", async () => {
  const r = await run("node", ["scripts/devnet-setup.mjs", "--program", programId, "--authority", authorityFile, "--fee-recipient", authority.publicKey.toBase58(), "--dry-run"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /fee recipient is the upgrade-authority wallet/);
});

test("devnet-setup.mjs dry run previews every step and the handoff block without sending", async () => {
  const rpc = await solanaMock();
  try {
    const r = await run("node", [...baseArgs, "--rpc", rpc.url, "--dry-run"], { POOL_KEYS_DIR: tmpDir() });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /WOULD\s+initialize: .*fee 50 bps/);
    assert.match(r.stdout, /WOULD\s+list SOL: min 0.01 SOL, max 5 SOL, cap 50 SOL/);
    assert.match(r.stdout, new RegExp(`POOL_PROGRAM_ID_DEVNET=${programId}`));
    assert.doesNotMatch(r.stdout, /SENDING/);
  } finally { rpc.close(); }
});

test("devnet-setup.mjs reuses the saved test-mint keypair on every run (no second mint)", async () => {
  const keys = tmpDir();
  const mint = Keypair.generate();
  fs.writeFileSync(path.join(keys, `test-mint-${programId}.json`), JSON.stringify(Array.from(mint.secretKey)));
  const rpc = await solanaMock();
  try {
    const a = await run("node", [...baseArgs, "--rpc", rpc.url, "--test-token", "--dry-run"], { POOL_KEYS_DIR: keys });
    const b = await run("node", [...baseArgs, "--rpc", rpc.url, "--test-token", "--dry-run"], { POOL_KEYS_DIR: keys });
    for (const r of [a, b]) {
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, new RegExp(`reusing the saved test-mint keypair .*${mint.publicKey.toBase58()}`));
      assert.match(r.stdout, new RegExp(`WOULD\\s+create mint ${mint.publicKey.toBase58()}`));
      assert.match(r.stdout, new RegExp(`tTEST\\s+${mint.publicKey.toBase58()}`)); // handoff lists the same mint
    }
  } finally { rpc.close(); }
});

test("devnet-setup.mjs resumes after a partial run: an existing mint is not created again", async () => {
  const keys = tmpDir();
  const mint = Keypair.generate();
  fs.writeFileSync(path.join(keys, `test-mint-${programId}.json`), JSON.stringify(Array.from(mint.secretKey)));
  const mintAccount = { data: ["", "base64"], executable: false, lamports: 1_461_600, owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", rentEpoch: 0, space: 82 };
  const rpc = await solanaMock({ accounts: { [mint.publicKey.toBase58()]: mintAccount } });
  try {
    const r = await run("node", [...baseArgs, "--rpc", rpc.url, "--test-token", "--dry-run"], { POOL_KEYS_DIR: keys });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, new RegExp(`DONE\\s+mint ${mint.publicKey.toBase58()} exists on chain`));
    assert.doesNotMatch(r.stdout, /WOULD\s+create/);
  } finally { rpc.close(); }
});

// ---- check-deployment.mjs ---------------------------------------------------------------

test("check-deployment.mjs reports WAIT (not FIX) when nothing is deployed", async () => {
  const r = await run("node", ["scripts/check-deployment.mjs"], { POOL_DEPLOYMENTS_DIR: tmpDir(), POOL_PROGRAM_ID_DEVNET: "", RPC_URL_ANVIL: "" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal((r.stdout.match(/WAIT\s+not deployed yet/g) ?? []).length, 3);
  assert.doesNotMatch(r.stdout, /FIX/);
});

// A Sepolia pool that answers every read check-deployment.mjs makes, so the
// only thing a test varies is the value under test. No real network.
const word = (v) => BigInt(v).toString(16).padStart(64, "0");
const addrWord = (a) => a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const SEPOLIA_DEP = {
  chainId: 11155111,
  pool: "0x0000000000000000000000000000000000000001",
  verifier: "0x0000000000000000000000000000000000000002",
  owner: "0x0000000000000000000000000000000000000003",
  feeRecipient: "0x0000000000000000000000000000000000000004",
  protocolFeeBps: 50,
  deployBlock: 1,
};

function sepoliaPoolMock(liveFeeBps) {
  const answers = new Map([
    ["function nextIndex()", word(0)],
    ["function root()", word(1)],
    ["function protocolFeeBps()", word(liveFeeBps)],
    ["function feeRecipient()", addrWord(SEPOLIA_DEP.feeRecipient)],
    ["function owner()", addrWord(SEPOLIA_DEP.owner)],
    ["function pendingOwner()", word(0)],
    ["function guardianExpiry()", word(2_000_000_000)],
    ["function protocolFees(address)", word(0)],
    // listed, depositsEnabled, min, max, cap, balance
    ["function assets(address)", word(1) + word(1) + word(1) + word(2) + word(3) + word(0)],
  ].map(([sig, data]) => [toFunctionSelector(sig), data]));
  return mockRpc((method, params) => {
    if (method === "eth_chainId") return "0xaa36a7"; // 11155111
    if (method === "eth_getCode") return "0x6001";
    if (method === "eth_call") return `0x${answers.get(params[0].data.slice(0, 10)) ?? word(0)}`;
    return null;
  });
}

/** Only Sepolia is configured, so the other two chains report WAIT. */
async function checkSepolia(rpcUrl, env = {}) {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, "11155111.json"), JSON.stringify(SEPOLIA_DEP));
  return run("node", ["scripts/check-deployment.mjs"], {
    POOL_DEPLOYMENTS_DIR: dir, RPC_URL_SEPOLIA: rpcUrl, POOL_PROGRAM_ID_DEVNET: "", RPC_URL_ANVIL: "",
    REPL_ID: "test", POOL_RELAY_MIN_FEE_SEPOLIA: "0", POOL_RELAYER_PRIVATE_KEY_EVM: "", ...env,
  });
}

test("check-deployment.mjs confirms the agreed fee rate and margin on a live pool", async () => {
  const rpc = await sepoliaPoolMock(50);
  try {
    const r = await checkSepolia(rpc.url);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /PASS\s+charges 50 bps \(0\.50%\), the agreed rate \(read from the chain\)/);
    assert.match(r.stdout, /PASS\s+relayer margin 0 wei, the agreed value/);
  } finally { rpc.close(); }
});

test("check-deployment.mjs reports a pool charging something other than the agreed rate", async () => {
  // The file still says 50: the live value is what counts, and it is the one
  // that must be reported rather than taken from the file.
  const rpc = await sepoliaPoolMock(25);
  try {
    const r = await checkSepolia(rpc.url);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /FIX\s+the pool charges 25 bps \(0\.25%\), but the agreed rate is 50 bps \(0\.50%\)/);
    assert.match(r.stdout, /No redeploy is needed: the owner calls setProtocolFee/);
  } finally { rpc.close(); }
});

test("check-deployment.mjs reports a relayer margin that is not the agreed one", async () => {
  const rpc = await sepoliaPoolMock(50);
  try {
    const r = await checkSepolia(rpc.url, { POOL_RELAY_MIN_FEE_SEPOLIA: "7" });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /FIX\s+POOL_RELAY_MIN_FEE_SEPOLIA is 7 wei, but the agreed margin is 0 wei/);
  } finally { rpc.close(); }
});

test("check-deployment.mjs waits on the margin outside Replit instead of calling it wrong", async () => {
  const rpc = await sepoliaPoolMock(50);
  try {
    const r = await checkSepolia(rpc.url, { REPL_ID: "", POOL_RELAY_MIN_FEE_SEPOLIA: "" });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /WAIT\s+relayer margin not checked here: POOL_RELAY_MIN_FEE_SEPOLIA is a Replit server setting/);
  } finally { rpc.close(); }
});

test("check-deployment.mjs flags a deployment file written for the wrong chain", async () => {
  const dir = tmpDir();
  const dep = { chainId: 84532, pool: "0x0000000000000000000000000000000000000001", verifier: "0x0000000000000000000000000000000000000002", owner: "0x0000000000000000000000000000000000000003", feeRecipient: "0x0000000000000000000000000000000000000004", protocolFeeBps: 50, deployBlock: 1 };
  fs.writeFileSync(path.join(dir, "11155111.json"), JSON.stringify(dep));
  const r = await run("node", ["scripts/check-deployment.mjs"], { POOL_DEPLOYMENTS_DIR: dir, RPC_URL_SEPOLIA: "http://127.0.0.1:1", POOL_PROGRAM_ID_DEVNET: "", RPC_URL_ANVIL: "" });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FIX\s+the file says chainId 84532, but this is chain 11155111/);
});
