import assert from "node:assert/strict";
import test from "node:test";
import {
  StonkfunClient, DiscoveryService, DiscoveryError, classifyPair, normalizePairs,
  safeMetadataUrl, validMint, parseDiscoveryQuery, NETWORK, type DiscoveryCatalog,
  type LaunchDiscoveryConfig, type CatalogRecord, type DiscoveryReview,
} from "./stonkfun";

const MINT = "So11111111111111111111111111111111111111112";
const DARK = "11111111111111111111111111111111";
const OTHER = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const DATE = "2026-10-01T08:00:00.000Z";
const config: LaunchDiscoveryConfig = {
  darkPairingEnabled: false, darkTokenAddress: null, darkPairPriority: 1,
  nearPairingEnabled: false, pairOverrides: [], paused: false,
};
const pair = (mint = MINT, symbol = "DARK") => ({
  mint, symbol, name: symbol, decimals: 9, launchable: true, launchLabReady: true,
  symbolAmbiguous: false, logoUrl: "/api/logo?v=1",
});
const token = (mint = MINT, quoteMint = DARK) => ({
  mint, name: "Untrusted token", symbol: "DARK", pool: OTHER,
  quote: { mint: quoteMint, symbol: "DARK", name: "DARK", logoUrl: "/api/quote?v=2" },
  market: { volume24hUsd: 12, priceUsd: 0.5 }, links: { twitter: "https://x.com/example", website: "javascript:alert(1)" },
  status: "new", createdAt: DATE, imageUrl: "/api/logo?v=1", creator: OTHER,
});
const pairBody = (pairs = [pair(DARK)]) => ({ data: { pairs, selectBy: "mint", ambiguousSymbolCount: 0 }, meta: { generatedAt: DATE } });
const tokenBody = (tokens = [token()], page = 1, pageSize = 25) => ({
  data: { tokens, network: NETWORK, pagination: { page, pageSize, total: 500, totalPages: Math.ceil(500 / pageSize) } },
  meta: { generatedAt: DATE },
});
function catalog() {
  const records = new Map<string, CatalogRecord>();
  const store: DiscoveryCatalog = {
    async put(tokens, source) { for (const t of tokens) records.set(t.mint, { token: t, fetchedAt: source.fetchedAt, generatedAt: source.generatedAt }); },
    async get(mint) { return records.get(mint) ?? null; },
  };
  return { store, records };
}
function provider(handler: (url: URL) => unknown | Promise<unknown>): typeof fetch {
  return (async input => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://www.stonkfun.xyz");
    const body = await handler(url);
    return body instanceof Response ? body : Response.json(body);
  }) as typeof fetch;
}

