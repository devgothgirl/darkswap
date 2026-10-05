import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import { createDarkRewardsRouter } from "./dark-rewards";

const DARK_MINT = "7KEPApdbBMByrmqihz3bht2uMhFQcatjfSFQCKq66kH3";

function priceFetch(state: { near: number; dark: number; fail?: boolean; calls: number }): typeof fetch {
  return (async (input: string | URL | Request) => {
    state.calls++;
    if (state.fail) return new Response("down", { status: 503 });
    const url = String(input);
    const body = url.includes("chaindefuser")
      ? [{ assetId: "nep141:sol.omft.near", price: 150 }, { assetId: "nep141:wrap.near", price: state.near }]
      : { data: { token: { mint: DARK_MINT, market: { priceUsd: state.dark } } } };
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

async function serve(router: express.Router) {
  const app = express();
  app.use((req, _res, next) => { (req as unknown as { log: unknown }).log = { warn() {} }; next(); });
  app.use(router);
  const server = app.listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { get: () => fetch(`${base}/dark-rewards/estimate`) as Promise<Omit<Response, "json"> & { json(): Promise<any> }>, close: () => server.close() };
}

test("values confirmed distributions at daily prices and caches within the UTC day", async t => {
  const state = { near: 5, dark: 0.001, calls: 0 };
  let clock = Date.parse("2026-10-02T10:00:00Z");
  const api = await serve(createDarkRewardsRouter({ fetcher: priceFetch(state), now: () => clock }));
  t.after(api.close);
  const first = await (await api.get()).json();
  assert.equal(first.latestAirdrop.number, 7);
  assert.equal(first.latestAirdrop.holders, 507);
  assert.ok(Math.abs(first.latestAirdrop.usd - 463.786 * 5) < 1e-6);
  assert.ok(Math.abs(first.allTimeUsd - (3026.268842156 * 5)) < 1e-6);
  assert.equal(state.calls, 2);
  state.near = 10;
  clock += 6 * 60 * 60 * 1000;
  assert.equal((await (await api.get()).json()).allTimeUsd, first.allTimeUsd);
  assert.equal(state.calls, 2, "same UTC day must not refetch prices");
  clock = Date.parse("2026-10-03T00:30:00Z");
  assert.ok((await (await api.get()).json()).allTimeUsd > first.allTimeUsd, "a new day reprices");
});

test("serves the previous estimate briefly on failure, then reports unavailable instead of zeros", async t => {
  const state = { near: 5, dark: 0.001, calls: 0, fail: false };
  let clock = Date.parse("2026-10-02T10:00:00Z");
  const api = await serve(createDarkRewardsRouter({ fetcher: priceFetch(state), now: () => clock }));
  t.after(api.close);
  const first = await (await api.get()).json();
  state.fail = true;
  clock = Date.parse("2026-10-03T10:00:00Z");
  const stale = await api.get();
  assert.equal(stale.status, 200);
  assert.equal((await stale.json()).pricedAt, first.pricedAt);
  clock = Date.parse("2026-10-05T10:00:00Z");
  const down = await api.get();
  assert.equal(down.status, 503);
  assert.doesNotMatch(await down.text(), /usd/i);
});

test("rejects invalid or mismatched prices", async t => {
  const fetcher = (async (input: string | URL | Request) => new Response(JSON.stringify(String(input).includes("chaindefuser")
    ? [{ assetId: "nep141:wrap.near", price: 5 }]
    : { data: { token: { mint: "Other1111111111111111111111111111111111111", market: { priceUsd: 1 } } } }), { status: 200 })) as typeof fetch;
  const api = await serve(createDarkRewardsRouter({ fetcher }));
  t.after(api.close);
  assert.equal((await api.get()).status, 503);
});
