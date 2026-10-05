// Turns a month of real TESTNET pool activity into the JSON the earnings
// calculator reads (lib/pool-client/scripts/earnings-calculator.mjs).
//
// It reads the pool tables the indexer already fills and nothing else: no
// chain call, no market provider, and nothing on the server's startup path.
// Prices are supplied by the operator, because testnet assets have none.
// The result describes observed testnet usage; it is not a revenue figure for
// any live deployment.
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { getAddress } from "viem";
import {
  evm, solana, evmGasPriceFromQuote, solanaRentFromQuote, LAMPORTS_PER_SIGNATURE,
} from "@darkswap/pool-client";
import { db, poolActivityTable, poolSyncTable } from "@workspace/db";
import type { PoolChain } from "./config";
import type { PoolAsset } from "./indexer";
import { relayMargin } from "./relayer";

export class VolumeExportError extends Error {}

/** How the indexer records the chain's own coin among the pool's assets. */
const nativeTokenOf = (chain: PoolChain) => (chain.kind === "evm" ? getAddress(evm.ETH) : solana.SOL_MINT.toBase58());

// The quote the relayer gives is defined once in the client package
// (src/relayer-fees.js); `evmGasPriceFromQuote` and `solanaRentFromQuote`
// invert it below, turning the fees users actually paid back into the
// calculator's inputs.
const NATIVE_DECIMALS = { evm: 18, solana: 9 } as const;
const PRICED_KINDS = ["shield", "unshield", "deposit"] as const;

export type MonthWindow = { month: string; start: Date; end: Date };

/** "2026-09" -> the UTC month it names. */
export function monthWindow(month: string): MonthWindow {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new VolumeExportError("Use --month YYYY-MM (UTC).");
  const [year, mon] = month.split("-").map(Number);
  return { month, start: new Date(Date.UTC(year, mon - 1, 1)), end: new Date(Date.UTC(mon === 12 ? year + 1 : year, mon % 12, 1)) };
}

type Group = { kind: string; token: string; count: number; amount: string; relayed: number; relayerFee: string };

export type ExportOptions = {
  chain: PoolChain;
  month: string;
  /** Operator's price for the chain's own coin, in USD. */
  priceUsd: number;
  /** Operator's price per listed token, keyed by the token address or mint. */
  tokenPricesUsd?: Record<string, number>;
  /** Tokens to leave out of the month entirely, counts included. */
  excludeTokens?: string[];
};

/**
 * One month of observed activity, as a calculator config plus an `observed`
 * block the calculator ignores and a reader can check the numbers against.
 */