test("decoded Solana keys and safe metadata URLs reject spoofed inputs", () => {
  assert.equal(validMint(DARK), true);
  assert.equal(validMint("1".repeat(44)), false);
  assert.equal(validMint("0".repeat(32)), false);
  assert.equal(safeMetadataUrl("/api/logo?v=1", true), "https://www.stonkfun.xyz/api/logo?v=1");
  for (const url of ["javascript:alert(1)", "data:image/svg+xml,x", "https://user:pass@x.com/a", "https://127.0.0.1/a",
    "https://[::1]/a", "https://2130706433/a", "https://localhost/a", "http://example.com/a", "https://a.internal/a", "https://x.com\\@evil.com"]) {
    assert.equal(safeMetadataUrl(url, true), null, url);
  }
});
test("DARK requires exact configured identity plus both current gates; symbols never classify", () => {
  const enabled = { ...config, darkPairingEnabled: true, darkTokenAddress: DARK };
  assert.equal(classifyPair(pair(DARK), config), "other");
  assert.equal(classifyPair(pair(MINT), enabled), "other");
  assert.equal(classifyPair(pair(DARK), enabled), "dark");
  assert.equal(classifyPair({ ...pair(DARK), launchLabReady: undefined }, enabled), "other");
  assert.equal(classifyPair({ ...pair(DARK), launchable: false }, enabled), "other");
  assert.equal(classifyPair(pair(DARK), enabled, false), "other");
  assert.equal(classifyPair(pair(DARK), { ...enabled, darkTokenAddress: "1".repeat(44) }), "other");
  const pairs = normalizePairs([pair(MINT), pair(DARK)], enabled, [], true);
  assert.equal(pairs[0].mint, DARK);
  assert.ok(pairs.every(p => p.symbolAmbiguous && p.executionAvailable === false));
  assert.equal(normalizePairs([{ ...pair(MINT), launchLabReady: null }], enabled, [], true)[0].enabled, false);
  assert.equal(normalizePairs([pair(DARK)], enabled, [], false)[0].enabled, false);
});
test("NEAR needs mint/network evidence and cannot relabel canonical USDC", () => {
  const near = { ...config, nearPairingEnabled: true, pairOverrides: [
    { mint: MINT, network: NETWORK, enabled: true, priority: 2, group: "near" as const, evidenceUrl: "https://example.com/evidence" },
    { mint: USDC, network: NETWORK, enabled: true, priority: 2, group: "near" as const, evidenceUrl: "https://example.com/evidence" },
  ] };
  assert.equal(classifyPair(pair(MINT, "NOTNEAR"), near), "near");
  assert.equal(classifyPair(pair(OTHER, "NEAR"), near), "other");
  assert.equal(classifyPair(pair(USDC, "NEAR"), near), "stablecoin");
  assert.equal(classifyPair(pair(MINT), { ...near, nearPairingEnabled: false }), "other");
});
test("strict query allowlist rejects unsupported creator search, arrays, coercion and conflicting statuses", () => {
  for (const q of [{ creator: MINT }, { q: ["a", "b"] }, { page: "1.5" }, { page: "1e1" }, { page: "101" },
    { pageSize: "0" }, { quoteMint: "1".repeat(44) }, { view: "graduating", status: "graduated" }]) {
    assert.throws(() => parseDiscoveryQuery(q), DiscoveryError);
  }
  assert.equal(parseDiscoveryQuery({ view: "graduating" }).status, "aboutToGraduate");
  assert.equal(parseDiscoveryQuery({}).sort, "volume");
  assert.equal(parseDiscoveryQuery({ view: "new" }).sort, "newest");
});
test("provider-wide q, page and status are forwarded; pagination remains provider totals", async () => {
  const seen: URL[] = [];
  const client = new StonkfunClient({ fetch: provider(url => {
    seen.push(url);
    if (url.pathname.endsWith("/pairs")) return pairBody();
    return tokenBody([{ ...token(), status: "graduated" }], Number(url.searchParams.get("page")), Number(url.searchParams.get("pageSize")));
  }) });
  const { store, records } = catalog();
  const service = new DiscoveryService(client, store);
  const result = await service.tokens(parseDiscoveryQuery({ q: "older", page: "2", pageSize: "10", view: "graduated" }), config, []);
  const request = seen.find(u => u.pathname.endsWith("/tokens"))!;
  assert.equal(request.searchParams.get("q"), "older");
  assert.equal(request.searchParams.get("status"), "graduated");
  assert.equal(request.searchParams.get("page"), "2");
  assert.equal(result.response.pagination.total, 500);
  assert.equal(result.response.pagination.returned, 1);
  assert.equal(result.response.tokens[0].creatorWallet, null);
  assert.equal(result.response.tokens[0].metrics.holders, null);
  assert.equal(result.response.tokens[0].links.website, null);
  assert.equal(records.size, 1);
});
test("singleflight, bounded stale fallback, provider failure and recovery are explicit", async () => {
  let now = 1_800_000_000_000;
  let fail = false;
  let calls = 0;
  const client = new StonkfunClient({ now: () => now, fetch: provider(async () => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 5));
    return fail ? Response.json({}, { status: 503 }) : pairBody();
  }) });
  const initial = await Promise.all([client.pairs(), client.pairs(), client.pairs()]);
  assert.equal(calls, 1);
  assert.equal(initial[0].stale, false);
  assert.equal((await client.pairs()).cache, true);
  now += 31_000; fail = true;
  assert.equal((await client.pairs()).stale, true);
  now += 301_000;
  await assert.rejects(client.pairs(), (e: DiscoveryError) => e.status === 502 && e.code === "PROVIDER_FAILURE");
  fail = false;
  assert.equal((await client.pairs()).stale, false);
});
test("rate limit Retry-After cooldown, concurrency and malformed/oversize reads fail closed", async () => {
  let calls = 0;
  const limited = new StonkfunClient({ fetch: provider(() => { calls++; return Response.json({}, { status: 429, headers: { "Retry-After": "42" } }); }) });
  await assert.rejects(limited.pairs(), (e: DiscoveryError) => e.status === 429 && e.retryAfter === 42);
  await assert.rejects(limited.tokens({ page: 1, pageSize: 25, sort: "newest" }), (e: DiscoveryError) => e.status === 429);
  assert.equal(calls, 1);
  const malformed = new StonkfunClient({ fetch: provider(() => ({ data: { pairs: [] } })) });
  await assert.rejects(malformed.pairs(), (e: DiscoveryError) => e.code === "PROVIDER_FAILURE");
  const oversized = new StonkfunClient({ fetch: provider(() => new Response("x".repeat(2 * 1024 * 1024 + 1), { headers: { "Content-Type": "application/json" } })) });
  await assert.rejects(oversized.pairs(), (e: DiscoveryError) => e.status === 502);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const bounded = new StonkfunClient({ fetch: provider(async url => {
    await gate;
    return tokenBody([], Number(url.searchParams.get("page")), 25);
  }) });
  const work = [1, 2, 3, 4].map(page => bounded.tokens({ page, pageSize: 25, sort: "newest" }));
  await assert.rejects(bounded.tokens({ page: 5, pageSize: 25, sort: "newest" }), (e: DiscoveryError) => e.status === 429);
  release(); await Promise.all(work);
});
test("timeouts abort the request rather than waiting indefinitely", async () => {
  const client = new StonkfunClient({ timeoutMs: 5, fetch: (async (_url, init) => {
    return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
  }) as typeof fetch });
  await assert.rejects(client.pairs(), (e: DiscoveryError) => e.status === 502);
});
test("unique-query abuse has a global budget and the cache evicts older pages", async () => {
  let now = 1_800_000_000_000;
  let calls = 0;
  const client = new StonkfunClient({ now: () => now, fetch: provider(url => {
    calls++; return tokenBody([], Number(url.searchParams.get("page")), 25);
  }) });
  for (let i = 1; i <= 60; i++) await client.tokens({ page: i, pageSize: 25, sort: "newest" });
  await assert.rejects(client.tokens({ page: 61, pageSize: 25, sort: "newest" }), (e: DiscoveryError) => e.status === 429);
  now += 60_001;
  for (let i = 61; i <= 65; i++) await client.tokens({ page: i, pageSize: 25, sort: "newest" });
  const before = calls;
  const first = await client.tokens({ page: 1, pageSize: 25, sort: "newest" });
  assert.equal(first.cache, false);
  assert.equal(calls, before + 1);
});
test("suppression is reapplied on cache hits, list, quote, detail and pairs; reviewed identities lose DARK promotion", async () => {
  const enabled = { ...config, darkPairingEnabled: true, darkTokenAddress: DARK };
  const client = new StonkfunClient({ fetch: provider(url => url.pathname.endsWith("/pairs") ? pairBody() :
    tokenBody([token()], 1, Number(url.searchParams.get("pageSize")))) });
  const { store } = catalog();
  const service = new DiscoveryService(client, store);
  const first = await service.tokens(parseDiscoveryQuery({}), enabled, []);
  assert.equal(first.response.tokens[0].darkPair, true);
  const reviews: DiscoveryReview[] = [MINT, DARK].map(target => ({ targetType: "token", target, network: NETWORK, suppressMetadata: true }));
  const second = await service.tokens(parseDiscoveryQuery({}), enabled, reviews);
  assert.equal(second.cacheState, "cache");
  assert.equal(second.response.tokens[0].name, "Metadata suppressed");
  assert.equal(second.response.tokens[0].quote?.symbol, "SUPPRESSED");
  assert.equal(second.response.tokens[0].darkPair, false);
  assert.equal(second.response.tokens[0].imageUrl, null);
  const details = await service.token(MINT, enabled, reviews);
  assert.equal(details.response.token.metadataSuppressed, true);
  const pairs = await service.pairs(enabled, reviews);
  assert.equal(pairs.response.pairs[0].logoUrl, null);
  assert.equal(pairs.response.pairs[0].enabled, false);
});
test("direct links require exact mint equality; no absence fabrication; indexed provider failures are stale", async () => {
  let fail = false;
  let now = 1_800_000_000_000;
  const client = new StonkfunClient({ now: () => now, fetch: provider(url => {
    if (fail) return Response.json({}, { status: 503 });
    if (url.pathname.endsWith("/pairs")) return pairBody();
    return tokenBody([token()], 1, Number(url.searchParams.get("pageSize")));
  }) });
  const { store } = catalog();
  const service = new DiscoveryService(client, store);
  await assert.rejects(service.token(OTHER, config, []), (e: DiscoveryError) => e.code === "NOT_INDEXED");
  assert.equal((await service.token(MINT, config, [])).response.token.mint, MINT);
  now += 301_000; fail = true;
  const recovered = await service.token(MINT, config, []);
  assert.equal(recovered.response.source.stale, true);
  assert.equal(recovered.response.coverage.scope, "indexed_catalog");
  await assert.rejects(service.token(USDC, config, []), (e: DiscoveryError) => e.code === "PROVIDER_FAILURE");
});
test("multiple NEAR mints disclose page-local coverage and preserve upstream pagination", async () => {
  const near: LaunchDiscoveryConfig = { ...config, nearPairingEnabled: true,
    pairOverrides: [DARK, OTHER].map(mint => ({ mint, network: NETWORK, enabled: true, priority: 2, group: "near", evidenceUrl: "https://example.com/evidence" })) };
  const client = new StonkfunClient({ fetch: provider(url => url.pathname.endsWith("/pairs") ? pairBody([pair(DARK), pair(OTHER)]) :
    tokenBody([token(MINT, DARK), token(USDC, USDC)])) });
  const service = new DiscoveryService(client, catalog().store);
  const result = await service.tokens(parseDiscoveryQuery({ view: "near" }), near, []);
  assert.equal(result.response.tokens.length, 1);
  assert.equal(result.response.pagination.total, 500);
  assert.equal(result.response.coverage.viewFilterScope, "current_page");
});
test("filter violations and mismatched provider pagination are provider errors", async () => {
  const client = new StonkfunClient({ fetch: provider(url => url.pathname.endsWith("/pairs") ? pairBody() : tokenBody()) });
  const service = new DiscoveryService(client, catalog().store);
  await assert.rejects(service.tokens(parseDiscoveryQuery({ status: "graduated" }), config, []), (e: DiscoveryError) => e.code === "PROVIDER_FAILURE");
  await assert.rejects(service.tokens(parseDiscoveryQuery({ page: "2" }), config, []), (e: DiscoveryError) => e.code === "PROVIDER_FAILURE");
});