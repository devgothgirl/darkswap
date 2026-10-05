import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { protocolFeeOn } from "../src/wallet.js";
import {
  EVM_TRANSACT_GAS, LAMPORTS_PER_SIGNATURE, MAX_PROTOCOL_FEE_BPS, PRESETS,
  parseArgs, resolveConfig, projectModel, projectAll, sweep, relayerQuote, writeCsv, toBase,
} from "../scripts/earnings-calculator.mjs";
import {
  SOLANA_NULLIFIER_ACCOUNTS, evmRelayerQuote, solanaRelayerQuote,
  evmGasPriceFromQuote, solanaRentFromQuote, withQuoteHeadroom,
} from "../src/relayer-fees.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const relayerSource = fs.readFileSync(path.join(here, "../../../artifacts/api-server/src/lib/pool/relayer.ts"), "utf8");
const volumesSource = fs.readFileSync(path.join(here, "../../../artifacts/api-server/src/lib/pool/volumes.ts"), "utf8");
const poolSource = fs.readFileSync(path.join(here, "../../../packages/darkswap-pool/evm/src/DarkPool.sol"), "utf8");

test("protocol fee rounds up, never zero, matches the contract formula", () => {
  assert.equal(protocolFeeOn(1n, 1), 1n); // 0.0001 of 1 unit still pays 1
  assert.equal(protocolFeeOn(10_000n, 50), 50n);
  assert.equal(protocolFeeOn(10_001n, 50), 51n); // ceil, not floor
  assert.equal(protocolFeeOn(10n ** 18n, 100), 10n ** 16n); // 1% of 1 ETH
  assert.equal(protocolFeeOn(123_456_789n, 0), 0n); // 0 bps charges nothing
  assert.match(poolSource, /\(amount \* protocolFeeBps \+ 9_999\) \/ 10_000/);
  assert.match(poolSource, /MAX_PROTOCOL_FEE_BPS = 100;/);
  assert.equal(MAX_PROTOCOL_FEE_BPS, 100);
});

test("the calculator quotes through the shared relayer formula, not a copy", () => {
  // EVM: 1.5M gas * 0.13 gwei * 1.2 = 234_000 gwei
  const evm = resolveConfig({ chain: "evm", gasPriceGwei: 0.13, margin: 0 });
  assert.equal(relayerQuote(evm, 0n), 234_000_000_000_000n);
  assert.equal(relayerQuote(evm, 7n), evmRelayerQuote(130_000_000n, 7n));
  // Solana: 5000 + 2 * 890_880 = 1_786_760 lamports, plus a margin
  const sol = resolveConfig({ chain: "solana", rentLamports: 890_880 });
  assert.equal(sol.signatureLamports, Number(LAMPORTS_PER_SIGNATURE)); // the default is the shared one
  assert.equal(relayerQuote(sol, 1_000n), 1_787_760n);
  assert.equal(relayerQuote(sol, 1_000n), solanaRelayerQuote(890_880n, 1_000n));

  // Move the shared numbers and the calculator moves with them: a quote is
  // always the allowance with headroom, or a signature plus its rent.
  assert.equal(relayerQuote(evm, 0n), withQuoteHeadroom(EVM_TRANSACT_GAS * 130_000_000n));
  assert.equal(relayerQuote(sol, 0n), LAMPORTS_PER_SIGNATURE + SOLANA_NULLIFIER_ACCOUNTS * 890_880n);
});

test("the relayer and the volume exporter use that same formula", () => {
  // Neither file may keep its own copy of the gas allowance, the headroom or
  // the signature cost: that is what used to drift.
  for (const [name, source] of [["relayer.ts", relayerSource], ["volumes.ts", volumesSource]]) {
    assert.doesNotMatch(source, /const EVM_TRANSACT_GAS\s*=/, `${name} redefines the gas allowance`);
    assert.doesNotMatch(source, /const LAMPORTS_PER_SIGNATURE\s*=/, `${name} redefines the signature cost`);
    assert.doesNotMatch(source, /EVM_QUOTE_(NUM|DEN)\s*=/, `${name} redefines the quote headroom`);
    assert.match(source, /from "@darkswap\/pool-client"/, `${name} must import the shared formula`);
  }
  // The relayer quotes with the shared helpers and funds the transaction with
  // the same headroom.
  assert.match(relayerSource, /const fee = evmRelayerQuote\(gasPrice, margin\(chain\)\)/);
  assert.match(relayerSource, /const fee = solanaRelayerQuote\(rent, margin\(chain\)\)/);
  assert.match(relayerSource, /const neededNative = solanaRelayerQuote\(rent, margin\(chain\)\)/);
  assert.match(relayerSource, /gas: withQuoteHeadroom\(gas\)/);
  // The exporter reads the inputs back out by inverting it.
  assert.match(volumesSource, /evmGasPriceFromQuote\(overMargin\)/);
  assert.match(volumesSource, /solanaRentFromQuote\(overMargin\)/);
});

