import { Router, type IRouter } from "express";
import { GetNearTrendsQueryParams, GetNearTrendsResponse, SearchNearPoolsQueryParams, SearchNearPoolsResponse } from "@workspace/api-zod";

const router: IRouter = Router();
type View = "trending" | "new";
type Trends = ReturnType<typeof GetNearTrendsResponse.parse>;
type SearchResults = ReturnType<typeof SearchNearPoolsResponse.parse>;

const cache = new Map<View, { value: Trends; expires: number }>();
const pending = new Map<View, Promise<Trends>>();
const searchCache = new Map<string, { value: SearchResults; expires: number }>();
const searchPending = new Map<string, Promise<SearchResults>>();

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function number(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function relationshipId(value: unknown): string | null {
  const id = object(object(value)?.data)?.id;
  return typeof id === "string" ? id : null;
}

function parsePoolRows(payload: unknown): { pools: Trends["pools"]; hasRawRows: boolean } {
  const root = object(payload);
  if (!root || !Array.isArray(root.data)
    || (!Array.isArray(root.included) && !(root.data.length === 0 && root.included === undefined))) {
    throw new Error("Invalid market data response");
  }
  const included = new Map<string, Record<string, unknown>>();
  for (const item of root.included ?? []) {
    const entry = object(item);
    if (entry && typeof entry.id === "string") included.set(entry.id, object(entry.attributes) ?? {});
  }
  const pools = root.data.flatMap((raw: unknown) => {
    const pool = object(raw);
    const attrs = object(pool?.attributes);
    const relations = object(pool?.relationships);
    const token = included.get(relationshipId(relations?.base_token) ?? "");
    const dex = included.get(relationshipId(relations?.dex) ?? "");
    const tx24h = object(object(attrs?.transactions)?.h24);
    const address = attrs?.address;
    if (typeof pool?.id !== "string" || typeof address !== "string" || !address || !tx24h
      || typeof token?.symbol !== "string" || typeof token.name !== "string"
      || typeof token.address !== "string" || !Number.isInteger(tx24h.buys)
      || !Number.isInteger(tx24h.sells)) return [];
    const image = token.image_url;
    return [{
      id: pool.id,
      address,
      tokenSymbol: token.symbol,
      tokenName: token.name,
      tokenAddress: token.address,
      tokenImage: typeof image === "string" && image.startsWith("https://") ? image : null,
      dex: typeof dex?.name === "string" ? dex.name : "Unknown DEX",
      priceUsd: number(attrs.base_token_price_usd),
      priceChange24h: number(object(attrs.price_change_percentage)?.h24),
      volume24h: number(object(attrs.volume_usd)?.h24),
      liquidityUsd: number(attrs.reserve_in_usd),
      buys24h: tx24h.buys as number,
      sells24h: tx24h.sells as number,
      createdAt: typeof attrs.pool_created_at === "string" ? attrs.pool_created_at : null,
      url: `https://www.geckoterminal.com/near/pools/${encodeURIComponent(address)}`,
    }];
  });
  return { pools, hasRawRows: root.data.length > 0 };
}

export function parseNearPools(payload: unknown, view: View, updatedAt: string): Trends {
  return GetNearTrendsResponse.parse({
    view, updatedAt, source: "GeckoTerminal", pools: parsePoolRows(payload).pools,
  });
}

async function load(view: View): Promise<Trends> {
  const cached = cache.get(view);
  if (cached && cached.expires > Date.now()) return cached.value;
  const existing = pending.get(view);
  if (existing) return existing;
  const task = (async () => {
    const path = view === "new" ? "new_pools" : "trending_pools";
    const response = await fetch(`https://api.geckoterminal.com/api/v2/networks/near/${path}?include=base_token,quote_token,dex`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Market provider HTTP ${response.status}`);
    const result = parseNearPools(await response.json(), view, new Date().toISOString());
    cache.set(view, { value: result, expires: Date.now() + 90_000 });
    return result;
  })();
  pending.set(view, task);
  try { return await task; }
  finally { pending.delete(view); }
}

async function searchPools(query: string, page: number): Promise<SearchResults> {
  const cacheKey = JSON.stringify([query, page]);
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value;
  const existing = searchPending.get(cacheKey);
  if (existing) return existing;
  const task = (async () => {
    const params = new URLSearchParams({
      query, page: String(page), network: "near", include: "base_token,quote_token,dex",
    });
    const response = await fetch(`https://api.geckoterminal.com/api/v2/search/pools?${params}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Market provider HTTP ${response.status}`);
    const payload: unknown = await response.json();
    const parsedPools = parsePoolRows(payload);
    const result = SearchNearPoolsResponse.parse({
      query, page, hasNextPage: parsedPools.hasRawRows && page < 10,
      updatedAt: new Date().toISOString(), source: "GeckoTerminal", pools: parsedPools.pools,
    });
    // Bound the number of distinct search pages retained in memory.
    if (searchCache.size >= 100) searchCache.delete(searchCache.keys().next().value!);
    searchCache.set(cacheKey, { value: result, expires: Date.now() + 90_000 });
    return result;
  })();
  searchPending.set(cacheKey, task);
  try { return await task; }
  finally { searchPending.delete(cacheKey); }
}

router.get("/near/trends", async (req, res): Promise<void> => {
  const parsed = GetNearTrendsQueryParams.safeParse(req.query);
  if (!parsed.success || Array.isArray(req.query.view)) {
    res.status(400).json({ error: "Invalid market view." });
    return;
  }
  try {
    const trends = await load(parsed.data.view ?? "trending");
    res.set("Cache-Control", "public, max-age=60").json(trends);
  } catch {
    req.log.error("NEAR market data unavailable");
    res.status(503).json({ error: "NEAR market data is temporarily unavailable. Please try again." });
  }
});

router.get("/near/pools/search", async (req, res): Promise<void> => {
  const rawQuery = req.query.query;
  const rawPage = req.query.page;
  const queryIsScalar = typeof rawQuery === "string";
  const pageIsScalar = rawPage === undefined || typeof rawPage === "string";
  const query = typeof rawQuery === "string" ? rawQuery.trim() : null;
  const pageIsStrictInteger = rawPage === undefined
    || (typeof rawPage === "string" && /^\d+$/.test(rawPage));
  const parsed = SearchNearPoolsQueryParams.safeParse({
    query,
    ...(rawPage === undefined ? {} : { page: rawPage }),
  });
  if (!queryIsScalar || !pageIsScalar || Array.isArray(rawQuery) || Array.isArray(rawPage)
    || !pageIsStrictInteger || !query || !parsed.success) {
    res.status(400).json({ error: "Enter a search term between 2 and 100 characters and a page between 1 and 10." });
    return;
  }
  try {
    res.set("Cache-Control", "public, max-age=60")
      .json(await searchPools(query.toLocaleLowerCase(), parsed.data.page));
  } catch {
    req.log.error("NEAR pool search unavailable");
    res.status(503).json({ error: "NEAR pool search is temporarily unavailable. Please try again." });
  }
});

export default router;