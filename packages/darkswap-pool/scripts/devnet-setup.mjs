// Sets up the DarkSwap shielded pool on Solana devnet (TESTNET) after
// `solana program deploy`: sends `initialize`, lists SOL, optionally creates
// and lists a 6-decimal test token, and prints the block to send back to the
// Replit owner. Safe to run again: steps already done are reported, not redone.
//
//   node scripts/devnet-setup.mjs --program <PROGRAM_ID> --authority <upgrade-authority.json> \
//        --fee-recipient <PUBKEY> [--rpc https://api.devnet.solana.com] [--fee-bps 50] \
//        [--guardian-days 30] [--sol-min 0.01 --sol-max 5 --sol-cap 50] \
//        [--test-token | --test-token <MINT>] [--dry-run]
//   npm run setup:devnet -- --program ... --authority ... --fee-recipient ...
//
// Runs on the Deployer's machine (devnet is not reachable from the Replit
// Solana toolchain). --dry-run reads the chain but sends nothing, and prints
// the instructions it would send. The upgrade-authority key never leaves the
// machine: only its public key is printed.
import fs from "node:fs";
import path from "node:path";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { createMint, getAccount, getAssociatedTokenAddressSync, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { ensureClientDeps, PKG } from "./kit-preflight.mjs";

ensureClientDeps(); // explains a missing `npm install` instead of crashing on the import below
const { initializeIx, listAssetIx, readPool, readAsset, pdas, computeBudget, SOL_MINT, BPF_UPGRADEABLE } = await import("./solana.mjs");

// ---- arguments --------------------------------------------------------------------
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = args[i + 1];
  return v === undefined || v.startsWith("--") ? true : v;
};
const usage = (msg) => {
  console.error(`\n${msg}\n\nUsage:\n  node scripts/devnet-setup.mjs --program <PROGRAM_ID> --authority <upgrade-authority.json> --fee-recipient <PUBKEY>\n      [--rpc URL] [--fee-bps 50] [--guardian-days 30] [--sol-min 0.01] [--sol-max 5] [--sol-cap 50]\n      [--test-token | --test-token <MINT>] [--dry-run]\n`);
  process.exit(2);
};
const DRY = args.includes("--dry-run");
const asInt = (name, fallback) => {
  const raw = opt(name, fallback);
  if (!/^\d+$/.test(String(raw))) usage(`--${name} must be a whole number (got "${raw}").`);
  return Number(raw);
};
const asSol = (name, fallback) => {
  const raw = String(opt(name, fallback));
  if (!/^\d+(\.\d+)?$/.test(raw)) usage(`--${name} must be a number of SOL (got "${raw}").`);
  const [whole, frac = ""] = raw.split(".");
  return BigInt(whole + frac.padEnd(9, "0").slice(0, 9));
};

const programArg = opt("program");
const authorityArg = opt("authority");
const feeRecipientArg = opt("fee-recipient");
if (!programArg || programArg === true) usage("--program <PROGRAM_ID> is required (printed by `solana program deploy`).");
if (!authorityArg || authorityArg === true) usage("--authority <path to upgrade-authority keypair .json> is required.");
if (!feeRecipientArg || feeRecipientArg === true) usage("--fee-recipient <PUBKEY> is required. It is fixed forever, so the script does not guess it.");

let programId, feeRecipient;
try { programId = new PublicKey(programArg); } catch { usage(`--program "${programArg}" is not a valid Solana address.`); }
try { feeRecipient = new PublicKey(feeRecipientArg); } catch { usage(`--fee-recipient "${feeRecipientArg}" is not a valid Solana address.`); }
if (!fs.existsSync(authorityArg)) usage(`Keypair file not found: ${authorityArg}`);
let authority;
try { authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(authorityArg, "utf8")))); }
catch { usage(`${authorityArg} is not a Solana keypair file (a JSON array of 64 numbers).`); }
if (feeRecipient.equals(authority.publicKey)) usage("The fee recipient is the upgrade-authority wallet. Use a separate long-term wallet: the fee recipient cannot be changed later.");

const feeBps = asInt("fee-bps", 50);
if (feeBps > 100) usage("--fee-bps must be 100 (1%) or less.");
const guardianDays = asInt("guardian-days", 30);
const solMin = asSol("sol-min", "0.01");
const solMax = asSol("sol-max", "5");
const solCap = asSol("sol-cap", "50");
if (!(solMin <= solMax && solMax <= solCap)) usage("Need --sol-min <= --sol-max <= --sol-cap.");
const testTokenArg = opt("test-token", null);
const rpcUrl = String(opt("rpc", process.env.RPC_URL ?? "https://api.devnet.solana.com"));

