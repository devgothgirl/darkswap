import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import router from "./near-trends";

function providerPool(id: string, symbol: string) {
  return {
    data: [{
      id, attributes: {
        address: `${id}.near`, transactions: { h24: { buys: 2, sells: 3 } },
        base_token_price_usd: "0.25", volume_usd: { h24: "100" },
        reserve_in_usd: "200",
      },
      relationships: { base_token: { data: { id: `token-${id}` } }, dex: { data: { id: "dex" } } },
    }],
    included: [
      { id: `token-${id}`, attributes: { symbol, name: `${symbol} Token`, address: `${symbol}.near` } },
      { id: "dex", attributes: { name: "Test DEX" } },
    ],
  };
}

test("NEAR search validates inputs, searches beyond the feed, and reuses normalized cached results", async () => {
  const app = express();
  app.use((req, _res, next) => {
    req.log = { error() {} } as unknown as typeof req.log;
    next();
  });
  app.use(router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const realFetch = globalThis.fetch;
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const providerRequests: URL[] = [];
  let failRetryPageTwo = true;
  let releaseConcurrent: (() => void) | undefined;
  let concurrentStartedResolve: (() => void) | undefined;
  const concurrentStarted = new Promise<void>(resolve => { concurrentStartedResolve = resolve; });
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://api.geckoterminal.com", "no live provider requests");
    providerRequests.push(url);
    if (!url.pathname.includes("/search/pools")) return Response.json(providerPool("first-page-pool", "NEW"));

    const query = url.searchParams.get("query");
    const page = Number(url.searchParams.get("page"));
    if (query === "retry-page-two" && page === 2 && failRetryPageTwo) {
      return Response.json({}, { status: 503 });
    }
    if (query === "concurrent-page-two" && page === 2) {
      concurrentStartedResolve?.();
      await new Promise<void>(resolve => { releaseConcurrent = resolve; });
      return Response.json(providerPool("concurrent-pool", "PARALLEL"));
    }
    if (query === "empty-raw-page") return Response.json({ data: [] });
    if (query === "filtered-raw-page") return Response.json({ data: [{ id: "un-normalizable" }], included: [] });
    if (query === "malformed-payload") return Response.json({ data: [{ id: "missing-included" }] });
    if (page === 10) return Response.json(providerPool("page-ten-pool", "TEN"));
    if (page === 2) return Response.json(providerPool("older-pool-page-two", "OLD2"));
    return Response.json(providerPool("older-pool", "OLD"));
  };
  const get = (path: string) => realFetch(origin + path);
  const searchRequestCount = (query: string, page: string) => providerRequests.filter(url =>
    url.pathname.includes("/search/pools")
      && url.searchParams.get("query") === query
      && url.searchParams.get("page") === page).length;
  try {
    const invalidSearches = [
      "", "?query=a", "?query=%20a%20", `?query=${"x".repeat(101)}`,
      "?query=old&query=new", "?query=valid&page=", "?query=valid&page=%20",
      "?query=valid&page=1&page=2", "?query=valid&page=1.5", "?query=valid&page=abc",
      "?query=valid&page=1e1", "?query=valid&page=0", "?query=valid&page=11",
    ];
    for (const query of invalidSearches) {
      const response = await get(`/near/pools/search${query}`);
      assert.equal(response.status, 400, query);
    }
    assert.equal(providerRequests.length, 0, "invalid terms must not call the provider");

    const feed = await get("/near/trends?view=trending");
    assert.equal(feed.status, 200);
    assert.deepEqual((await feed.json() as { pools: { id: string }[] }).pools.map(pool => pool.id), ["first-page-pool"]);

    const search = await get("/near/pools/search?query=%20OLD%20");
    assert.equal(search.status, 200);
    assert.equal(search.headers.get("cache-control"), "public, max-age=60");
    const body = await search.json() as {
      query: string; page: number; hasNextPage: boolean; updatedAt: string; source: string;
      pools: { id: string; tokenSymbol: string; url: string }[];
    };
    assert.equal(body.query, "old");
    assert.equal(body.page, 1, "page defaults to one");
    assert.equal(body.hasNextPage, true);
    assert.ok(Number.isFinite(Date.parse(body.updatedAt)), "response preserves its update timestamp");
    assert.equal(body.source, "GeckoTerminal", "response preserves provider attribution");
    assert.deepEqual(body.pools.map(pool => [pool.id, pool.tokenSymbol]), [["older-pool", "OLD"]]);
    assert.equal(body.pools[0].url, "https://www.geckoterminal.com/near/pools/older-pool.near");
    const providerSearch = providerRequests.at(-1)!;
    assert.equal(providerSearch.pathname, "/api/v2/search/pools");
    assert.equal(providerSearch.searchParams.get("network"), "near");
    assert.equal(providerSearch.searchParams.get("query"), "old");
    assert.equal(providerSearch.searchParams.get("page"), "1");
    assert.equal(providerSearch.searchParams.get("include"), "base_token,quote_token,dex");

    const cached = await get("/near/pools/search?query=old");
    assert.equal(cached.status, 200);
    assert.deepEqual(await cached.json(), body);
    assert.equal(searchRequestCount("old", "1"), 1, "normalized query shares its page-one cache entry");

    const pageTwo = await get("/near/pools/search?query=old&page=2");
    assert.equal(pageTwo.status, 200);
    assert.equal(pageTwo.headers.get("cache-control"), "public, max-age=60");
    const pageTwoBody = await pageTwo.json() as typeof body;
    assert.equal(pageTwoBody.query, "old");
    assert.equal(pageTwoBody.page, 2);
    assert.equal(pageTwoBody.hasNextPage, true);
    assert.equal(pageTwoBody.source, "GeckoTerminal");
    assert.ok(Number.isFinite(Date.parse(pageTwoBody.updatedAt)));
    assert.deepEqual(pageTwoBody.pools.map(pool => [pool.id, pool.tokenSymbol]), [["older-pool-page-two", "OLD2"]]);
    assert.equal(providerRequests.at(-1)?.searchParams.get("page"), "2", "page is forwarded to GeckoTerminal");
    const normalizedPageTwo = await get("/near/pools/search?query=%20OLD%20&page=2");
    assert.deepEqual(await normalizedPageTwo.json(), pageTwoBody, "trimmed and case-normalized query reuses the page-two cache");
    assert.equal(searchRequestCount("old", "1"), 1, "page-one cache remains isolated");
    assert.equal(searchRequestCount("old", "2"), 1, "page-two cache is reused independently");

    const retryFailure = await get("/near/pools/search?query=retry-page-two&page=2");
    assert.equal(retryFailure.status, 503);
    assert.match((await retryFailure.json() as { error: string }).error, /temporarily unavailable/);
    failRetryPageTwo = false;
    assert.equal((await get("/near/pools/search?query=retry-page-two&page=2")).status, 200);
    assert.equal(searchRequestCount("retry-page-two", "2"), 2, "provider failures are not cached");

    const concurrentFirst = get("/near/pools/search?query=%20Concurrent-Page-Two%20&page=2");
    await concurrentStarted;
    const concurrentSecond = get("/near/pools/search?query=concurrent-page-two&page=2");
    await new Promise(resolve => setTimeout(resolve, 20));
    releaseConcurrent?.();
    const [concurrentOne, concurrentTwo] = await Promise.all([concurrentFirst, concurrentSecond]);
    assert.equal(concurrentOne.status, 200);
    assert.equal(concurrentTwo.status, 200);
    assert.deepEqual(await concurrentOne.json(), await concurrentTwo.json());
    assert.equal(searchRequestCount("concurrent-page-two", "2"), 1, "concurrent requests share the normalized page-specific pending request");

    const emptyRawPage = await get("/near/pools/search?query=empty-raw-page&page=3");
    assert.equal(emptyRawPage.status, 200, "empty provider data may omit included");
    const emptyRawBody = await emptyRawPage.json() as typeof body;
    assert.deepEqual(emptyRawBody.pools, []);
    assert.equal(emptyRawBody.hasNextPage, false, "only an empty raw provider page ends pagination");

    const filteredRawPage = await get("/near/pools/search?query=filtered-raw-page&page=4");
    assert.equal(filteredRawPage.status, 200);
    const filteredRawBody = await filteredRawPage.json() as typeof body;
    assert.deepEqual(filteredRawBody.pools, [], "provider rows without usable pool fields are filtered");
    assert.equal(filteredRawBody.hasNextPage, true, "pagination uses raw provider rows, not normalized pool count");

    const pageTen = await get("/near/pools/search?query=limit-ten&page=10");
    assert.equal(pageTen.status, 200);
    const pageTenBody = await pageTen.json() as typeof body;
    assert.equal(pageTenBody.page, 10);
    assert.equal(pageTenBody.hasNextPage, false, "page ten is the safety cap even with provider rows");
    assert.equal(providerRequests.at(-1)?.searchParams.get("page"), "10");

    const malformed = await get("/near/pools/search?query=malformed-payload&page=3");
    assert.equal(malformed.status, 503, "malformed nonempty provider payloads are not treated as empty pages");
    assert.equal(searchRequestCount("malformed-payload", "3"), 1);

  } finally {
    globalThis.fetch = realFetch;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});