export async function exportMonth(options: ExportOptions) {
  const { chain, priceUsd } = options;
  if (!(priceUsd > 0)) throw new VolumeExportError("--price-usd must be a positive number; testnet coins have no market price, so the operator supplies one.");
  const window = monthWindow(options.month);
  const excluded = new Set((options.excludeTokens ?? []).map((t) => (t === "unknown" ? "" : t)));
  const prices = new Map<string, number>(Object.entries(options.tokenPricesUsd ?? {}));
  const nativeToken = nativeTokenOf(chain);
  prices.set(nativeToken, priceUsd);

  const [sync] = await db.select({ state: poolSyncTable.state, updatedAt: poolSyncTable.updatedAt })
    .from(poolSyncTable).where(eq(poolSyncTable.chain, chain.id));
  const assets = ((sync?.state ?? {}) as { assets?: PoolAsset[] }).assets ?? [];
  const decimalsOf = (token: string) =>
    assets.find((a) => a.token === token)?.decimals ?? (token === nativeToken ? NATIVE_DECIMALS[chain.kind] : null);
  const symbolOf = (token: string) => assets.find((a) => a.token === token)?.symbol ?? (token === "" ? "unknown asset" : token);

  const groups: Group[] = await db.select({
    kind: poolActivityTable.kind,
    token: poolActivityTable.token,
    count: sql<number>`count(*)::int`,
    amount: sql<string>`sum(${poolActivityTable.amount}::numeric)::text`,
    relayed: sql<number>`count(*) filter (where ${poolActivityTable.relayerFee} <> '0')::int`,
    relayerFee: sql<string>`sum(${poolActivityTable.relayerFee}::numeric)::text`,
  }).from(poolActivityTable)
    .where(and(
      eq(poolActivityTable.chain, chain.id),
      gte(poolActivityTable.occurredAt, window.start),
      lt(poolActivityTable.occurredAt, window.end),
    ))
    .groupBy(poolActivityTable.kind, poolActivityTable.token);

  const [coverage] = await db.select({
    first: sql<string | null>`min(${poolActivityTable.occurredAt})`,
    last: sql<string | null>`max(${poolActivityTable.occurredAt})`,
  }).from(poolActivityTable).where(eq(poolActivityTable.chain, chain.id));

  const kept = groups.filter((g) => !((PRICED_KINDS as readonly string[]).includes(g.kind) && excluded.has(g.token)));
  const unpriced = [...new Set(kept.filter((g) => (PRICED_KINDS as readonly string[]).includes(g.kind) && !prices.has(g.token)).map((g) => g.token))];
  if (unpriced.length) {
    throw new VolumeExportError(
      `No price for ${unpriced.map((t) => `${symbolOf(t)} (${t || "unknown"})`).join(", ")}. `
      + "Give each one --token-price <token>=<usd>, or drop it with --exclude-token <token>.",
    );
  }
  const noDecimals = [...new Set(kept.filter((g) => (PRICED_KINDS as readonly string[]).includes(g.kind) && decimalsOf(g.token) === null).map((g) => g.token))];
  if (noDecimals.length) {
    throw new VolumeExportError(`The indexer has not recorded decimals for ${noDecimals.map((t) => t || "unknown").join(", ")}; read the pool state once, then export again.`);
  }

  const usdOf = (token: string, base: string) => (Number(base) / 10 ** decimalsOf(token)!) * prices.get(token)!;
  const totals = (kinds: string[]) => kept.filter((g) => kinds.includes(g.kind))
    .reduce((acc, g) => ({ count: acc.count + g.count, usd: acc.usd + usdOf(g.token, g.amount) }), { count: 0, usd: 0 });

  // A deposit adds to notes that already exist and pays the same fee on top as
  // a shield, so the two are one direction for the calculator.
  const inbound = totals(["shield", "deposit"]);
  const outbound = totals(["unshield"]);
  const sendCount = kept.filter((g) => g.kind === "send").reduce((n, g) => n + g.count, 0);
  const relayedUnshields = kept.filter((g) => g.kind === "unshield").reduce((n, g) => n + g.relayed, 0);
  const transactions = inbound.count + outbound.count;

  // Actions the indexer saw but could not read the amounts of. They are a
  // known hole in the month, so say so rather than quietly understating it.
  const unreadable = kept.filter((g) => g.kind === "unreadable").reduce((n, g) => n + g.count, 0);

  const warnings: string[] = [];
  if (unreadable) {
    warnings.push(`${unreadable} action${unreadable === 1 ? "" : "s"} could not be read by the indexer and ${unreadable === 1 ? "is" : "are"} missing from these volumes.`);
  }
  const relayer = relayerInputs(chain, kept, nativeToken, warnings);
  if (!transactions && !sendCount) warnings.push(`No pool activity is recorded for ${chain.id} in ${window.month}.`);
  if (coverage?.first) {
    const firstAt = new Date(coverage.first);
    if (firstAt > window.start) warnings.push(`The activity record for ${chain.id} starts ${firstAt.toISOString()}, after this month began; earlier actions are not counted.`);
  }
  const excludedGroups = groups.filter((g) => !kept.includes(g));
  if (excludedGroups.length) {
    warnings.push(`Left out by --exclude-token: ${excludedGroups.map((g) => `${g.count} ${g.kind} of ${symbolOf(g.token)}`).join(", ")}.`);
  }

  const config = {
    chain: chain.kind,
    shieldVolumeUsd: clean(inbound.usd),
    unshieldVolumeUsd: clean(outbound.usd),
    shieldCount: inbound.count,
    unshieldCount: outbound.count,
    sendCount,
    relayedShare: outbound.count ? clean(relayedUnshields / outbound.count) : 0,
    priceUsd,
    ...(transactions ? { avgSizeUsd: clean((inbound.usd + outbound.usd) / transactions) } : {}),
    ...relayer.config,
    observed: {
      testnet: true,
      note: "Observed testnet usage from the pool tables. Not a revenue claim for any live deployment.",
      poolChain: chain.id,
      month: window.month,
      windowUtc: { from: window.start.toISOString(), to: window.end.toISOString() },
      generatedAt: new Date().toISOString(),
      source: "pool_activity, written by the pool indexer",
      indexedAt: sync?.updatedAt?.toISOString() ?? null,
      activityRecordedFrom: coverage?.first ? new Date(coverage.first).toISOString() : null,
      activityRecordedTo: coverage?.last ? new Date(coverage.last).toISOString() : null,
      unreadableActions: unreadable,
      pricesUsd: Object.fromEntries([...prices].filter(([token]) => token === nativeToken || kept.some((g) => g.token === token))
        .map(([token, usd]) => [symbolOf(token), usd])),
      byKind: kept.map((g) => ({
        kind: g.kind, asset: symbolOf(g.token), count: g.count,
        amountBaseUnits: g.amount ?? "0", relayed: g.relayed, relayerFeeBaseUnits: g.relayerFee ?? "0",
      })),
      relayer: relayer.observed,
      warnings,
    },
  };
  return { config, warnings };
}

