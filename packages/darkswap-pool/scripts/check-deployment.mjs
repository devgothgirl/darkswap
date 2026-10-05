// Checks the shielded pool's testnet deployments (TESTNET) the way the API
// server reads them, and prints a PASS / FIX list in plain words.
//
//   node scripts/check-deployment.mjs            (from packages/darkswap-pool)
//   npm run check:deployment
//
// Runs on the Deployer's laptop or in the Replit shell. For each chain it:
//   - reads deployments/<chainId>.json (EVM) or POOL_PROGRAM_ID_DEVNET (Solana),
//   - connects to RPC_URL_<CHAIN> (Solana falls back to the public devnet RPC),
//   - reads the live pool settings: fee rate, fee recipient, listed assets, current root,
//   - compares the live fee rate and the relayer margin with the agreed values below,
//   - checks the relayer wallet's balance when its key is in the environment.
// Keys are never printed; only the addresses derived from them.
// Exit code 1 when anything says FIX. "Not deployed yet" is WAIT, not FIX.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, formatEther, formatUnits, getAddress, parseAbi, isAddressEqual, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { ensureClientDeps } from "./kit-preflight.mjs";

ensureClientDeps(); // explains a missing `npm install` instead of crashing on the imports below
const { ETH, poolAbi } = await import("./evm.mjs");
const { readPool, readAsset, pdas, SOL_MINT } = await import("./solana.mjs");

const PKG = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEPLOYMENTS = process.env.POOL_DEPLOYMENTS_DIR ?? path.join(PKG, "deployments");
const show = (file) => (file.startsWith(PKG) ? path.relative(PKG, file) : file);

// Same table as artifacts/api-server/src/lib/pool/config.ts.
const CHAINS = [
  { id: "sepolia", label: "Sepolia", kind: "evm", chainId: 11155111, envKey: "SEPOLIA", explorer: "https://sepolia.etherscan.io" },
  { id: "base-sepolia", label: "Base Sepolia", kind: "evm", chainId: 84532, envKey: "BASE_SEPOLIA", explorer: "https://sepolia.basescan.org" },
  { id: "solana-devnet", label: "Solana devnet", kind: "solana", cluster: "devnet", envKey: "SOLANA_DEVNET", explorer: "https://explorer.solana.com" },
];
if (process.env.NODE_ENV !== "production" && process.env.RPC_URL_ANVIL) {
  CHAINS.push({ id: "anvil", label: "Local anvil (development only)", kind: "evm", chainId: 31337, envKey: "ANVIL", explorer: "" });
}

// The owner's decision of 2026-10-04, tabulated in REPLIT_HANDOFF.md section 5
// ("Fee values to deploy with") and reasoned in docs/pool-earnings-models.md
// section 5. The deployed pools are measured against this table: a pool that
// charges something else is reported, never quietly accepted. Changing the
// decision means changing this table and the handoff's in the same edit.
// Local anvil is deliberately absent: it is a development chain, so its own
// settings are printed but nothing is held against the testnet decision.
const AGREED = {
  SEPOLIA: { feeBps: 50, margin: 0n },
  BASE_SEPOLIA: { feeBps: 50, margin: 0n },
  SOLANA_DEVNET: { feeBps: 50, margin: 500_000n },
};

const MIN_RELAYER_ETH = 0.05;
const MIN_RELAYER_SOL = 0.5;
const LAMPORTS_PER_SIGNATURE = 5_000n; // same constant the relayer quotes with
const ownerAbi = parseAbi(["function owner() view returns (address)", "function pendingOwner() view returns (address)", "function guardianExpiry() view returns (uint256)"]);
const erc20Abi = parseAbi(["function symbol() view returns (string)", "function decimals() view returns (uint8)"]);

let fixes = 0;
const line = (tag, msg) => console.log(`  ${tag.padEnd(5)} ${msg}`);
const pass = (msg) => line("PASS", msg);
const wait = (msg) => line("WAIT", msg);
const info = (msg) => line("", msg);
const fix = (msg) => { fixes++; line("FIX", msg); };
const short = (n, d, sym) => `${Number(formatUnits(n, d)).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${sym}`;
const bps = (n) => `${n} bps (${(Number(n) / 100).toFixed(2)}%)`;

