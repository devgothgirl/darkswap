// Restricted operator utility; intentionally not exposed through an HTTP route.
//
// Writes one month of observed TESTNET pool activity in the shape the earnings
// calculator reads:
//
//   pnpm run pool:export-volumes -- --chain base-sepolia --month 2026-09 \
//     --price-usd 2670 --out /tmp/base-sepolia-2026-09.json
//   cd ../../lib/pool-client && node scripts/earnings-calculator.mjs --config /tmp/base-sepolia-2026-09.json
//
// Prices are given here, not fetched: testnet assets have no market price and
// no market provider belongs in this path.
import fs from "node:fs";
import { parseArgs } from "node:util";

class OperatorInputError extends Error {}

function priceMap(entries: string[] | undefined) {
  const prices: Record<string, number> = {};
  for (const entry of entries ?? []) {
    const at = entry.lastIndexOf("=");
    const token = at === -1 ? "" : entry.slice(0, at).trim();
    const usd = Number(entry.slice(at + 1));
    if (!token || !Number.isFinite(usd) || usd <= 0) throw new OperatorInputError("Use --token-price <token address or mint>=<positive usd>.");
    prices[token] = usd;
  }
  return prices;
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--") args.shift(); // pnpm run passes its separator through.
  const { values } = parseArgs({
    args, strict: true, allowPositionals: false,
    options: {
      chain: { type: "string" }, month: { type: "string" }, "price-usd": { type: "string" },
      "token-price": { type: "string", multiple: true }, "exclude-token": { type: "string", multiple: true },
      out: { type: "string" },
    },
  });
  if (!values.chain || !values.month || !values["price-usd"]) {
    throw new OperatorInputError("Use --chain <pool chain> --month YYYY-MM --price-usd <usd for the chain's own coin> [--token-price <token>=<usd>] [--exclude-token <token>] [--out file.json]");
  }
  const priceUsd = Number(values["price-usd"]);
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) throw new OperatorInputError("--price-usd must be a positive number.");
  const tokenPricesUsd = priceMap(values["token-price"]);

  const { findChain } = await import("../lib/pool/config");
  const chain = findChain(values.chain);
  if (!chain) throw new OperatorInputError(`Unknown chain "${values.chain}".`);

  // Load the database only after the inputs are known to be usable.
  const { pool } = await import("@workspace/db");
  try {
    const { exportMonth } = await import("../lib/pool/volumes");
    const { config, warnings } = await exportMonth({
      chain, month: values.month, priceUsd, tokenPricesUsd, excludeTokens: values["exclude-token"],
    });
    const json = `${JSON.stringify(config, null, 2)}\n`;
    if (values.out) fs.writeFileSync(values.out, json);
    else process.stdout.write(json);
    for (const warning of warnings) process.stderr.write(`warning: ${warning}\n`);
    if (values.out) {
      process.stderr.write(`Wrote ${values.out}. Run it with:\n  cd lib/pool-client && node scripts/earnings-calculator.mjs --config ${values.out}\n`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