const connection = new Connection(rpcUrl, "confirmed");
const P = pdas(programId);
const sol = (lamports) => `${(Number(lamports) / LAMPORTS_PER_SOL).toLocaleString("en-US", { maximumFractionDigits: 9 })} SOL`;
const log = (s = "") => console.log(s);
const done = (s) => log(`  DONE    ${s}`);
const todo = (s) => log(`  ${DRY ? "WOULD   " : "SENDING "}${s}`);
const fixAndExit = (s) => { console.error(`\n  FIX     ${s}\n`); process.exit(1); };
// In a dry run, a check that would stop the real run is reported and the preview continues.
const fixOrPreview = (s) => { if (!DRY) fixAndExit(s); console.error(`  FIX     ${s}\n          (dry run: continuing so you can preview the rest)`); };

log(`DarkSwap shielded pool: Solana devnet setup (TESTNET)${DRY ? " - DRY RUN, nothing will be sent" : ""}`);
log(`  rpc        ${rpcUrl}`);
log(`  program    ${programId.toBase58()}`);
log(`  authority  ${authority.publicKey.toBase58()} (public key only)`);
log();

// ---- checks before sending --------------------------------------------------------
let genesis;
try { genesis = await connection.getGenesisHash(); } catch (err) { fixAndExit(`Could not reach the RPC at ${rpcUrl} (${err.message}). Check the URL and your connection.`); }
const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
if (genesis === MAINNET_GENESIS) fixAndExit("This RPC is Solana MAINNET. This kit is for testnet only. Use https://api.devnet.solana.com.");
const cluster = genesis === DEVNET_GENESIS ? "devnet" : "a local or other cluster";
log(`  cluster    ${cluster}`);

const program = await connection.getAccountInfo(programId, "confirmed");
if (!program) fixOrPreview(`No program at ${programId.toBase58()} on ${cluster}. Run \`solana program deploy\` first, or check the program id and --rpc.`);
else if (!program.executable) fixOrPreview(`${programId.toBase58()} is not an executable program.`);
else {
  const programData = await connection.getAccountInfo(P.programData, "confirmed");
  if (!programData || !programData.owner.equals(BPF_UPGRADEABLE)) fixOrPreview("The program is not an upgradeable program; the pool requires one (the default for `solana program deploy`).");
  else {
    const hasAuthority = programData.data[12] === 1;
    const upgradeAuthority = hasAuthority ? new PublicKey(programData.data.subarray(13, 45)) : null;
    if (!upgradeAuthority || !upgradeAuthority.equals(authority.publicKey)) {
      fixOrPreview(`The program's upgrade authority is ${upgradeAuthority ? upgradeAuthority.toBase58() : "removed"}, not ${authority.publicKey.toBase58()}. Only the upgrade authority can initialize. Pass the keypair you deployed with (--authority).`);
    } else done("program found; the keypair is its upgrade authority");
  }
}

const balance = await connection.getBalance(authority.publicKey, "confirmed");
const poolRent = await connection.getMinimumBalanceForRentExemption(await poolAccountSize());
const NEEDED = poolRent + 20_000_000; // pool account rent + asset accounts, vaults and fees
log(`  balance    ${sol(balance)} (about ${sol(NEEDED)} needed for the pool account and listings)`);
if (balance < NEEDED && !DRY) fixAndExit(`The authority wallet needs about ${sol(NEEDED)}. Fund it: \`solana airdrop 2 ${authority.publicKey.toBase58()} --url devnet\` or https://faucet.solana.com (the faucet limits how much you get per day).`);

async function poolAccountSize() {
  // Pool account = 88-byte header + tree state (24-byte counters, 26 filled
  // subtrees, 27 zero hashes, 256 historic roots), as the program lays it out.
  // Read from the chain when it already exists.
  const info = await connection.getAccountInfo(P.pool, "confirmed");
  if (info) return info.data.length;
  return 88 + 24 + 26 * 32 + 27 * 32 + 256 * 32;
}

