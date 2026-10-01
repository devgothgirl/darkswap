import { isIP } from "node:net";
import { z } from "zod";
import {
  GetStonkfunPairsResponse, GetStonkfunTokensResponse, GetStonkfunTokenResponse,
  GetStonkfunTokensQueryParams, GetLaunchConfigResponse, GetLaunchAdminReviewsResponse,
} from "@workspace/api-zod";

export const NETWORK = "mainnet-beta" as const;
export const DARK_LOCKED_MESSAGE = "$DARK pairing is being activated for the DarkSwap ecosystem.";
const ORIGIN = "https://www.stonkfun.xyz";
const DEFAULT_BASE = `${ORIGIN}/api/public/v1`;
const FRESH_MS = 30_000;
const STALE_MS = 5 * 60_000;
const MAX_BYTES = 2 * 1024 * 1024;
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export type LaunchDiscoveryConfig = Pick<z.infer<typeof GetLaunchConfigResponse>,
  "darkPairingEnabled" | "darkTokenAddress" | "darkPairPriority" | "nearPairingEnabled" | "pairOverrides" | "paused">;
export type DiscoveryReview = Pick<z.infer<typeof GetLaunchAdminReviewsResponse>["reviews"][number],
  "targetType" | "target" | "network" | "suppressMetadata">;
export type DiscoveryToken = z.infer<typeof GetStonkfunTokenResponse>["token"];
export type DiscoveryPair = z.infer<typeof GetStonkfunPairsResponse>["pairs"][number];
export type DiscoveryQuery = z.infer<typeof GetStonkfunTokensQueryParams>;
export type DiscoverySource = z.infer<typeof GetStonkfunPairsResponse>["source"];
export type CatalogRecord = { token: DiscoveryToken; fetchedAt: Date; generatedAt: Date | null };
export interface DiscoveryCatalog {
  put(tokens: DiscoveryToken[], source: DiscoverySource): Promise<void>;
  get(mint: string): Promise<CatalogRecord | null>;
}
export class DiscoveryError extends Error {
  constructor(public status: number, public code: string, message: string, public retryAfter?: number) {
    super(message);
  }
}
export function validMint(value: unknown): value is string {
  if (typeof value !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return false;
  let n = 0n;
  for (const char of value) n = n * 58n + BigInt(ALPHABET.indexOf(char));
  let bytes = 0;
  for (; n > 0n; n >>= 8n) bytes++;
  for (const char of value) { if (char !== "1") break; bytes++; }
  return bytes === 32;
}
export function safeMetadataUrl(value: unknown, relative = false): string | null {
  if (typeof value !== "string" || !value || value.length > 2000 || /[\u0000-\u0020\\]/.test(value)) return null;
  try {
    const url = relative ? new URL(value, ORIGIN) : new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") ||
      isIP(host) || host.includes(":") || !host.includes(".") ||
      /(?:^|\.)(localhost|local|internal|test|invalid)$/.test(host)) return null;
    return url.href;
  } catch { return null; }
}
function text(value: unknown, max = 200): string | null {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max) : null;
}
const mintSchema = z.string().refine(validMint, "Invalid decoded Solana mint");
const optionalText = z.string().max(20_000).nullish();
const optionalNumber = z.number().finite().nullish();
const upstreamQuote = z.object({
  mint: mintSchema, name: z.string().max(20_000), symbol: z.string().max(20_000),
  logoUrl: optionalText, category: optionalText, categoryLabel: optionalText,
});
const upstreamToken = z.object({
  mint: mintSchema, pool: optionalText, name: z.string().max(20_000), symbol: z.string().max(20_000),
  quote: upstreamQuote.nullish(), description: optionalText, imageUrl: optionalText,
  links: z.object({ website: optionalText, twitter: optionalText, x: optionalText, telegram: optionalText,
    discord: optionalText, github: optionalText }).optional(),
  market: z.object({
    priceUsd: optionalNumber, marketCapUsd: optionalNumber, fdvUsd: optionalNumber,
    volume24hUsd: optionalNumber, liquidityUsd: optionalNumber, peakMarketCapUsd: optionalNumber,
    priceChange24h: optionalNumber,
  }),
  status: optionalText, graduationProgress: optionalNumber, createdAt: z.string().datetime().nullish(),
  graduatedAt: z.string().datetime().nullish(), launchpad: optionalText, mode: optionalText,
  quoteOnlyFees: z.boolean().nullish(), transferFee: z.object({ bps: z.number().int().min(0).max(10000) }).nullish(),
});
const upstreamPair = z.object({
  mint: mintSchema, name: z.string().max(20_000), symbol: z.string().max(20_000),
  decimals: z.number().int().min(0).max(255).nullish(), logoUrl: optionalText, category: optionalText,
  categoryLabel: optionalText, tokenProgram: optionalText,
  launchable: z.boolean(), launchLabReady: z.boolean().nullish(), symbolAmbiguous: z.boolean(),
});
const metaSchema = z.object({ generatedAt: z.string().datetime() });
const upstreamTokens = z.object({
  data: z.object({
    tokens: z.array(upstreamToken).max(100), network: z.literal(NETWORK),
    pagination: z.object({ page: z.number().int().min(1).max(100), pageSize: z.number().int().min(1).max(100),
      total: z.number().int().nonnegative(), totalPages: z.number().int().nonnegative() }),
  }), meta: metaSchema,
});
const upstreamPairs = z.object({
  data: z.object({ pairs: z.array(upstreamPair).max(5000), selectBy: z.literal("mint"),
    ambiguousSymbolCount: z.number().int().nonnegative() }), meta: metaSchema,
});
type UpstreamPair = z.infer<typeof upstreamPair>;
type UpstreamToken = z.infer<typeof upstreamToken>;
type CacheEntry = { value: unknown; fetchedAt: number; bytes: number };
type ReadResult<T> = { value: T; fetchedAt: number; stale: boolean; cache: boolean };