/**
 * The relayer side of the config. `margin` is what the operator has set for
 * this chain right now. The per-transaction cost inputs are read back out of
 * the fees users actually paid in the chain's own coin, by inverting the quote
 * the relayer gives: EVM `1.5M gas x gasPrice x 1.2 + margin`, Solana
 * `signature + 2 x rent + margin`. With no relayed unshield in the asset the
 * month cannot say, and the calculator's defaults stand.
 */
function relayerInputs(chain: PoolChain, groups: Group[], nativeToken: string, warnings: string[]) {
  const marginBase = relayMargin(chain);
  const margin = Number(marginBase) / 10 ** NATIVE_DECIMALS[chain.kind];
  const native = groups.find((g) => g.kind === "unshield" && g.token === nativeToken);
  const observed: Record<string, unknown> = {
    marginBaseUnits: marginBase.toString(),
    nativeRelayedUnshields: native?.relayed ?? 0,
    relayerFeesPaidBaseUnits: native?.relayerFee ?? "0",
  };
  if (!native?.relayed) {
    warnings.push("No relayed unshield in the chain's own coin this month, so the calculator's default network-cost inputs are used.");
    return { config: { margin }, observed };
  }
  const averageQuote = BigInt(Math.round(Number(native.relayerFee) / native.relayed));
  observed.averageRelayerFeeBaseUnits = averageQuote.toString();
  const overMargin = averageQuote - marginBase;
  if (overMargin <= 0n) {
    warnings.push("The relayer fees paid this month are at or below the configured margin, so the calculator's default network-cost inputs are used.");
    return { config: { margin }, observed };
  }
  if (chain.kind === "evm") {
    const gasPriceWei = evmGasPriceFromQuote(overMargin);
    if (gasPriceWei <= 0n) {
      warnings.push("The relayer fees paid this month are too small to imply a gas price, so the calculator's default is used.");
      return { config: { margin }, observed };
    }
    const gasPriceGwei = Number(gasPriceWei) / 1e9;
    observed.impliedGasPriceGwei = gasPriceGwei;
    return { config: { margin, gasPriceGwei }, observed };
  }
  const rentLamports = solanaRentFromQuote(overMargin);
  if (rentLamports <= 0n) {
    warnings.push("The relayer fees paid this month are below one signature, so the calculator's default rent input is used.");
    return { config: { margin }, observed };
  }
  observed.impliedRentLamports = Number(rentLamports);
  return { config: { margin, rentLamports: Number(rentLamports), signatureLamports: Number(LAMPORTS_PER_SIGNATURE) }, observed };
}

/**
 * Float noise out, real magnitude kept. The calculator needs a positive
 * average size, and a month of small testnet amounts can sit well under a
 * cent, so these are never rounded to a currency's display precision.
 */
const clean = (n: number) => (n === 0 ? 0 : Number(n.toPrecision(12)));
