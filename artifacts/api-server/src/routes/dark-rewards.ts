import { Router, type IRouter } from "express";
import { GetDarkRewardsEstimateResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger";

/**
 * Owner-confirmed $DARK holder distributions. Update these when the owner confirms a new round.
 * Token amounts stay server-side; the site shows only the daily USD estimate and holder counts.
 */
export const CONFIRMED_DISTRIBUTIONS = {
  asOf: "October 3, 2026",
  // 1,614.788842156 recorded by the rewards console before the 6th airdrop
  // + 947.694 announced for the 6th + 463.786 announced for the 7th.
  wnearPaid: 1614.788842156 + 947.694 + 463.786,
  // Deliberately excluded from the all-time USD figure. The rewards console counts
  // wNEAR distributions only, and pricing this separate $DARK airdrop on top made the
  // two surfaces disagree. Keep it out unless the console starts counting it too.
  darkAirdropped: 3_140_000,
  latestAirdrop: { number: 7, wnear: 463.786, holders: 507 },
} as const;

const DARK_MINT = "7KEPApdbBMByrmqihz3bht2uMhFQcatjfSFQCKq66kH3";
const NEAR_TOKENS_URL = "https://1click.chaindefuser.com/v0/tokens";
const DARK_TOKEN_URL = `https://www.stonkfun.xyz/api/public/v1/tokens/${DARK_MINT}`;
/** A previous day's estimate may be served while today's prices are unavailable, but never older than this. */
const MAX_STALE_MS = 48 * 60 * 60 * 1000;

type Prices = { nearUsd: number; darkUsd: number };
type Estimate = ReturnType<typeof GetDarkRewardsEstimateResponse.parse>;

const positive = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

export async function fetchPrices(fetcher: typeof fetch = fetch): Promise<Prices> {
  const get = async (url: string) => {
    const response = await fetcher(url, { signal: AbortSignal.timeout(10_000), headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Price source responded ${response.status}`);
    return response.json() as Promise<unknown>;
  };
  const [nearList, darkDetail] = await Promise.all([get(NEAR_TOKENS_URL), get(DARK_TOKEN_URL)]);
  const near = Array.isArray(nearList)
    ? nearList.find(entry => entry && typeof entry === "object" && (entry as Record<string, unknown>).assetId === "nep141:wrap.near")
    : undefined;
  const nearUsd = positive((near as Record<string, unknown> | undefined)?.price);
  const token = (darkDetail as { data?: { token?: { mint?: unknown; market?: { priceUsd?: unknown } } } })?.data?.token;
  const darkUsd = token?.mint === DARK_MINT ? positive(token.market?.priceUsd) : null;
  if (nearUsd === null || darkUsd === null) throw new Error("Price source returned no valid price");
  return { nearUsd, darkUsd };
}

export function buildEstimate(prices: Prices, pricedAt: Date): Estimate {
  const c = CONFIRMED_DISTRIBUTIONS;
  return GetDarkRewardsEstimateResponse.parse({
    confirmedAsOf: c.asOf,
    pricedAt: pricedAt.toISOString(),
    allTimeUsd: c.wnearPaid * prices.nearUsd,
    latestAirdrop: { number: c.latestAirdrop.number, usd: c.latestAirdrop.wnear * prices.nearUsd, holders: c.latestAirdrop.holders },
  });
}

/** Prices are fetched at most once per UTC day. */
export function createDarkRewardsRouter(options: { fetcher?: typeof fetch; now?: () => number } = {}): IRouter {
  const now = options.now ?? Date.now;
  let cached: { day: string; at: number; estimate: Estimate } | null = null;
  let loading: Promise<Estimate> | null = null;
  const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

  const load = async (): Promise<Estimate> => {
    const time = now();
    if (cached && cached.day === utcDay(time)) return cached.estimate;
    if (!loading) {
      loading = fetchPrices(options.fetcher).then(prices => {
        const estimate = buildEstimate(prices, new Date(time));
        cached = { day: utcDay(time), at: time, estimate };
        return estimate;
      }).finally(() => { loading = null; });
    }
    try {
      return await loading;
    } catch (error) {
      if (cached && time - cached.at <= MAX_STALE_MS) {
        logger.warn({ err: error }, "DARK rewards prices unavailable; serving previous daily estimate");
        return cached.estimate;
      }
      throw error;
    }
  };

  const router = Router();
  router.get("/dark-rewards/estimate", async (req, res) => {
    try {
      const estimate = await load();
      res.set("Cache-Control", "public, max-age=3600").json(estimate);
    } catch (error) {
      req.log.warn({ err: error }, "DARK rewards estimate unavailable");
      res.status(503).set("Cache-Control", "no-store").json({ error: "Reward estimates are temporarily unavailable." });
    }
  });
  return router;
}

export default createDarkRewardsRouter();