/**
 * The rate the pool charges, read from the chain, against the rate the owner
 * agreed. A difference is reported together with the single call that corrects
 * it: the rate is changeable afterwards, so a wrong rate is never a reason to
 * redeploy, and never a reason to accept a different number.
 */
function checkFeeRate(chain, liveBps, howToFix) {
  const agreed = AGREED[chain.envKey]?.feeBps;
  if (agreed === undefined) return info(`charges ${bps(liveBps)} (development chain; no agreed rate to meet)`);
  if (Number(liveBps) === agreed) pass(`charges ${bps(liveBps)}, the agreed rate (read from the chain)`);
  else fix(`the pool charges ${bps(liveBps)}, but the agreed rate is ${bps(agreed)}. No redeploy is needed: ${howToFix}`);
}

/**
 * The relayer's margin on top of network costs. It is a Replit server setting,
 * not a chain value, so it is read from the environment. Unset means zero,
 * which is what the two EVM chains agreed to; Solana devnet must carry 500,000
 * lamports (0.0005 SOL). Returns the margin in base units, or null when it is
 * unreadable or was not checked here.
 */
function checkMargin(chain, unit) {
  const agreed = AGREED[chain.envKey]?.margin;
  if (agreed === undefined) return null; // local anvil: no agreed value
  const key = `POOL_RELAY_MIN_FEE_${chain.envKey}`;
  const raw = process.env[key];
  const unset = raw === undefined || raw === "";
  if (unset && !process.env.REPL_ID) {
    wait(`relayer margin not checked here: ${key} is a Replit server setting, so run this in the Replit shell to see it.`);
    return null;
  }
  if (!unset && !/^\d+$/.test(raw)) {
    fix(`${key} is "${raw}". It must be a whole number of ${unit}. The relayer answers 503 to every quote while it is unreadable.`);
    return null;
  }
  const live = unset ? 0n : BigInt(raw);
  if (live === agreed) pass(`relayer margin ${live} ${unit}${unset ? ` (${key} is unset, which means none)` : ""}, the agreed value`);
  else fix(`${key} is ${live} ${unit}, but the agreed margin is ${agreed} ${unit}. Change it in the Replit environment; nothing on the chain needs to change.`);
  return live;
}

console.log("DarkSwap shielded pool: deployment check (TESTNET)");
console.log(`deployments folder: ${DEPLOYMENTS}`);
const feeRecipients = new Map(); // EVM fee recipient per chain, to compare across chains

for (const chain of CHAINS) {
  console.log(`\n${chain.label}`);
  try {
    if (chain.kind === "evm") await checkEvm(chain);
    else await checkSolana(chain);
  } catch (err) {
    fix(`unexpected error while checking: ${err.message}`);
  }
}

const evmRecipients = [...feeRecipients.entries()].filter(([id]) => id !== "anvil");
if (evmRecipients.length === 2) {
  console.log("\nAcross chains");
  const [[a, ra], [b, rb]] = evmRecipients;
  if (isAddressEqual(ra, rb)) pass(`fee recipient is the same on ${a} and ${b}: ${ra}`);
  else fix(`fee recipient differs: ${a} has ${ra}, ${b} has ${rb}. It must be the same address on both EVM chains. The recipient is fixed, so the wrong chain must be deployed again with a new pool.`);
}

console.log();
if (fixes === 0) {
  console.log("All checks passed for the chains that are deployed. Chains marked WAIT are not deployed yet.");
  console.log("In Replit, GET /api/pool/chains should show live: true for each configured chain, and /pool should list them.");
} else {
  console.log(`${fixes} item${fixes === 1 ? "" : "s"} to fix (see the FIX lines above).`);
}
process.exit(fixes === 0 ? 0 : 1);

