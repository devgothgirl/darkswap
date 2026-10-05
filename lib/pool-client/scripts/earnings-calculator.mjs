#!/usr/bin/env node
// Pool earnings calculator (TESTNET planning tool, no network access).
//
// Projects what the shielded pool and its relayer would collect per month
// under several fee models, using the same arithmetic the pool and relayer
// actually run:
//   - protocol fee: `protocolFeeOn` from the client package (rounds up, so no
//     shield or unshield pays zero), charged on shield (on top) and on
//     unshield (out of the payout), never on a private send;
//   - relayer quote, EVM:    EVM_TRANSACT_GAS * gasPrice * 1.2 + margin
//   - relayer quote, Solana: LAMPORTS_PER_SIGNATURE + 2 * rent + margin
//     (one signature plus two nullifier accounts the relayer must fund).
// The quote comes from src/relayer-fees.js, the one definition the relayer
// (artifacts/api-server/src/lib/pool/relayer.ts) and the volume exporter
// (.../volumes.ts) also use; test/earnings-calculator.test.mjs fails if a
// caller stops sharing it.
//
// Usage:
//   node scripts/earnings-calculator.mjs [--config file.json] [--flag value ...]
//   node scripts/earnings-calculator.mjs --help
//
// Every number here is a projection from the inputs you give it. It is not a
// revenue claim for any live deployment.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { protocolFeeOn } from "../src/wallet.js";
import {
  EVM_TRANSACT_GAS, LAMPORTS_PER_SIGNATURE, SOLANA_NULLIFIER_ACCOUNTS,
  evmRelayerQuote, solanaRelayerQuote,
} from "../src/relayer-fees.js";

// ---- relayer constants ------------------------------------------------------
// The quote's own numbers are re-exported from src/relayer-fees.js so there is
// one definition; what follows is measured cost, which only this tool uses.
export { EVM_TRANSACT_GAS, LAMPORTS_PER_SIGNATURE, SOLANA_NULLIFIER_ACCOUNTS };
// Measured gas from packages/darkswap-pool/fixtures/e2e-evm-result.json; what
// the relayer actually spends, as opposed to what it quotes.
export const EVM_MEASURED_UNSHIELD_GAS = 1_393_105n;
export const EVM_MEASURED_SEND_GAS = 1_324_636n;
export const MAX_PROTOCOL_FEE_BPS = 100; // DarkPool.sol MAX_PROTOCOL_FEE_BPS

// ---- presets ----------------------------------------------------------------
// inBps / outBps are what each model would look like expressed through this
// pool's two levers. `margin` (whole native coins) overrides --margin for the
// preset; used where a competitor charges a flat per-withdrawal fee.
export const PRESETS = {
  ours: { label: "Ours (50 in / 50 out)", inBps: 50, outBps: 50 },
  nullmask: { label: "Nullmask (50 / 50)", inBps: 50, outBps: 50 },
  railgun: { label: "Railgun (25 / 25)", inBps: 25, outBps: 25 },
  privacycash: { label: "Privacy Cash (0 / 35 + flat)", inBps: 0, outBps: 35, flatOut: { evm: 0.00025, solana: 0.006 } },
  umbra: { label: "Umbra (0 / ~21)", inBps: 0, outBps: 21 },
  darkpool: { label: "DARKPOOL (0 / 0, swap fee only)", inBps: 0, outBps: 0 },
  tornado: { label: "Tornado relayer-only (0 / 0)", inBps: 0, outBps: 0 },
  cap: { label: "Contract cap (100 / 100)", inBps: 100, outBps: 100 },
};

export const DEFAULTS = {
  chain: "evm", // evm | solana
  shieldVolumeUsd: 1_000_000, // monthly
  unshieldVolumeUsd: 1_000_000, // monthly
  avgSizeUsd: 500, // typical shield / unshield; or give shieldCount / unshieldCount
  shieldCount: undefined,
  unshieldCount: undefined,
  sendCount: 0, // monthly private sends the relayer pays for (no fee)
  relayedShare: 1, // fraction of unshields that go through the relayer
  priceUsd: 2670, // native coin price (ETH or SOL)
  gasPriceGwei: 0.13, // EVM only
  rentLamports: 890_880, // Solana rent for a 0-byte account (relayer uses getMinimumBalanceForRentExemption(0))
  signatureLamports: Number(LAMPORTS_PER_SIGNATURE), // Solana; the relayer's own quote
  margin: 0, // relayer margin, whole native coins (POOL_RELAY_MIN_FEE_<CHAIN> is the same in wei / lamports)
  models: Object.keys(PRESETS),
  sweepStep: 5,
  csv: undefined,
  json: false,
};

