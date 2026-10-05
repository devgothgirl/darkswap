// Runs against a temporary postgres; see scripts/test-pool-volumes.sh.
import assert from "node:assert/strict";
import test, { before } from "node:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LAMPORTS_PER_SIGNATURE, evmRelayerQuote, solanaRelayerQuote } from "@darkswap/pool-client";
import { db, poolActivityTable, poolSyncTable } from "@workspace/db";
import { findChain } from "./config";
import { exportMonth, monthWindow, VolumeExportError } from "./volumes";

const ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const TEST_TOKEN = "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707";
const SOL = "11111111111111111111111111111111";
const here = path.dirname(fileURLToPath(import.meta.url));
const calculator = path.resolve(here, "../../../../../lib/pool-client/scripts/earnings-calculator.mjs");

const evmChain = findChain("base-sepolia")!;
const solanaChain = findChain("solana-devnet")!;

// The fees these fixtures pay are the relayer's own quote at a known gas
// price and rent, built with the shared formula rather than copied from it,
// so the export must read those two inputs back out of them.
const GAS_PRICE_GWEI = 0.13;
const RENT_LAMPORTS = 890_880;
const EVM_QUOTE_WEI = evmRelayerQuote(BigInt(GAS_PRICE_GWEI * 1e9)).toString();
const SOLANA_QUOTE_LAMPORTS = solanaRelayerQuote(BigInt(RENT_LAMPORTS)).toString();

const at = (iso: string) => new Date(iso);

/** Writes a config out and runs the real calculator on it, as an operator would. */
function runCalculator(config: unknown) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pool-volumes-"));
  const file = path.join(dir, "month.json");
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
  try {
    return execFileSync("node", [calculator, "--config", file], { encoding: "utf8" });
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
}

before(async () => {
  process.env.POOL_RELAY_MIN_FEE_BASE_SEPOLIA = "0";
  process.env.POOL_RELAY_MIN_FEE_SOLANA_DEVNET = "0";
  await db.insert(poolSyncTable).values([
    {
      chain: evmChain.id, nextIndex: 0, state: {
        feeBps: 50,
        assets: [
          { token: ETH, assetId: "1", symbol: "ETH", decimals: 18 },
          { token: TEST_TOKEN, assetId: "2", symbol: "TST", decimals: 6 },
        ],
      },
    },
    {
      chain: solanaChain.id, nextIndex: 0, state: {
        feeBps: 50, assets: [{ token: SOL, assetId: "0", symbol: "SOL", decimals: 9 }],
      },
    },
  ]);
  const row = (n: number, kind: string, token: string, amount: string, relayerFee: string, occurredAt: string, chain = evmChain.id) =>
    ({ chain, tx: `0xtx${n}`, position: 0, kind, token, amount, relayerFee, occurredAt: at(occurredAt) });
  await db.insert(poolActivityTable).values([
    // September 2026, the month under test.
    row(1, "shield", ETH, "100000000000000000", "0", "2026-09-02T10:00:00Z"),
    row(2, "shield", ETH, "100000000000000000", "0", "2026-09-11T10:00:00Z"),
    row(3, "shield", ETH, "100000000000000000", "0", "2026-09-19T10:00:00Z"),
    row(4, "deposit", ETH, "50000000000000000", "0", "2026-09-20T10:00:00Z"),
    row(5, "shield", TEST_TOKEN, "1000000", "0", "2026-09-21T10:00:00Z"),
    row(6, "unshield", ETH, "200000000000000000", EVM_QUOTE_WEI, "2026-09-22T10:00:00Z"),
    row(7, "unshield", ETH, "200000000000000000", EVM_QUOTE_WEI, "2026-09-23T10:00:00Z"),
    row(8, "send", "", "0", "0", "2026-09-24T10:00:00Z"),
    // An action the indexer saw but could not read the amounts of.
    row(14, "unreadable", "", "0", "0", "2026-09-25T10:00:00Z"),
    // June 2026: a single minimum-sized shield, worth a fraction of a cent.
    row(15, "shield", ETH, "1000000000000000", "0", "2026-06-02T10:00:00Z"),
    // Just outside the window on either side.
    row(9, "shield", ETH, "900000000000000000", "0", "2026-08-31T23:59:59Z"),
    row(10, "unshield", ETH, "900000000000000000", "0", "2026-10-01T00:00:00Z"),
    // Solana devnet, same month.
    row(11, "shield", SOL, "2000000000", "0", "2026-09-05T10:00:00Z", solanaChain.id),
    row(12, "unshield", SOL, "1000000000", SOLANA_QUOTE_LAMPORTS, "2026-09-06T10:00:00Z", solanaChain.id),
    row(13, "unshield", SOL, "1000000000", "0", "2026-09-07T10:00:00Z", solanaChain.id),
  ]);
});

test("a month window is the UTC calendar month and nothing else", () => {
  const { start, end } = monthWindow("2026-12");
  assert.equal(start.toISOString(), "2026-12-01T00:00:00.000Z");
  assert.equal(end.toISOString(), "2027-01-01T00:00:00.000Z");
  assert.throws(() => monthWindow("2026-13"), VolumeExportError);
  assert.throws(() => monthWindow("September"), VolumeExportError);
});