// ---- 1. initialize ------------------------------------------------------------------
log();
log("Step 1: initialize the pool");
const existing = await connection.getAccountInfo(P.pool, "confirmed");
let pool;
if (existing) {
  pool = await readPool(connection, programId);
  const admin = new PublicKey(existing.data.subarray(8, 40));
  const expiry = Number(existing.data.readBigInt64LE(40));
  done(`already initialized: fee ${pool.feeBps} bps, fee recipient ${pool.feeRecipient.toBase58()}, admin ${admin.toBase58()}, guardian window until ${new Date(expiry * 1000).toISOString().slice(0, 10)}`);
  if (pool.feeBps !== feeBps) log(`  NOTE    the live fee is ${pool.feeBps} bps, not the ${feeBps} bps you asked for. The admin can change it with set_fee; this script does not.`);
  if (!pool.feeRecipient.equals(feeRecipient)) log(`  NOTE    the live fee recipient is ${pool.feeRecipient.toBase58()}, not ${feeRecipient.toBase58()}. It cannot be changed. If this is wrong, deploy a new program id.`);
} else {
  const expiry = Math.floor(Date.now() / 1000) + guardianDays * 86400;
  const ix = initializeIx(programId, authority.publicKey, expiry, feeRecipient, feeBps);
  todo(`initialize: admin ${authority.publicKey.toBase58()}, fee ${feeBps} bps, fee recipient ${feeRecipient.toBase58()}, guardian window ${guardianDays} days`);
  await sendOrPrint("initialize", ix);
  pool = DRY ? { feeBps, feeRecipient, nextIndex: 0, root: 0n } : await readPool(connection, programId);
}

// ---- 2. list SOL --------------------------------------------------------------------
log();
log("Step 2: list SOL");
const listed = [];
async function ensureListed(label, mint, min, max, cap, unit) {
  const asset = await readAsset(connection, programId, mint);
  if (asset) {
    done(`${label} already listed: min ${unit(asset.minDeposit)}, max ${unit(asset.maxDeposit)}, cap ${unit(asset.cap)}${asset.enabled ? "" : " (deposits OFF)"}`);
    listed.push({ label, mint, min: asset.minDeposit, max: asset.maxDeposit, cap: asset.cap, unit, enabled: asset.enabled });
    return;
  }
  todo(`list ${label}: min ${unit(min)}, max ${unit(max)}, cap ${unit(cap)}`);
  await sendOrPrint(`list_asset ${label}`, listAssetIx(programId, authority.publicKey, mint, min, max, cap));
  listed.push({ label, mint, min, max, cap, unit, enabled: true });
}
await ensureListed("SOL", SOL_MINT, solMin, solMax, solCap, sol);

// ---- 3. optional test token ---------------------------------------------------------
let tokenMint = null;
if (testTokenArg !== null) {
  log();
  log("Step 3: test token (6 decimals)");
  const tokens = (base) => `${(Number(base) / 1e6).toLocaleString("en-US")} tTEST`;
  if (testTokenArg === true) {
    // The mint's keypair is saved under .keys/ (git-ignored) before anything is
    // sent, so a re-run or a run that stopped halfway finds the same mint
    // instead of creating a second one.
    const mintFile = path.join(process.env.POOL_KEYS_DIR ?? path.join(PKG, ".keys"), `test-mint-${programId.toBase58()}.json`);
    let mintKeypair = null;
    if (fs.existsSync(mintFile)) {
      try { mintKeypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(mintFile, "utf8")))); }
      catch { fixAndExit(`${mintFile} exists but is not a keypair file. Move it away, or pass the mint address with --test-token <MINT>.`); }
      done(`reusing the saved test-mint keypair ${mintFile} (mint ${mintKeypair.publicKey.toBase58()})`);
    }
    const MINT_AMOUNT = 1_000_000_000_000n; // 1,000,000 tTEST at 6 decimals
    if (DRY) {
      if (mintKeypair) {
        tokenMint = mintKeypair.publicKey;
        const onChain = await connection.getAccountInfo(tokenMint, "confirmed");
        log(onChain ? `  DONE    mint ${tokenMint.toBase58()} exists on chain` : `  WOULD   create mint ${tokenMint.toBase58()} (6 decimals, authority = upgrade authority) and mint 1,000,000 tTEST to the authority`);
      } else {
        log(`  WOULD   create a new 6-decimal mint, save its keypair to ${mintFile}, mint 1,000,000 tTEST to the authority, then list it`);
      }
    } else {
      if (!mintKeypair) {
        mintKeypair = Keypair.generate();
        fs.mkdirSync(path.dirname(mintFile), { recursive: true });
        fs.writeFileSync(mintFile, JSON.stringify(Array.from(mintKeypair.secretKey)), { mode: 0o600 });
        log(`  SAVED   test-mint keypair ${mintFile} (keep it; re-runs reuse it)`);
      }
      tokenMint = mintKeypair.publicKey;
      const onChain = await connection.getAccountInfo(tokenMint, "confirmed");
      if (onChain) done(`mint ${tokenMint.toBase58()} already exists on chain`);
      else {
        try { await createMint(connection, authority, authority.publicKey, null, 6, mintKeypair); }
        catch (err) { fixAndExit(`creating the test mint failed: ${err.message}. Run again; the saved keypair is reused.`); }
        done(`created mint ${tokenMint.toBase58()}`);
      }
      const ataAddress = getAssociatedTokenAddressSync(tokenMint, authority.publicKey);
      let held = 0n;
      try { held = (await getAccount(connection, ataAddress, "confirmed")).amount; } catch { /* no token account yet */ }
      if (held > 0n) done(`authority already holds ${(Number(held) / 1e6).toLocaleString("en-US")} tTEST`);
      else {
        const ata = await getOrCreateAssociatedTokenAccount(connection, authority, tokenMint, authority.publicKey);
        await mintTo(connection, authority, tokenMint, ata.address, authority, MINT_AMOUNT);
        done(`minted 1,000,000 tTEST to ${authority.publicKey.toBase58()} (hand these out for testing)`);
      }
    }
  } else {
    try { tokenMint = new PublicKey(testTokenArg); } catch { usage(`--test-token "${testTokenArg}" is not a valid mint address.`); }
    const mintInfo = await connection.getAccountInfo(tokenMint, "confirmed");
    if (!mintInfo) fixAndExit(`No token mint at ${tokenMint.toBase58()} on ${cluster}.`);
    done(`using existing mint ${tokenMint.toBase58()}`);
  }
  if (tokenMint) await ensureListed("tTEST", tokenMint, 1_000_000n, 100_000_000_000n, 1_000_000_000_000n, tokens);
}

