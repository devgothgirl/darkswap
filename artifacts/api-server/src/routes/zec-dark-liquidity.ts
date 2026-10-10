import { Router, type IRouter } from "express";
import { z } from "zod";
import { GetZecDarkLiquidityResponse } from "@workspace/api-zod";

export const ZEC_DARK_POOL = "5Tyakzwn8BF9cqXE5NZB9C5FJPn5UapAZMGCpXcPvU1u";
export const METEORA_POOL_URL = `https://www.meteora.ag/dammv2/${ZEC_DARK_POOL}?referrer=portfolio`;
const endpoint = `https://damm-v2.datapi.meteora.ag/pools?filter_by=pool_address%3D${ZEC_DARK_POOL}&page_size=1`;
const amount = z.number().finite().nonnegative();
const percentage = amount.max(100);
// Validate the pool AND both mints: a symbol search could match an unrelated token.
const poolSchema = z.object({
  address: z.literal(ZEC_DARK_POOL),
  token_x: z.object({ address: z.literal("7KEPApdbBMByrmqihz3bht2uMhFQcatjfSFQCKq66kH3") }),
  token_y: z.object({ address: z.literal("A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS") }),
  tvl: amount,
  volume: z.object({ "24h": amount }),
  fees: z.object({ "24h": amount }),
  permanent_lock_liquidity: amount,
  pool_config: z.object({
    base_fee_pct: percentage,
    compounding_fee_pct: percentage,
    dynamic_fee_initialized: z.boolean(),
    collect_fee_mode: z.literal(2),
  }),
});

export function normalizePool(payload: unknown, fetchedAt: number) {
  const response = z.object({ data: z.array(z.unknown()) }).parse(payload);
  const match = response.data.find(pool => pool && typeof pool === "object" &&
    (pool as { address?: unknown }).address === ZEC_DARK_POOL);
  const pool = poolSchema.parse(match);
  if (pool.permanent_lock_liquidity > pool.tvl) throw new Error("Invalid locked liquidity");
  return GetZecDarkLiquidityResponse.parse({
    poolAddress: ZEC_DARK_POOL,
    meteoraUrl: METEORA_POOL_URL,
    fetchedAt: new Date(fetchedAt).toISOString(),
    liquidityUsd: pool.tvl,
    volume24hUsd: pool.volume["24h"],
    fees24hUsd: pool.fees["24h"],
    baseFeePct: pool.pool_config.base_fee_pct,
    compoundingFeePct: pool.pool_config.compounding_fee_pct,
    dynamicFeeEnabled: pool.pool_config.dynamic_fee_initialized,
    // Meteora's API returns locked liquidity in USD, not a percentage.
    permanentLockedPct: pool.tvl > 0 ? pool.permanent_lock_liquidity / pool.tvl * 100 : null,
  });
}

export function createZecDarkLiquidityRouter(options: { fetcher?: typeof fetch; now?: () => number } = {}): IRouter {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  type Snapshot = ReturnType<typeof normalizePool>;
  let cached: { at: number; snapshot: Snapshot } | null = null;
  let loading: Promise<Snapshot> | null = null;
  let retryAfter = 0;
  const load = async () => {
    if (cached && now() - cached.at < 60_000) return cached.snapshot;
    if (now() < retryAfter) throw new Error("Provider unavailable");
    if (!loading) {
      loading = (async () => {
        const response = await fetcher(endpoint, {
          headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok) throw new Error("Provider unavailable");
        const snapshot = normalizePool(await response.json(), now());
        cached = { at: now(), snapshot };
        return snapshot;
      })().catch(error => {
        // Never serve expired data on failure; briefly back off to avoid request floods.
        retryAfter = now() + 15_000;
        throw error;
      }).finally(() => { loading = null; });
    }
    return loading;
  };
  const router = Router();
  router.get("/liquidity/zec-dark", async (_req, res) => {
    try {
      res.set("Cache-Control", "no-store").json(await load());
    } catch {
      res.status(503).set("Cache-Control", "no-store").json({
        error: "ZEC-DARK pool statistics are temporarily unavailable.",
      });
    }
  });
  return router;
}

export default createZecDarkLiquidityRouter();