test("the month's counts, volumes and relayed share come from the pool tables", async () => {
  const { config, warnings } = await exportMonth({
    chain: evmChain, month: "2026-09", priceUsd: 2670, tokenPricesUsd: { [TEST_TOKEN]: 2 },
  });
  // 3 shields of 0.1 ETH and a 0.05 ETH deposit at $2,670, plus 1 TST at $2.
  assert.equal(config.chain, "evm");
  assert.equal(config.shieldCount, 5);
  assert.equal(config.shieldVolumeUsd, 936.5);
  assert.equal(config.unshieldCount, 2);
  assert.equal(config.unshieldVolumeUsd, 1068);
  assert.equal(config.sendCount, 1);
  assert.equal(config.relayedShare, 1);
  assert.equal(config.avgSizeUsd, 286.357142857); // (936.5 + 1068) / 7
  assert.equal(config.priceUsd, 2670);
  // The fees users actually paid imply the gas price the relayer quoted at.
  assert.equal((config as { gasPriceGwei?: number }).gasPriceGwei, GAS_PRICE_GWEI);
  assert.equal((config as { margin?: number }).margin, 0);
  assert.equal(config.observed.testnet, true);
  assert.equal(config.observed.poolChain, "base-sepolia");
  assert.match(config.observed.note, /Not a revenue claim/);
  // An action the indexer could not read is a stated hole in the month, not a
  // silent one, and it is never counted as a shield, unshield or send.
  assert.equal(config.observed.unreadableActions, 1);
  assert.deepEqual(warnings, ["1 action could not be read by the indexer and is missing from these volumes."]);
});

test("an operator price is required for every asset, and a token can be left out", async () => {
  await assert.rejects(
    () => exportMonth({ chain: evmChain, month: "2026-09", priceUsd: 2670 }),
    (err: Error) => err instanceof VolumeExportError && /No price for TST/.test(err.message),
  );
  await assert.rejects(
    () => exportMonth({ chain: evmChain, month: "2026-09", priceUsd: 0 }),
    (err: Error) => err instanceof VolumeExportError && /--price-usd/.test(err.message),
  );
  const { config, warnings } = await exportMonth({
    chain: evmChain, month: "2026-09", priceUsd: 2670, excludeTokens: [TEST_TOKEN],
  });
  assert.equal(config.shieldCount, 4);
  assert.equal(config.shieldVolumeUsd, 934.5);
  assert.ok(warnings.some((w) => /Left out by --exclude-token/.test(w)), warnings.join(" | "));
});

test("a month with no activity exports zeros and says so", async () => {
  const { config, warnings } = await exportMonth({ chain: evmChain, month: "2026-07", priceUsd: 2670 });
  assert.equal(config.shieldCount, 0);
  assert.equal(config.unshieldCount, 0);
  assert.equal(config.sendCount, 0);
  assert.equal(config.shieldVolumeUsd, 0);
  assert.equal(config.unshieldVolumeUsd, 0);
  assert.equal(config.relayedShare, 0);
  assert.equal((config as { avgSizeUsd?: number }).avgSizeUsd, undefined);
  assert.ok(warnings.some((w) => /No pool activity is recorded/.test(w)), warnings.join(" | "));
});

test("Solana reads its rent back out of the relayer fees that were paid", async () => {
  const { config } = await exportMonth({ chain: solanaChain, month: "2026-09", priceUsd: 121 });
  assert.equal(config.chain, "solana");
  assert.equal(config.shieldCount, 1);
  assert.equal(config.shieldVolumeUsd, 242); // 2 SOL at $121
  assert.equal(config.unshieldCount, 2);
  assert.equal(config.relayedShare, 0.5); // one of the two paid a relayer
  assert.equal((config as { rentLamports?: number }).rentLamports, RENT_LAMPORTS);
  assert.equal((config as { signatureLamports?: number }).signatureLamports, Number(LAMPORTS_PER_SIGNATURE));
});

test("a month of sub-cent amounts keeps its size and still feeds the calculator", async () => {
  // 0.001 ETH at $1 is $0.001. Rounded to cents this would be zero, and the
  // calculator rejects a typical size of zero.
  const { config } = await exportMonth({ chain: evmChain, month: "2026-06", priceUsd: 1 });
  assert.equal(config.shieldCount, 1);
  assert.equal(config.shieldVolumeUsd, 0.001);
  assert.equal((config as { avgSizeUsd?: number }).avgSizeUsd, 0.001);
  const out = runCalculator(config);
  assert.match(out, /shield \$0\.0010 in 1 tx.*Typical size \$0\.0010\./);
});

test("the earnings calculator runs on the exported file", async () => {
  const { config } = await exportMonth({
    chain: evmChain, month: "2026-09", priceUsd: 2670, tokenPricesUsd: { [TEST_TOKEN]: 2 },
  });
  const out = runCalculator(config);
  assert.match(out, /TESTNET planning projection, not a revenue claim\. Chain: evm\./);
  assert.match(out, /shield \$936\.50 in 5 tx, unshield \$1,068 in 2 tx \(2 relayed\), 1 free private sends/);
  assert.match(out, /Ours \(50 in \/ 50 out\)/);
});

test.after(async () => {
  const { pool } = await import("@workspace/db");
  await pool.end();
});