// ---- EVM ------------------------------------------------------------------------
async function checkEvm(chain) {
  const file = path.join(DEPLOYMENTS, `${chain.chainId}.json`);
  if (!fs.existsSync(file)) {
    wait(`not deployed yet: no ${show(file)}. The Deployer creates it with npm run deploy:evm and sends it over.`);
    return;
  }
  let dep;
  try { dep = JSON.parse(fs.readFileSync(file, "utf8")); } catch (err) { return fix(`${show(file)} is not valid JSON (${err.message}). Ask the Deployer for the file again.`); }
  pass(`deployment file found: ${show(file)}`);
  if (Number(dep.chainId) !== chain.chainId) {
    return fix(`the file says chainId ${dep.chainId}, but this is chain ${chain.chainId}. The server reports an error for this chain while this file is in place. The Deployer probably sent the file for the other chain; rename or replace it.`);
  }
  for (const field of ["pool", "verifier", "owner", "feeRecipient", "protocolFeeBps", "deployBlock"]) {
    if (dep[field] === undefined) return fix(`the file has no "${field}" field. It must come from Deploy.s.sol unchanged.`);
  }
  pass(`file is for chain id ${chain.chainId}; pool ${dep.pool}`);

  const url = process.env[`RPC_URL_${chain.envKey}`];
  if (!url) {
    fix(`RPC_URL_${chain.envKey} is not set. Add it as a secret in Replit (an RPC URL for ${chain.label}, for example from Alchemy or Infura). Without it the chain stays "No RPC configured."`);
    return;
  }
  const client = createPublicClient({ transport: http(url, { timeout: 15_000 }) });
  let liveChainId;
  try { liveChainId = await client.getChainId(); } catch (err) { return fix(`could not connect to RPC_URL_${chain.envKey} (${err.shortMessage ?? err.message}). Check the URL.`); }
  if (liveChainId !== chain.chainId) return fix(`RPC_URL_${chain.envKey} points at chain id ${liveChainId}, not ${chain.chainId}. It is the RPC for a different network.`);
  pass(`RPC reachable and on chain id ${liveChainId}`);

  const code = await client.getCode({ address: dep.pool });
  if (!code || code === "0x") return fix(`no contract at ${dep.pool} on ${chain.label}. The file may be from another network or an old anvil run.`);
  const read = (functionName, args = [], abi = poolAbi) => client.readContract({ address: dep.pool, abi, functionName, args });
  const [feeBps, feeRecipient, root, nextIndex, owner, pendingOwner, guardianExpiry] = await Promise.all([
    read("protocolFeeBps"), read("feeRecipient"), read("root"), read("nextIndex"),
    read("owner", [], ownerAbi), read("pendingOwner", [], ownerAbi), read("guardianExpiry", [], ownerAbi),
  ]);
  pass(`pool is live: ${nextIndex} notes so far, current root 0x${root.toString(16).padStart(64, "0").slice(0, 10)}…`);
  checkFeeRate(chain, feeBps, `the owner calls setProtocolFee: cast send ${dep.pool} 'setProtocolFee(uint16)' ${AGREED[chain.envKey]?.feeBps} --rpc-url $RPC_URL_${chain.envKey} --private-key <OWNER key>`);
  if (Number(feeBps) !== Number(dep.protocolFeeBps)) info(`note: the deployment file says ${dep.protocolFeeBps} bps. Only the live value above counts; the file is read for addresses.`);
  checkMargin(chain, "wei");
  pass(`fee recipient ${feeRecipient} (fixed forever)`);
  feeRecipients.set(chain.id, feeRecipient);
  if (!isAddressEqual(feeRecipient, dep.feeRecipient)) fix(`the file says feeRecipient ${dep.feeRecipient} but the contract says ${feeRecipient}. The file was edited or is from another deployment.`);
  if (isAddressEqual(feeRecipient, owner)) info(`note: the fee recipient is the owner wallet. Fine for a testnet; use a dedicated address for anything that matters.`);
  if (pendingOwner !== zeroAddress) {
    fix(`ownership has not been accepted: owner is still ${owner}, pending owner ${pendingOwner}. The intended owner must call acceptOwnership() on the pool once (cast send ${dep.pool} 'acceptOwnership()' ...). Until then the deployer wallet controls the pool.`);
  } else {
    pass(`owner ${owner}${isAddressEqual(owner, dep.owner) ? "" : ` (file says ${dep.owner})`}`);
  }
  const expiry = new Date(Number(guardianExpiry) * 1000);
  info(`guardian window (deposits can be paused) until ${expiry.toISOString().slice(0, 10)}${expiry < new Date() ? " - already over" : ""}`);

  const assets = [{ token: ETH, symbol: "ETH", decimals: 18 }];
  if (dep.token && !isAddressEqual(dep.token, zeroAddress)) {
    let symbol = "token", decimals = 18;
    try {
      [symbol, decimals] = await Promise.all([
        client.readContract({ address: dep.token, abi: erc20Abi, functionName: "symbol" }),
        client.readContract({ address: dep.token, abi: erc20Abi, functionName: "decimals" }),
      ]);
    } catch { /* keep defaults */ }
    assets.push({ token: dep.token, symbol, decimals: Number(decimals) });
  }
  for (const a of assets) {
    const [listed, depositsEnabled, minDeposit, maxDeposit, depositCap, balance] = await read("assets", [a.token]);
    if (!listed) { fix(`${a.symbol} (${a.token}) is not listed. The owner must call listAsset.`); continue; }
    pass(`${a.symbol} listed: min ${short(minDeposit, a.decimals, a.symbol)}, max ${short(maxDeposit, a.decimals, a.symbol)}, cap ${short(depositCap, a.decimals, a.symbol)}, holds ${short(balance, a.decimals, a.symbol)}${depositsEnabled ? "" : " - DEPOSITS OFF"}`);
    if (a.token !== ETH && !process.env[`POOL_RELAY_TOKEN_RATES_${chain.envKey}`]) {
      info(`note: POOL_RELAY_TOKEN_RATES_${chain.envKey} is not set, so the relayer will not accept ${a.symbol} fees. Users can still withdraw ${a.symbol} from their own wallet.`);
    }
  }

  const key = process.env.POOL_RELAYER_PRIVATE_KEY_EVM;
  if (!key) {
    wait(`POOL_RELAYER_PRIVATE_KEY_EVM is not set here, so the relayer balance was not checked. (In Replit, add it as a secret; the same key serves both EVM chains.)`);
    return;
  }
  let account;
  try { account = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`); } catch { return fix(`POOL_RELAYER_PRIVATE_KEY_EVM is not a valid private key (expect 0x + 64 hex characters).`); }
  if (isAddressEqual(account.address, feeRecipient)) fix(`the relayer wallet is the fee recipient (${account.address}). Use a separate throwaway key for relaying.`);
  if (isAddressEqual(account.address, owner)) fix(`the relayer wallet is the owner (${account.address}). Use a separate throwaway key for relaying.`);
  const bal = await client.getBalance({ address: account.address });
  const eth = Number(formatEther(bal));
  if (eth >= MIN_RELAYER_ETH) pass(`relayer ${account.address} holds ${eth.toFixed(4)} ETH`);
  else fix(`relayer ${account.address} holds ${eth.toFixed(4)} ETH; send it at least ${MIN_RELAYER_ETH} ${chain.label} ETH from a faucet (it pays gas for every relayed transaction).`);
}

// ---- Solana ---------------------------------------------------------------------
async function checkSolana(chain) {
  const raw = process.env[`POOL_PROGRAM_ID_${chain.cluster.toUpperCase()}`];
  if (!raw) {
    wait(`not deployed yet: POOL_PROGRAM_ID_${chain.cluster.toUpperCase()} is not set. The Deployer sends the program id after npm run setup:devnet; add it as a secret.`);
    return;
  }
  let programId;
  try { programId = new PublicKey(raw); } catch { return fix(`POOL_PROGRAM_ID_${chain.cluster.toUpperCase()} is not a valid Solana address: "${raw}".`); }
  pass(`program id ${programId.toBase58()}`);
  const url = process.env[`RPC_URL_${chain.envKey}`] ?? "https://api.devnet.solana.com";
  info(`rpc ${url}${process.env[`RPC_URL_${chain.envKey}`] ? "" : " (public default; set RPC_URL_SOLANA_DEVNET for a private one)"}`);
  const connection = new Connection(url, "confirmed");
  try { await connection.getGenesisHash(); } catch (err) { return fix(`could not connect to ${url} (${err.message}).`); }
  pass("RPC reachable");

  const program = await connection.getAccountInfo(programId, "confirmed");
  if (!program?.executable) return fix(`no program at ${programId.toBase58()} on this cluster. Check the id, or that the RPC is devnet.`);
  const P = pdas(programId);
  const poolInfo = await connection.getAccountInfo(P.pool, "confirmed");
  if (!poolInfo) return fix(`the program exists but the pool is not initialized. The Deployer runs: npm run setup:devnet -- --program ${programId.toBase58()} --authority <keypair> --fee-recipient <pubkey>`);
  const pool = await readPool(connection, programId);
  const admin = new PublicKey(poolInfo.data.subarray(8, 40));
  const expiry = new Date(Number(poolInfo.data.readBigInt64LE(40)) * 1000);
  pass(`pool is live: ${pool.nextIndex} notes so far, current root 0x${pool.root.toString(16).padStart(64, "0").slice(0, 10)}…${pool.paused ? " - PAUSED" : ""}`);
  checkFeeRate(chain, pool.feeBps, `the admin sends set_fee (instruction 7) with ${AGREED[chain.envKey]?.feeBps} from the authority keypair.`);
  const marginLamports = checkMargin(chain, "lamports");
  if (marginLamports !== null) {
    // The same arithmetic the relayer quotes with, so the operator can compare
    // this against GET /api/pool/solana-devnet/relay. Rent is read live because
    // the cluster's rate decides the figure, not a number written down here.
    const rent = BigInt(await connection.getMinimumBalanceForRentExemption(0));
    const quote = LAMPORTS_PER_SIGNATURE + 2n * rent + marginLamports;
    info(`relayer quote per relayed unshield: ${quote.toLocaleString("en-US")} lamports (${Number(quote) / LAMPORTS_PER_SOL} SOL) = ${LAMPORTS_PER_SIGNATURE.toLocaleString("en-US")} signature + 2 x ${rent.toLocaleString("en-US")} nullifier rent + ${marginLamports.toLocaleString("en-US")} margin. GET /api/pool/${chain.id}/relay must return this fee.`);
  }
  pass(`fee recipient ${pool.feeRecipient.toBase58()} (fixed forever)`);
  info(`admin ${admin.toBase58()}; guardian window until ${expiry.toISOString().slice(0, 10)}${expiry < new Date() ? " - already over" : ""}`);

  const solAsset = await readAsset(connection, programId, SOL_MINT);
  const lam = (n) => `${Number(n) / LAMPORTS_PER_SOL} SOL`;
  if (!solAsset) fix(`SOL is not listed. Run npm run setup:devnet again (it lists SOL and skips what is done).`);
  else pass(`SOL listed: min ${lam(solAsset.minDeposit)}, max ${lam(solAsset.maxDeposit)}, cap ${lam(solAsset.cap)}, holds ${lam(solAsset.balance)}${solAsset.enabled ? "" : " - DEPOSITS OFF"}`);
  const rates = process.env[`POOL_RELAY_TOKEN_RATES_${chain.envKey}`];
  if (rates) {
    let parsed = null;
    try { parsed = JSON.parse(rates); } catch { fix(`POOL_RELAY_TOKEN_RATES_${chain.envKey} is not valid JSON.`); }
    for (const mint of Object.keys(parsed ?? {})) {
      const asset = await readAsset(connection, programId, new PublicKey(mint));
      if (asset) pass(`token ${mint} listed (${asset.decimals} decimals), relayer rate set`);
      else fix(`POOL_RELAY_TOKEN_RATES_${chain.envKey} names ${mint}, which is not listed in the pool.`);
    }
  }

  const keyRaw = process.env.POOL_RELAYER_KEYPAIR_SOLANA;
  if (!keyRaw) {
    wait(`POOL_RELAYER_KEYPAIR_SOLANA is not set here, so the relayer balance was not checked. (In Replit, add it as a secret: the JSON array of 64 numbers from the keypair file.)`);
    return;
  }
  let keypair;
  try { keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(keyRaw))); } catch { return fix(`POOL_RELAYER_KEYPAIR_SOLANA is not a keypair: expect a JSON array of 64 numbers, exactly the contents of the .json file solana-keygen wrote.`); }
  if (keypair.publicKey.equals(pool.feeRecipient)) fix(`the relayer wallet is the fee recipient. Use a separate throwaway keypair for relaying.`);
  if (keypair.publicKey.equals(admin)) fix(`the relayer wallet is the pool admin (upgrade authority). Use a separate throwaway keypair for relaying.`);
  const bal = (await connection.getBalance(keypair.publicKey, "confirmed")) / LAMPORTS_PER_SOL;
  if (bal >= MIN_RELAYER_SOL) pass(`relayer ${keypair.publicKey.toBase58()} holds ${bal.toFixed(4)} SOL`);
  else fix(`relayer ${keypair.publicKey.toBase58()} holds ${bal.toFixed(4)} SOL; send it at least ${MIN_RELAYER_SOL} devnet SOL (solana airdrop 2 <address> --url devnet, or https://faucet.solana.com). It pays fees and nullifier rent for every relayed transaction.`);
}