/** Bounded per-instance cache and request budget; no user-controlled origins or redirects. */
export class StonkfunClient {
  private cache = new Map<string, CacheEntry>();
  private inflight = new Map<string, Promise<ReadResult<unknown>>>();
  private bytes = 0;
  private cooldownUntil = 0;
  private window = 0;
  private requests = 0;
  private readonly base: string;
  constructor(private options: { fetch?: typeof fetch; now?: () => number; baseUrl?: string; timeoutMs?: number } = {}) {
    const base = new URL(options.baseUrl ?? process.env.STONKFUN_BASE_URL ?? DEFAULT_BASE);
    if (base.origin !== ORIGIN || base.pathname.replace(/\/$/, "") !== "/api/public/v1" ||
      base.username || base.password || base.search || base.hash) throw new Error("STONKFUN_BASE_URL must be the verified official public-v1 origin and path.");
    this.base = DEFAULT_BASE;
  }
  private now() { return this.options.now?.() ?? Date.now(); }
  private async read<T>(path: string, schema: z.ZodType<T>): Promise<ReadResult<T>> {
    const now = this.now();
    const existing = this.cache.get(path);
    if (existing && now - existing.fetchedAt < FRESH_MS) {
      this.cache.delete(path); this.cache.set(path, existing);
      return { value: existing.value as T, fetchedAt: existing.fetchedAt, stale: false, cache: true };
    }
    const pending = this.inflight.get(path);
    if (pending) return pending as Promise<ReadResult<T>>;
    const stale = () => existing && now - existing.fetchedAt <= STALE_MS
      ? { value: existing.value as T, fetchedAt: existing.fetchedAt, stale: true, cache: true } : null;
    if (now < this.cooldownUntil) {
      const fallback = stale(); if (fallback) return fallback;
      throw new DiscoveryError(429, "RATE_LIMITED", "Provider discovery is cooling down.", Math.ceil((this.cooldownUntil - now) / 1000));
    }
    if (now - this.window >= 60_000) { this.window = now; this.requests = 0; }
    if (this.inflight.size >= 4 || this.requests >= 60) {
      const fallback = stale(); if (fallback) return fallback;
      throw new DiscoveryError(429, "RATE_LIMITED", "Discovery request capacity reached. Retry shortly.", 10);
    }
    this.requests++;
    const work = (async (): Promise<ReadResult<T>> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 8_000);
      try {
        const response = await (this.options.fetch ?? fetch)(`${this.base}${path}`, {
          signal: controller.signal, redirect: "error", headers: { Accept: "application/json" },
        });
        if (response.status === 429) {
          const header = response.headers.get("retry-after");
          const seconds = header && /^\d+$/.test(header) ? Number(header) :
            header ? Math.ceil((Date.parse(header) - Date.now()) / 1000) : 30;
          const retry = Number.isFinite(seconds) ? Math.min(3600, Math.max(1, seconds)) : 30;
          this.cooldownUntil = this.now() + retry * 1000;
          throw new DiscoveryError(429, "RATE_LIMITED", "Provider discovery rate limit reached.", retry);
        }
        if (!response.ok) throw new DiscoveryError(502, "PROVIDER_FAILURE", "StonkFun discovery is temporarily unavailable.");
        if (!response.headers.get("content-type")?.toLowerCase().includes("application/json") ||
          Number(response.headers.get("content-length") ?? 0) > MAX_BYTES || !response.body) {
          throw new Error("Invalid upstream content type or size");
        }
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let length = 0;
        try {
          for (;;) {
            const { value, done } = await reader.read(); if (done) break;
            length += value.byteLength;
            if (length > MAX_BYTES) { controller.abort(); throw new Error("Upstream response exceeds 2 MiB"); }
            chunks.push(value);
          }
        } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
        const parsed = schema.parse(JSON.parse(Buffer.concat(chunks, length).toString("utf8")));
        const fetchedAt = this.now();
        // A tiny query count alone is not a memory bound: also cap aggregate bytes.
        if (existing) { this.cache.delete(path); this.bytes -= existing.bytes; }
        while (this.cache.size >= 64 || this.bytes + length > 8 * MAX_BYTES) {
          const oldest = this.cache.keys().next().value;
          if (!oldest) break;
          this.bytes -= this.cache.get(oldest)!.bytes; this.cache.delete(oldest);
        }
        this.cache.set(path, { value: parsed, fetchedAt, bytes: length }); this.bytes += length;
        return { value: parsed, fetchedAt, stale: false, cache: false };
      } catch (error) {
        const fallback = stale(); if (fallback) return fallback;
        if (error instanceof DiscoveryError) throw error;
        throw new DiscoveryError(502, "PROVIDER_FAILURE", "StonkFun returned unavailable or invalid discovery data.");
      } finally { clearTimeout(timer); }
    })();
    this.inflight.set(path, work);
    try { return await work; } finally { this.inflight.delete(path); }
  }
  pairs() { return this.read("/pairs?launchable=true", upstreamPairs); }
  async tokens(query: { page: number; pageSize: number; sort: "newest" | "volume"; q?: string; quoteMint?: string; status?: string }) {
    const params = new URLSearchParams();
    for (const key of ["page", "pageSize", "sort", "q", "quoteMint", "status"] as const) {
      if (query[key] !== undefined && query[key] !== "") params.set(key, String(query[key]));
    }
    const result = await this.read(`/tokens?${params}`, upstreamTokens);
    if (result.value.data.pagination.page !== query.page || result.value.data.pagination.pageSize !== query.pageSize ||
      result.value.data.tokens.length > query.pageSize) throw new DiscoveryError(502, "PROVIDER_FAILURE", "Provider pagination did not match the requested page.");
    return result;
  }
  source(result: ReadResult<{ meta: { generatedAt: string } }>): DiscoverySource {
    return { provider: "stonkfun", fetchedAt: new Date(result.fetchedAt), generatedAt: new Date(result.value.meta.generatedAt),
      stale: result.stale, cacheAgeSeconds: Math.max(0, (this.now() - result.fetchedAt) / 1000) };
  }
}