test("inverting a quote gives back the gas price and rent that made it", () => {
  for (const gasPriceWei of [1_000_000n, 130_000_000n, 25_000_000_000n]) {
    for (const margin of [0n, 1_000_000_000_000n]) {
      assert.equal(evmGasPriceFromQuote(evmRelayerQuote(gasPriceWei, margin) - margin), gasPriceWei);
    }
  }
  for (const rent of [890_880n, 2_039_280n]) {
    for (const margin of [0n, 50_000n]) {
      assert.equal(solanaRentFromQuote(solanaRelayerQuote(rent, margin) - margin), rent);
    }
  }
  // A quote too small to imply anything comes back at or below zero, which is
  // what the exporter warns on instead of reporting a bogus input.
  assert.equal(evmGasPriceFromQuote(1n), 0n);
  assert.ok(solanaRentFromQuote(LAMPORTS_PER_SIGNATURE - 1n) <= 0n);
});

test("the 50/50 preset at the default inputs is pinned", () => {
  const cfg = resolveConfig({});
  const r = projectModel(cfg, { key: "ours", ...PRESETS.ours });
  // $1M in 2000 shields of $500: 50 bps of each = $2.50, times 2000 = $5,000 in and $5,000 out.
  assert.equal(r.shieldCount, 2000);
  assert.equal(r.unshieldCount, 2000);
  assert.equal(r.feeIn, protocolFeeOn(toBase(500 / 2670, 18), 50) * 2000n);
  assert.equal(r.feeOut, r.feeIn);
  assert.ok(Math.abs(r.usd.protocolFees - 10_000) < 0.01, `protocol fees ${r.usd.protocolFees}`);
  // Relayer: quote 234,000 gwei per unshield, measured cost 1,393,105 * 0.13 gwei.
  assert.equal(r.relayerQuote, 234_000_000_000_000n);
  assert.equal(r.relayerCost, 1_393_105n * 130_000_000n * 2000n);
  assert.equal(r.relayerNet, r.relayerFees - r.relayerCost);
  assert.ok(r.relayerNet > 0n);
  assert.equal(r.total, r.protocolFees + r.relayerNet);
  // One user at $500: $2.50 in, $2.50 + relayer quote out.
  assert.ok(Math.abs(r.usd.userIn - 2.5) < 0.001);
  assert.ok(Math.abs(r.usd.userOut - (2.5 + r.usd.relayerQuote)) < 0.001);
  assert.ok(Math.abs(r.usd.userTotalPct - 1.125) < 0.01);
});

test("every preset stays inside the contract cap and sends carry no fee", () => {
  for (const p of Object.values(PRESETS)) {
    assert.ok(p.inBps >= 0 && p.inBps <= MAX_PROTOCOL_FEE_BPS, p.label);
    assert.ok(p.outBps >= 0 && p.outBps <= MAX_PROTOCOL_FEE_BPS, p.label);
  }
  const cfg = resolveConfig({ sendCount: 100 });
  const [zero] = projectAll({ ...cfg, models: ["tornado"] });
  assert.equal(zero.protocolFees, 0n);
  // Free sends only add relayer cost; they never add fee income.
  const [withSends] = projectAll({ ...cfg, models: ["ours"] });
  const [noSends] = projectAll({ ...cfg, sendCount: 0, models: ["ours"] });
  assert.equal(withSends.protocolFees, noSends.protocolFees);
  assert.ok(withSends.relayerCost > noSends.relayerCost);
});

test("an inactive month projects zero transactions, fees and relayer activity", () => {
  for (const flags of [{ shieldVolumeUsd: 0, unshieldVolumeUsd: 0 }, { shieldVolumeUsd: 0, unshieldVolumeUsd: 0, shieldCount: 0, unshieldCount: 0 }]) {
    for (const chain of ["evm", "solana"]) {
      const [r] = projectAll(resolveConfig({ ...flags, chain, models: ["ours"] }));
      assert.equal(r.shieldCount, 0);
      assert.equal(r.unshieldCount, 0);
      assert.equal(r.relayed, 0);
      assert.equal(r.protocolFees, 0n);
      assert.equal(r.relayerFees, 0n);
      assert.equal(r.relayerCost, 0n);
      assert.equal(r.relayerNet, 0n);
      assert.equal(r.total, 0n);
      // The per-user quote still shows what one person would pay.
      assert.ok(r.userIn > 0n && r.userOut > 0n);
    }
  }
  // Zero volume on one side only: that side is empty, the other is unaffected.
  const [half] = projectAll(resolveConfig({ shieldVolumeUsd: 0, models: ["ours"] }));
  assert.equal(half.feeIn, 0n);
  assert.equal(half.shieldCount, 0);
  assert.ok(half.feeOut > 0n);
  const rows = sweep(resolveConfig({ shieldVolumeUsd: 0, unshieldVolumeUsd: 0, sweepStep: 50 }));
  assert.deepEqual(rows.map((r) => r.totalUsd), [0, 0, 0]);
});