// ---- handoff block ------------------------------------------------------------------
log();
log("==============================================================");
log(DRY ? " DRY RUN: this is what the handoff block will look like" : " Done. Send this block to the Replit owner:");
log("==============================================================");
log(` Chain            Solana devnet (TESTNET)`);
log(` Program ID       ${programId.toBase58()}`);
log(` Pool account     ${P.pool.toBase58()}`);
log(` Admin            ${authority.publicKey.toBase58()}`);
log(` Fee rate         ${pool.feeBps} bps (${(pool.feeBps / 100).toFixed(2)}%)`);
log(` Fee recipient    ${pool.feeRecipient.toBase58()} (fixed forever)`);
log(` Listed assets`);
for (const a of listed) {
  log(`   - ${a.label.padEnd(6)} ${a.mint.equals(SOL_MINT) ? "(native)" : a.mint.toBase58()}  min ${a.unit(a.min)}, max ${a.unit(a.max)}, cap ${a.unit(a.cap)}${a.enabled ? "" : "  deposits OFF"}`);
}
log(` Replit secret    POOL_PROGRAM_ID_DEVNET=${programId.toBase58()}`);
if (tokenMint) log(` Optional secret  POOL_RELAY_TOKEN_RATES_SOLANA_DEVNET={"${tokenMint.toBase58()}":"150"}   (tTEST per 1 SOL; any test rate)`);
log("==============================================================");
log(DRY ? "Run again without --dry-run to send." : "Then run:  npm run check:deployment  (with POOL_PROGRAM_ID_DEVNET set)");
process.exit(0);

// ---- helpers ------------------------------------------------------------------------
async function sendOrPrint(name, ix) {
  if (DRY) {
    log(`          instruction ${name}: program ${ix.programId.toBase58()}, data 0x${Buffer.from(ix.data).toString("hex")}`);
    for (const k of ix.keys) log(`            ${k.isSigner ? "signer " : "       "}${k.isWritable ? "write " : "read  "}${k.pubkey.toBase58()}`);
    return null;
  }
  const tx = new Transaction().add(computeBudget(), ix);
  try {
    const sig = await sendAndConfirmTransaction(connection, tx, [authority], { commitment: "confirmed" });
    done(`${name} confirmed: ${sig}`);
    return sig;
  } catch (err) {
    const logs = err.logs ? `\n          ${err.logs.join("\n          ")}` : "";
    fixAndExit(`${name} failed: ${err.message}${logs}\n          If the message says insufficient funds, fund the authority wallet and run again. Steps already done are kept.`);
  }
}