// Canonical mainnet USDC, explicit mint allowlist; symbols/categories are never identity.
const STABLECOINS = new Map([["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "https://developers.circle.com/stablecoins/usdc-contract-addresses"]]);
export function classifyPair(pair: Pick<UpstreamPair, "mint" | "launchable" | "launchLabReady">,
  config: LaunchDiscoveryConfig, current = true): DiscoveryPair["group"] {
  if (current && config.darkPairingEnabled && validMint(config.darkTokenAddress) &&
    pair.mint === config.darkTokenAddress && pair.launchable && pair.launchLabReady === true) return "dark";
  // USDC must never become NEAR through a category or operator typo.
  if (STABLECOINS.has(pair.mint)) return "stablecoin";
  const override = config.pairOverrides.find(p => p.network === NETWORK && p.mint === pair.mint && validMint(p.mint) && safeMetadataUrl(p.evidenceUrl));
  if (override?.group === "near" && config.nearPairingEnabled && override.enabled) return "near";
  if (override?.group === "stablecoin") return "stablecoin";
  return "other";
}
function tokenReview(mint: string, reviews: DiscoveryReview[]) {
  const matches = reviews.filter(r => r.network === NETWORK && r.targetType === "token" && r.target === mint);
  return { underReview: matches.length > 0, metadataSuppressed: matches.some(r => r.suppressMetadata) };
}
export function normalizePairs(raw: UpstreamPair[], config: LaunchDiscoveryConfig, reviews: DiscoveryReview[], current: boolean): DiscoveryPair[] {
  const counts = new Map<string, number>();
  const mints = new Set<string>();
  for (const p of raw) {
    if (mints.has(p.mint)) throw new DiscoveryError(502, "PROVIDER_FAILURE", "Provider returned duplicate pair identities.");
    mints.add(p.mint); counts.set(p.symbol.toUpperCase(), (counts.get(p.symbol.toUpperCase()) ?? 0) + 1);
  }
  const groups = { dark: 0, near: 1, stablecoin: 2, other: 3 };
  return raw.map(p => {
    const review = tokenReview(p.mint, reviews);
    const group = review.underReview ? "other" : classifyPair(p, config, current);
    const override = config.pairOverrides.find(o => o.network === NETWORK && o.mint === p.mint);
    const configuredDark = validMint(config.darkTokenAddress) && p.mint === config.darkTokenAddress;
    const enabled = current && p.launchable && p.launchLabReady === true && !config.paused &&
      !review.underReview && override?.enabled !== false && (!configuredDark || config.darkPairingEnabled);
    return {
      mint: p.mint, network: NETWORK, name: review.metadataSuppressed ? "Metadata suppressed" : text(p.name)!,
      symbol: review.metadataSuppressed ? "SUPPRESSED" : text(p.symbol, 64)!,
      decimals: p.decimals ?? null, logoUrl: review.metadataSuppressed ? null : safeMetadataUrl(p.logoUrl, true),
      category: review.metadataSuppressed ? null : text(p.category), categoryLabel: review.metadataSuppressed ? null : text(p.categoryLabel),
      tokenProgram: text(p.tokenProgram), launchable: p.launchable, launchLabReady: p.launchLabReady ?? null,
      symbolAmbiguous: p.symbolAmbiguous || (counts.get(p.symbol.toUpperCase()) ?? 0) > 1,
      group, enabled, priority: group === "dark" ? config.darkPairPriority : override?.priority ?? 100,
      evidenceUrl: review.metadataSuppressed ? null : STABLECOINS.get(p.mint) ?? safeMetadataUrl(override?.evidenceUrl),
      executionAvailable: false as const,
      unavailableReason: !current ? "Pair readiness is stale; refresh before preparation." :
        review.underReview ? "This pair is under review." :
        configuredDark && !enabled ? DARK_LOCKED_MESSAGE :
        !p.launchable || p.launchLabReady !== true ? "Upstream preparation readiness is not confirmed." :
        "Preparation only. The verified launch execution adapter is unavailable.",
    };
  }).sort((a, b) => groups[a.group] - groups[b.group] || a.priority - b.priority || a.mint.localeCompare(b.mint));
}
export function applyTokenPolicy(token: DiscoveryToken, pairs: DiscoveryPair[], reviews: DiscoveryReview[]): DiscoveryToken {
  const review = tokenReview(token.mint, reviews);
  const pair = token.quote && pairs.find(p => p.mint === token.quote!.mint && p.network === token.network);
  const quoteReview = token.quote ? tokenReview(token.quote.mint, reviews) : { metadataSuppressed: false };
  const quote = token.quote ? {
    ...token.quote, group: pair?.group ?? "other" as const, verified: Boolean(pair),
    ...(quoteReview.metadataSuppressed ? { name: "Metadata suppressed", symbol: "SUPPRESSED", logoUrl: null, category: null, categoryLabel: null } : {}),
  } : null;
  return { ...token, quote, darkPair: pair?.group === "dark" && !review.underReview, ...review,
    ...(review.metadataSuppressed ? { name: "Metadata suppressed", symbol: "SUPPRESSED", description: null,
      imageUrl: null, links: { website: null, x: null, telegram: null, discord: null, github: null } } : {}) };
}
export function normalizeToken(raw: UpstreamToken): DiscoveryToken {
  const positive = (value: number | null | undefined) => value != null && value >= 0 ? value : null;
  return {
    mint: raw.mint, network: NETWORK, pool: validMint(raw.pool) ? raw.pool : null,
    name: text(raw.name)!, symbol: text(raw.symbol, 64)!, description: text(raw.description, 2000),
    imageUrl: safeMetadataUrl(raw.imageUrl, true),
    links: { website: safeMetadataUrl(raw.links?.website), x: safeMetadataUrl(raw.links?.twitter ?? raw.links?.x),
      telegram: safeMetadataUrl(raw.links?.telegram), discord: safeMetadataUrl(raw.links?.discord), github: safeMetadataUrl(raw.links?.github) },
    quote: raw.quote ? { mint: raw.quote.mint, name: text(raw.quote.name)!, symbol: text(raw.quote.symbol, 64)!,
      logoUrl: safeMetadataUrl(raw.quote.logoUrl, true), category: text(raw.quote.category), categoryLabel: text(raw.quote.categoryLabel),
      group: "other", verified: false } : null,
    launchpad: text(raw.launchpad), mode: text(raw.mode), quoteOnlyFees: raw.quoteOnlyFees ?? null,
    transferFeeBps: raw.transferFee?.bps ?? null,
    metrics: { priceUsd: positive(raw.market.priceUsd), marketCapUsd: positive(raw.market.marketCapUsd),
      fdvUsd: positive(raw.market.fdvUsd), volume24hUsd: positive(raw.market.volume24hUsd),
      liquidityUsd: positive(raw.market.liquidityUsd), peakMarketCapUsd: positive(raw.market.peakMarketCapUsd),
      priceChange24h: raw.market.priceChange24h ?? null, holders: null, transactions: null, uniqueBuyers: null, holderGrowth: null },
    status: text(raw.status), graduationProgress: raw.graduationProgress ?? null,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : null, graduatedAt: raw.graduatedAt ? new Date(raw.graduatedAt) : null,
    creatorWallet: null, darkPair: false, underReview: false, metadataSuppressed: false,
  };
}
export function parseDiscoveryQuery(input: Record<string, unknown>): DiscoveryQuery {
  if (Object.values(input).some(v => typeof v !== "string")) throw new DiscoveryError(400, "INVALID_INPUT", "Each query parameter must occur once and be a string.");
  for (const key of ["page", "pageSize"]) {
    if (input[key] !== undefined && !/^[1-9]\d{0,2}$/.test(String(input[key]))) throw new DiscoveryError(400, "INVALID_INPUT", "Invalid pagination.");
  }
  const parsed = GetStonkfunTokensQueryParams.strict().safeParse(input);
  if (!parsed.success || (parsed.data.quoteMint && !validMint(parsed.data.quoteMint))) throw new DiscoveryError(400, "INVALID_INPUT", "Unsupported discovery query or invalid mint.");
  const query = parsed.data;
  const status = query.view === "graduating" ? "aboutToGraduate" : query.view === "graduated" ? "graduated" : undefined;
  if (status && query.status && query.status !== status) throw new DiscoveryError(400, "INVALID_INPUT", "Status conflicts with selected view.");
  return { ...query, status: status ?? query.status, sort: query.sort ?? (query.view === "trending" ? "volume" : "newest") };
}
const coverage = (warnings: string[] = []) => ({
  scope: "provider_page" as const, searchScope: "provider_catalog" as const, viewFilterScope: "provider_catalog" as const,
  creatorSearchAvailable: false as const, holderMetricsAvailable: false as const, transactionMetricsAvailable: false as const,
  graduationStatusVerified: true, rankingSignals: [] as ("provider_volume" | "provider_newest")[], warnings,
});

export class DiscoveryService {
  constructor(public readonly client: StonkfunClient, private catalog: DiscoveryCatalog) {}
  async pairs(config: LaunchDiscoveryConfig, reviews: DiscoveryReview[]) {
    const result = await this.client.pairs();
    const response = GetStonkfunPairsResponse.parse({
      pairs: normalizePairs(result.value.data.pairs, config, reviews, !result.stale),
      network: NETWORK, selectBy: "mint", ambiguousSymbolCount: result.value.data.ambiguousSymbolCount,
      source: this.client.source(result),
    });
    return { response, cacheState: result.stale ? "stale" : result.cache ? "cache" : "fresh" };
  }
  async tokens(query: DiscoveryQuery, config: LaunchDiscoveryConfig, reviews: DiscoveryReview[]) {
    const pairs = await this.pairs(config, reviews);
    const dark = pairs.response.pairs.find(p => p.group === "dark");
    const near = pairs.response.pairs.filter(p => p.group === "near");
    let quoteMint = query.quoteMint;
    if (query.view === "dark") {
      if (quoteMint && quoteMint !== config.darkTokenAddress) throw new DiscoveryError(400, "INVALID_INPUT", "quoteMint conflicts with the DARK view.");
      if (dark) quoteMint = dark.mint;
    }
    if (query.view === "near" && quoteMint && !near.some(p => p.mint === quoteMint)) throw new DiscoveryError(400, "INVALID_INPUT", "quoteMint is not a verified NEAR ecosystem pair.");
    if (query.view === "near" && near.length === 1) quoteMint = near[0].mint;
    const sort = query.sort ?? (query.view === "trending" ? "volume" : "newest");
    if ((query.view === "dark" && !dark) || (query.view === "near" && near.length === 0)) {
      return { response: GetStonkfunTokensResponse.parse({
        tokens: [], pagination: { page: query.page, pageSize: query.pageSize, total: 0, totalPages: 0, returned: 0, maxAccessiblePage: 1 },
        network: NETWORK, view: query.view, q: query.q, sort, quoteMint: null, status: query.status ?? null,
        source: pairs.response.source, coverage: { ...coverage([query.view === "dark" ? DARK_LOCKED_MESSAGE : "No operator-verified NEAR ecosystem pairs are configured."]),
          searchScope: "none", viewFilterScope: "none" },
      }), cacheState: pairs.cacheState };
    }
    const result = await this.client.tokens({ ...query, sort, quoteMint });
    const source = this.client.source(result);
    const normalized = result.value.data.tokens.map(normalizeToken);
    if (new Set(normalized.map(t => t.mint)).size !== normalized.length) throw new DiscoveryError(502, "PROVIDER_FAILURE", "Provider returned duplicate token identities.");
    // Assert documented exact filters rather than mislabeling a broken upstream filter.
    if (normalized.some(t => (quoteMint && t.quote?.mint !== quoteMint) || (query.status && t.status !== query.status))) {
      throw new DiscoveryError(502, "PROVIDER_FAILURE", "Provider returned tokens outside the requested filters.");
    }
    const warnings = ["Creator, holder, transaction and buyer metrics are unavailable. Search does not support creator or pair symbols."];
    try { await this.catalog.put(normalized, source); }
    catch { warnings.push("Persistent catalog storage is unavailable; direct-link indexing may be incomplete."); }
    let tokens = normalized.map(t => applyTokenPolicy(t, pairs.response.pairs, reviews));
    const locallyFiltered = query.view === "near" && !quoteMint;
    if (locallyFiltered) {
      tokens = tokens.filter(t => t.quote?.group === "near");
      warnings.push("NEAR matches filter only this provider page; totals describe the provider page set, not all NEAR matches.");
    }
    if (pairs.response.source.stale) warnings.push("Pair catalog is stale; DARK identity/readiness is not currently verified.");
    if (source.stale) warnings.push("Provider refresh failed or is rate-limited; this is bounded stale discovery data.");
    return { response: GetStonkfunTokensResponse.parse({
      tokens, pagination: { ...result.value.data.pagination, returned: tokens.length,
        maxAccessiblePage: Math.max(1, Math.min(100, result.value.data.pagination.totalPages)) },
      network: NETWORK, view: query.view, q: query.q, sort, quoteMint: quoteMint ?? null, status: query.status ?? null,
      source: { ...source, stale: source.stale || pairs.response.source.stale },
      coverage: { ...coverage(warnings), viewFilterScope: locallyFiltered ? "current_page" : "provider_catalog",
        rankingSignals: [sort === "volume" ? "provider_volume" : "provider_newest"] },
    }), cacheState: result.stale || pairs.response.source.stale ? "stale" : result.cache ? "cache" : "fresh" };
  }
  async token(mint: string, config: LaunchDiscoveryConfig, reviews: DiscoveryReview[]) {
    if (!validMint(mint)) throw new DiscoveryError(400, "INVALID_INPUT", "Invalid Solana mint.");
    let indexed: CatalogRecord | null = null;
    let storageFailed = false;
    try { indexed = await this.catalog.get(mint); } catch { storageFailed = true; }
    let result: Awaited<ReturnType<StonkfunClient["tokens"]>> | undefined;
    try { result = await this.client.tokens({ page: 1, pageSize: 100, q: mint, sort: "newest" }); }
    catch (error) { if (!indexed) throw error; }
    const match = result?.value.data.tokens.find(t => t.mint === mint);
    const warnings = ["Creator attribution and holder/transaction metrics are unavailable."];
    let token: DiscoveryToken;
    let source: DiscoverySource;
    if (match && result) {
      token = normalizeToken(match); source = this.client.source(result);
      try { await this.catalog.put([token], source); } catch { storageFailed = true; }
    } else if (indexed) {
      token = indexed.token;
      source = { provider: "stonkfun", fetchedAt: indexed.fetchedAt, generatedAt: indexed.generatedAt,
        stale: true, cacheAgeSeconds: Math.max(0, (Date.now() - indexed.fetchedAt.getTime()) / 1000) };
      warnings.push("Showing a previously indexed observation; current upstream lookup did not establish a fresh exact match.");
    } else {
      if (storageFailed) throw new DiscoveryError(503, "STORAGE_UNAVAILABLE", "Persistent discovery catalog is unavailable.");
      if (result?.stale) throw new DiscoveryError(502, "PROVIDER_FAILURE", "Current exact-mint lookup is unavailable; the stale discovery page does not establish a match.");
      throw new DiscoveryError(404, "NOT_INDEXED", "No exact mint was found in the bounded discovery lookup. This does not establish that the token does not exist.");
    }
    if (storageFailed) warnings.push("Persistent catalog storage is temporarily unavailable.");
    let pairs: DiscoveryPair[] = [];
    try {
      const pairResult = await this.pairs(config, reviews); pairs = pairResult.response.pairs;
      source.stale ||= pairResult.response.source.stale;
    } catch {
      source.stale = true; warnings.push("Current pair verification is unavailable; ecosystem classification is withheld.");
    }
    return { response: GetStonkfunTokenResponse.parse({
      token: applyTokenPolicy(token, pairs, reviews), source,
      coverage: { ...coverage(warnings), scope: match ? "provider_page" : "indexed_catalog", searchScope: "none", viewFilterScope: "none" },
    }), cacheState: source.stale ? "stale" : result?.cache ? "cache" : "fresh" };
  }
}