test("a send-only month costs the relayer and earns no fee", () => {
  const [r] = projectAll(resolveConfig({ shieldVolumeUsd: 0, unshieldVolumeUsd: 0, sendCount: 100, models: ["ours"] }));
  assert.equal(r.protocolFees, 0n);
  assert.equal(r.relayerFees, 0n);
  assert.equal(r.relayerCost, 1_324_636n * 130_000_000n * 100n);
  assert.equal(r.relayerNet, -r.relayerCost);
  assert.equal(r.total, r.relayerNet);
  const [sol] = projectAll(resolveConfig({ chain: "solana", shieldVolumeUsd: 0, unshieldVolumeUsd: 0, sendCount: 3, models: ["ours"] }));
  assert.equal(sol.relayerCost, (5_000n + 2n * 890_880n) * 3n);
});

test("transaction counts must be whole non-negative numbers from flags and JSON alike", () => {
  assert.throws(() => resolveConfig(parseArgs(["--shield-count", "2.5"])), /whole number/);
  assert.throws(() => resolveConfig({ unshieldCount: 1.5 }), /whole number/);
  assert.throws(() => resolveConfig({ sendCount: "100" }), /non-negative number/);
  assert.throws(() => resolveConfig({ priceUsd: -5 }), /non-negative number/);
  assert.doesNotThrow(() => resolveConfig(parseArgs(["--shield-count", "0", "--unshield-count", "0"])));
});

test("flat competitor fees ride on the relayer margin, not the protocol fee", () => {
  const cfg = resolveConfig({ chain: "solana", priceUsd: 100 });
  const [pc] = projectAll({ ...cfg, models: ["privacycash"] });
  const [ours] = projectAll({ ...cfg, models: ["ours"] });
  assert.equal(pc.relayerQuote - ours.relayerQuote, toBase(0.006, 9));
  assert.equal(pc.feeIn, 0n);
});

test("sweep runs 0..100 bps and ends at the cap", () => {
  const rows = sweep(resolveConfig({ sweepStep: 30 }));
  assert.deepEqual(rows.map((r) => r.bps), [0, 30, 60, 90, 100]);
  assert.equal(rows[0].protocolFeesUsd, 0);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].protocolFeesUsd > rows[i - 1].protocolFeesUsd);
});

test("flags and a JSON file resolve into one config; flags win", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "earnings-"));
  const file = path.join(dir, "in.json");
  fs.writeFileSync(file, JSON.stringify({ chain: "solana", priceUsd: 120, avgSizeUsd: 50 }));
  const cfg = resolveConfig(parseArgs(["--config", file, "--price-usd=150", "--models", "ours,cap", "--shield-count", "10"]));
  assert.equal(cfg.chain, "solana");
  assert.equal(cfg.priceUsd, 150);
  assert.equal(cfg.avgSizeUsd, 50);
  assert.deepEqual(cfg.models, ["ours", "cap"]);
  assert.equal(cfg.shieldCount, 10);
  assert.throws(() => resolveConfig(parseArgs(["--chain", "near"])), /evm or solana/);
  assert.throws(() => parseArgs(["--price-usd", "-1"]), /non-negative/);
  assert.throws(() => projectAll(resolveConfig({ models: ["nope"] })), /Unknown model/);

  const out = path.join(dir, "out.csv");
  const results = projectAll(cfg);
  const { modelsPath, sweepPath } = writeCsv(out, cfg, results, sweep(cfg));
  const models = fs.readFileSync(modelsPath, "utf8").trim().split("\n");
  assert.equal(models.length, 3); // header + 2 models
  assert.match(models[0], /^model,label,chain,in_bps,out_bps/);
  assert.match(models[1], /^ours,/);
  const sw = fs.readFileSync(sweepPath, "utf8").trim().split("\n");
  assert.equal(sw[0], "bps,protocol_fees_usd,total_usd,user_round_trip_usd,user_round_trip_pct");
  assert.equal(sw.length, 1 + 21);
  fs.rmSync(dir, { recursive: true });
});