const DECIMALS = { evm: 18, solana: 9 };

// ---- helpers ----------------------------------------------------------------
const pow10 = (n) => 10n ** BigInt(n);

/** Whole-coin amount (number) -> base units (bigint), rounded to nearest. */
export function toBase(whole, decimals) {
  const s = Number(whole).toFixed(decimals);
  const [i, f = ""] = s.split(".");
  return BigInt(i + f.padEnd(decimals, "0"));
}
/** USD -> base units of the native coin at `priceUsd`. */
export const usdToBase = (usd, priceUsd, decimals) => toBase(usd / priceUsd, decimals);
/** base units -> USD (number). */
export const baseToUsd = (base, priceUsd, decimals) => (Number(base) / Number(pow10(decimals))) * priceUsd;

/** What the relayer quotes for one relayed unshield, in base units. */
export function relayerQuote(cfg, marginBase) {
  if (cfg.chain === "evm") return evmRelayerQuote(toBase(cfg.gasPriceGwei, 9), marginBase);
  return solanaRelayerQuote(cfg.rentLamports, marginBase, cfg.signatureLamports);
}

/** What one relayed transaction actually costs the relayer, in base units. */
export function relayerCost(cfg, kind) {
  if (cfg.chain === "evm") {
    const gasPrice = toBase(cfg.gasPriceGwei, 9);
    return (kind === "send" ? EVM_MEASURED_SEND_GAS : EVM_MEASURED_UNSHIELD_GAS) * gasPrice;
  }
  // Both a send and an unshield spend notes, so both create nullifier accounts:
  // the relayer's cost is the quote without the margin.
  return solanaRelayerQuote(cfg.rentLamports, 0n, cfg.signatureLamports);
}

/** Monthly counts: explicit if given, else volume / typical size; zero volume means zero transactions. */
function counts(cfg) {
  const derive = (volume) => (volume > 0 ? Math.max(1, Math.round(volume / cfg.avgSizeUsd)) : 0);
  const shieldCount = cfg.shieldCount ?? derive(cfg.shieldVolumeUsd);
  const unshieldCount = cfg.unshieldCount ?? derive(cfg.unshieldVolumeUsd);
  return { shieldCount, unshieldCount };
}

/** Size of one transaction in base units; zero when there are none. */
const sizeOf = (volumeUsd, count, priceUsd, decimals) => (count > 0 ? usdToBase(volumeUsd / count, priceUsd, decimals) : 0n);

/**
 * One model's monthly projection. All money fields are bigint base units of
 * the native coin; `*Usd` fields are numbers for display.
 */
