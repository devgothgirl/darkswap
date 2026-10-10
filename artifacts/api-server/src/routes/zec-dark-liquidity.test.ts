import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createZecDarkLiquidityRouter, normalizePool, ZEC_DARK_POOL } from "./zec-dark-liquidity";

const fixture = () => ({
  data: [{
    address: ZEC_DARK_POOL,
    token_x: { address: "7KEPApdbBMByrmqihz3bht2uMhFQcatjfSFQCKq66kH3" },
    token_y: { address: "A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS" },
    tvl: 6000, permanent_lock_liquidity: 300,
    volume: { "24h": 10000 }, fees: { "24h": 80 },
    pool_config: { base_fee_pct: 1, compounding_fee_pct: 10, dynamic_fee_initialized: true, collect_fee_mode: 2 },
  }],
});

test("maps Meteora USD metrics and locked liquidity percentage without inventing yield", () => {
  const snapshot = normalizePool(fixture(), 0);
  assert.equal(snapshot.liquidityUsd, 6000);
  assert.equal(snapshot.permanentLockedPct, 5);
  assert.equal(snapshot.baseFeePct, 1);
  assert.equal(snapshot.compoundingFeePct, 10);
  assert.equal(snapshot.fees24hUsd, 80);
  assert.equal(new Date(snapshot.fetchedAt).toISOString(), "1970-01-01T00:00:00.000Z");
  const empty = fixture();
  empty.data[0].tvl = 0;
  empty.data[0].permanent_lock_liquidity = 0;
  assert.equal(normalizePool(empty, 0).permanentLockedPct, null);
});

test("rejects wrong pool/mints, missing metrics, negative values and invalid fee modes", () => {
  const mutations = [
    (p: ReturnType<typeof fixture>) => { p.data[0].address = "other"; },
    (p: ReturnType<typeof fixture>) => { p.data[0].token_y.address = "other"; },
    (p: ReturnType<typeof fixture>) => { p.data[0].tvl = -1; },
    (p: ReturnType<typeof fixture>) => { p.data[0].fees["24h"] = NaN; },
    (p: ReturnType<typeof fixture>) => { p.data[0].pool_config.collect_fee_mode = 0; },
    (p: ReturnType<typeof fixture>) => { p.data[0].pool_config.compounding_fee_pct = 101; },
    (p: ReturnType<typeof fixture>) => { p.data[0].permanent_lock_liquidity = 7000; },
  ];
  for (const mutate of mutations) {
    const payload = fixture();
    mutate(payload);
    assert.throws(() => normalizePool(payload, 0));
  }
  assert.throws(() => normalizePool({ data: [] }, 0));
  assert.throws(() => normalizePool({ data: [{ address: ZEC_DARK_POOL }] }, 0));
});

test("coalesces refreshes, caches briefly, hides expired data on failure and recovers", async t => {
  let time = 100_000;
  let calls = 0;
  let failure = false;
  const fetcher = (async () => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 10));
    return new Response(JSON.stringify(failure ? {} : fixture()), { status: failure ? 500 : 200 });
  }) as typeof fetch;
  const app = express();
  app.use("/api", createZecDarkLiquidityRouter({ fetcher, now: () => time }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const get = () => fetch(`http://127.0.0.1:${address.port}/api/liquidity/zec-dark`);
  const results = await Promise.all([get(), get(), get()]);
  assert.ok(results.every(r => r.status === 200));
  assert.equal(calls, 1);
  assert.equal((await get()).status, 200);
  assert.equal(calls, 1);
  time += 60_001;
  failure = true;
  const down = await get();
  assert.equal(down.status, 503);
  assert.equal(down.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(Object.keys(await down.json() as object), ["error"]);
  await get();
  assert.equal(calls, 2, "failure cooldown prevents repeated provider calls");
  time += 15_001;
  failure = false;
  const recovered = await get();
  assert.equal(recovered.status, 200);
  assert.equal((await recovered.json() as { fetchedAt: string }).fetchedAt, new Date(time).toISOString());
  assert.equal(calls, 3);
});