export function projectModel(cfg, model) {
  const decimals = DECIMALS[cfg.chain];
  const { shieldCount, unshieldCount } = counts(cfg);
  const shieldSize = sizeOf(cfg.shieldVolumeUsd, shieldCount, cfg.priceUsd, decimals);
  const unshieldSize = sizeOf(cfg.unshieldVolumeUsd, unshieldCount, cfg.priceUsd, decimals);

  const flat = model.flatOut?.[cfg.chain] ?? 0;
  const marginBase = toBase(model.margin ?? cfg.margin, decimals) + toBase(flat, decimals);

  const feeIn = protocolFeeOn(shieldSize, model.inBps) * BigInt(shieldCount);
  const feeOut = protocolFeeOn(unshieldSize, model.outBps) * BigInt(unshieldCount);
  const protocolFees = feeIn + feeOut;

  const relayed = Math.round(unshieldCount * cfg.relayedShare);
  const quote = relayerQuote(cfg, marginBase);
  const relayerFees = quote * BigInt(relayed);
  const relayerCostTotal = relayerCost(cfg, "unshield") * BigInt(relayed) + relayerCost(cfg, "send") * BigInt(cfg.sendCount);
  const relayerNet = relayerFees - relayerCostTotal;

  // One user, typical size, in and back out through the relayer.
  const typical = usdToBase(cfg.avgSizeUsd, cfg.priceUsd, decimals);
  const userIn = protocolFeeOn(typical, model.inBps);
  const userOutFee = protocolFeeOn(typical, model.outBps);
  const userOut = userOutFee + quote;
  const userTotal = userIn + userOut;

  const usd = (b) => baseToUsd(b, cfg.priceUsd, decimals);
  return {
    key: model.key, label: model.label, inBps: model.inBps, outBps: model.outBps,
    shieldCount, unshieldCount, relayed,
    feeIn, feeOut, protocolFees, relayerFees, relayerCost: relayerCostTotal, relayerNet,
    total: protocolFees + relayerNet,
    userIn, userOut, userTotal, relayerQuote: quote,
    usd: {
      feeIn: usd(feeIn), feeOut: usd(feeOut), protocolFees: usd(protocolFees),
      relayerFees: usd(relayerFees), relayerCost: usd(relayerCostTotal), relayerNet: usd(relayerNet),
      total: usd(protocolFees + relayerNet),
      userIn: usd(userIn), userOut: usd(userOut), userTotal: usd(userTotal), relayerQuote: usd(quote),
      userTotalPct: (usd(userTotal) / cfg.avgSizeUsd) * 100,
    },
  };
}

export function projectAll(cfg) {
  const models = cfg.models.map((k) => {
    const p = PRESETS[k];
    if (!p) throw new Error(`Unknown model "${k}". Known: ${Object.keys(PRESETS).join(", ")}`);
    return { key: k, ...p };
  });
  return models.map((m) => projectModel(cfg, m));
}

/** Symmetric sweep: the same rate in and out, 0..MAX_PROTOCOL_FEE_BPS. */
export function sweep(cfg) {
  const rows = [];
  for (let bps = 0; bps <= MAX_PROTOCOL_FEE_BPS; bps += cfg.sweepStep) {
    const r = projectModel(cfg, { key: `sweep-${bps}`, label: `${bps} bps`, inBps: bps, outBps: bps });
    rows.push({ bps, protocolFeesUsd: r.usd.protocolFees, totalUsd: r.usd.total, userTotalUsd: r.usd.userTotal, userTotalPct: r.usd.userTotalPct });
  }
  if (rows.at(-1)?.bps !== MAX_PROTOCOL_FEE_BPS) {
    const r = projectModel(cfg, { key: "sweep-cap", label: "cap", inBps: MAX_PROTOCOL_FEE_BPS, outBps: MAX_PROTOCOL_FEE_BPS });
    rows.push({ bps: MAX_PROTOCOL_FEE_BPS, protocolFeesUsd: r.usd.protocolFees, totalUsd: r.usd.total, userTotalUsd: r.usd.userTotal, userTotalPct: r.usd.userTotalPct });
  }
  return rows;
}

// ---- input ------------------------------------------------------------------
const NUMERIC = new Set(["shieldVolumeUsd", "unshieldVolumeUsd", "avgSizeUsd", "shieldCount", "unshieldCount", "sendCount", "relayedShare", "priceUsd", "gasPriceGwei", "rentLamports", "signatureLamports", "margin", "sweepStep"]);
const COUNTS = new Set(["shieldCount", "unshieldCount", "sendCount"]);
const kebabToCamel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new Error(`Unexpected argument "${a}"`);
    const [rawKey, inlineVal] = a.slice(2).split("=", 2);
    const key = kebabToCamel(rawKey);
    if (key === "help") { out.help = true; continue; }
    if (key === "json") { out.json = true; continue; }
    const val = inlineVal ?? argv[++i];
    if (val === undefined) throw new Error(`--${rawKey} needs a value`);
    if (key === "models") out.models = val.split(",").map((s) => s.trim()).filter(Boolean);
    else if (NUMERIC.has(key)) {
      const n = Number(val);
      if (!Number.isFinite(n) || n < 0) throw new Error(`--${rawKey} must be a non-negative number`);
      out[key] = n;
    } else out[key] = val;
  }
  return out;
}

export function resolveConfig(flags) {
  let fileCfg = {};
  if (flags.config) fileCfg = JSON.parse(fs.readFileSync(flags.config, "utf8"));
  const cfg = { ...DEFAULTS, ...fileCfg, ...flags };
  if (!DECIMALS[cfg.chain]) throw new Error(`--chain must be evm or solana`);
  for (const key of NUMERIC) {
    const v = cfg[key];
    if (v === undefined) continue;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new Error(`${key} must be a non-negative number`);
    if (COUNTS.has(key) && !Number.isInteger(v)) throw new Error(`${key} must be a whole number of transactions`);
  }
  if (cfg.priceUsd <= 0) throw new Error("--price-usd must be positive");
  if (cfg.avgSizeUsd <= 0) throw new Error("--avg-size-usd must be positive");
  if (cfg.relayedShare > 1) throw new Error("--relayed-share is a fraction between 0 and 1");
  if (!Number.isInteger(cfg.sweepStep) || cfg.sweepStep < 1) throw new Error("--sweep-step must be a whole number of bps");
  return cfg;
}

// ---- output -----------------------------------------------------------------
const fmtUsd = (n) => {
  if (n === 0) return "$0";
  const abs = Math.abs(n);
  const s = abs >= 1000 ? abs.toLocaleString("en-US", { maximumFractionDigits: 0 }) : abs.toFixed(abs >= 1 ? 2 : 4);
  return (n < 0 ? "-$" : "$") + s;
};
const pct = (n) => `${n.toFixed(2)}%`;

export function table(headers, rows) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padStart(widths[i])).join("  ");
  return [line(headers), widths.map((w) => "-".repeat(w)).join("  "), ...rows.map(line)].join("\n");
}

export function csvEscape(v) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const csvCell = (v) => csvEscape(typeof v === "number" && !Number.isInteger(v) ? Number(v.toFixed(6)) : v);
const csv = (headers, rows) => [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";

export function render(cfg, results, sweepRows) {
  const unit = cfg.chain === "evm" ? "ETH" : "SOL";
  const { shieldCount, unshieldCount } = counts(cfg);
  const lines = [];
  lines.push(`TESTNET planning projection, not a revenue claim. Chain: ${cfg.chain}. Prices and volumes are your inputs.`);
  lines.push(`Monthly: shield ${fmtUsd(cfg.shieldVolumeUsd)} in ${shieldCount} tx, unshield ${fmtUsd(cfg.unshieldVolumeUsd)} in ${unshieldCount} tx` +
    ` (${Math.round(unshieldCount * cfg.relayedShare)} relayed), ${cfg.sendCount} free private sends. Typical size ${fmtUsd(cfg.avgSizeUsd)}.`);
  lines.push(cfg.chain === "evm"
    ? `${unit} ${fmtUsd(cfg.priceUsd)}, gas ${cfg.gasPriceGwei} gwei, relayer margin ${cfg.margin} ${unit}. Relayer quote per unshield: ${fmtUsd(results[0].usd.relayerQuote)}.`
    : `${unit} ${fmtUsd(cfg.priceUsd)}, rent ${cfg.rentLamports} lamports x2, signature ${cfg.signatureLamports} lamports, relayer margin ${cfg.margin} ${unit}. Relayer quote per unshield: ${fmtUsd(results[0].usd.relayerQuote)}.`);
  lines.push("");
  lines.push("Per model, per month (USD):");
  lines.push(table(
    ["Model", "In bps", "Out bps", "Fee in", "Fee out", "Protocol fees", "Relayer cost", "Relayer net", "Total", "User in", "User out", "Round trip", "Of size"],
    results.map((r) => [r.label, r.inBps, r.outBps, fmtUsd(r.usd.feeIn), fmtUsd(r.usd.feeOut), fmtUsd(r.usd.protocolFees), fmtUsd(r.usd.relayerCost), fmtUsd(r.usd.relayerNet), fmtUsd(r.usd.total), fmtUsd(r.usd.userIn), fmtUsd(r.usd.userOut), fmtUsd(r.usd.userTotal), pct(r.usd.userTotalPct)]),
  ));
  lines.push("");
  lines.push(`Sweep, same rate in and out, 0 to ${MAX_PROTOCOL_FEE_BPS} bps (the contract cap):`);
  lines.push(table(
    ["bps", "Protocol fees / mo", "Total / mo", "User round trip", "Of size"],
    sweepRows.map((s) => [s.bps, fmtUsd(s.protocolFeesUsd), fmtUsd(s.totalUsd), fmtUsd(s.userTotalUsd), pct(s.userTotalPct)]),
  ));
  lines.push("");
  lines.push("Fee in: paid by the depositor on top of the note. Fee out: taken from the payout. Relayer net: quote minus measured cost, including free sends.");
  lines.push("Private sends never carry a protocol fee. Rates above 100 bps are impossible without changing the reviewed contracts.");
  return lines.join("\n");
}

export function writeCsv(file, cfg, results, sweepRows) {
  const modelsPath = file.endsWith(".csv") ? file : path.join(file, "earnings-models.csv");
  const sweepPath = modelsPath.replace(/\.csv$/, "-sweep.csv");
  fs.mkdirSync(path.dirname(modelsPath), { recursive: true });
  fs.writeFileSync(modelsPath, csv(
    ["model", "label", "chain", "in_bps", "out_bps", "shield_count", "unshield_count", "relayed_unshields", "fee_in_usd", "fee_out_usd", "protocol_fees_usd", "relayer_fees_usd", "relayer_cost_usd", "relayer_net_usd", "total_usd", "user_in_usd", "user_out_usd", "user_round_trip_usd", "user_round_trip_pct"],
    results.map((r) => [r.key, r.label, cfg.chain, r.inBps, r.outBps, r.shieldCount, r.unshieldCount, r.relayed, r.usd.feeIn, r.usd.feeOut, r.usd.protocolFees, r.usd.relayerFees, r.usd.relayerCost, r.usd.relayerNet, r.usd.total, r.usd.userIn, r.usd.userOut, r.usd.userTotal, r.usd.userTotalPct]),
  ));
  fs.writeFileSync(sweepPath, csv(
    ["bps", "protocol_fees_usd", "total_usd", "user_round_trip_usd", "user_round_trip_pct"],
    sweepRows.map((s) => [s.bps, s.protocolFeesUsd, s.totalUsd, s.userTotalUsd, s.userTotalPct]),
  ));
  return { modelsPath, sweepPath };
}

const HELP = `Pool earnings calculator (TESTNET planning tool, offline).

  node scripts/earnings-calculator.mjs [--config file.json] [flags]

Flags (camelCase keys in the JSON file; flags override the file):
  --chain evm|solana            cost formula to use (default evm)
  --shield-volume-usd N         monthly shield volume (default 1,000,000)
  --unshield-volume-usd N       monthly unshield volume (default 1,000,000)
  --avg-size-usd N              typical transaction size (default 500); or
  --shield-count N / --unshield-count N   explicit monthly counts
  --send-count N                monthly free private sends the relayer pays for (default 0)
  --relayed-share F             fraction of unshields through the relayer, 0..1 (default 1)
  --price-usd N                 native coin price (default 2670)
  --gas-price-gwei N            EVM gas price (default 0.13)
  --rent-lamports N             Solana rent per nullifier account (default 890880)
  --signature-lamports N        Solana signature cost (default ${LAMPORTS_PER_SIGNATURE})
  --margin N                    relayer margin in whole native coins (default 0)
  --models a,b,c                presets: ${Object.keys(PRESETS).join(", ")}
  --sweep-step N                bps step for the 0..100 sweep (default 5)
  --csv path.csv|dir            write the model table and a -sweep.csv next to it
  --json                        print the raw projection as JSON instead of tables
`;

export function main(argv = process.argv.slice(2)) {
  const flags = parseArgs(argv);
  if (flags.help) { process.stdout.write(HELP); return 0; }
  const cfg = resolveConfig(flags);
  const results = projectAll(cfg);
  const sweepRows = sweep(cfg);
  if (cfg.json) {
    process.stdout.write(JSON.stringify({ config: cfg, models: results, sweep: sweepRows }, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2) + "\n");
  } else {
    process.stdout.write(render(cfg, results, sweepRows) + "\n");
  }
  if (cfg.csv) {
    const { modelsPath, sweepPath } = writeCsv(cfg.csv, cfg, results, sweepRows);
    process.stderr.write(`Wrote ${modelsPath} and ${sweepPath}\n`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = main(); } catch (e) { process.stderr.write(`${e.message}\n`); process.exitCode = 1; }
}
