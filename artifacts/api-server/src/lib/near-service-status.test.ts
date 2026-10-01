import assert from "node:assert/strict";
import { test } from "node:test";
import { createNearServiceStatusAdapter, NEAR_STATUS_FEED } from "./near-service-status";

const date = "2026-10-01T10:00:00.000Z";
const incident = (scopeValue = "sol", scopeType = "chain", status = "active") => ({
  id: `${scopeType}-${scopeValue}`, scopeType, scopeValue, status, createdAt: date, updatedAt: date,
});
const feed = (activeIncidents = [] as ReturnType<typeof incident>[]) => ({
  activeIncidentCount: activeIncidents.length, activeIncidents, recentlyResolved: [],
});

test("literal supported endpoints only; unknown scopes/statuses are conservative, resolved is information", async () => {
  const cases = [
    { entries: [], allowed: "allowed" },
    { entries: [incident("sol")], allowed: "paused" },
    { entries: [incident("eth", "chain_all")], allowed: "paused" },
    { entries: [incident("bsc"), incident("pol")], allowed: "allowed" },
    ...["bridge", "token", "global", "future_scope"].map(scope => ({ entries: [incident("hot", scope)], allowed: "unverified" })),
    ...["SOL", "solana", "plasma"].map(chain => ({ entries: [incident(chain)], allowed: "unverified" })),
    { entries: [incident("sol", "chain", "monitoring")], allowed: "unverified" },
  ];
  for (const scenario of cases) {
    const get = createNearServiceStatusAdapter({ fetcher: async () => Response.json(feed(scenario.entries)) });
    const result = await get("sol", "eth");
    assert.equal(result.state, "fresh");
    assert.equal(result.eligibility, scenario.allowed, JSON.stringify(scenario.entries));
    assert.equal((await get()).eligibility, "unverified");
    assert.equal((await get("sol", "ethereum")).eligibility, "unverified");
  }
  const get = createNearServiceStatusAdapter({ fetcher: async () => Response.json({
    ...feed(), recentlyResolved: [{ id: "resolved", scopeType: "chain", scopeValue: "sol", createdAt: date, resolvedAt: date }],
  }) });
  const result = await get("sol", "eth");
  assert.equal(result.eligibility, "allowed");
  assert.equal(result.recentlyResolved[0].status, "resolved");
  assert.equal(result.recentlyResolved[0].impact, "matching");
});

test("strict required schema, count, dates, identifiers and bounded JSON body", async () => {
  const invalid = [
    {}, { ...feed(), activeIncidentCount: 1 },
    { ...feed(), activeIncidents: null },
    feed([{ ...incident(), updatedAt: "yesterday" }]),
    feed([{ ...incident(), scopeValue: "" }]),
    feed([incident(), incident()]),
    { ...feed(), recentlyResolved: [{ ...incident(), resolvedAt: null }] },
    feed(Array.from({ length: 501 }, (_, i) => incident(String(i)))),
  ];
  for (const value of invalid) {
    const get = createNearServiceStatusAdapter({ fetcher: async () => Response.json(value) });
    const status = await get("sol", "eth");
    assert.equal(status.state, "invalid");
    assert.equal(status.eligibility, "unverified");
    assert.equal(status.lastSuccessAt, null);
  }
  for (const response of [
    new Response("<html/>", { headers: { "Content-Type": "text/html" } }),
    new Response("{", { headers: { "Content-Type": "application/json" } }),
    new Response("x".repeat(256 * 1024 + 1), { headers: { "Content-Type": "application/json" } }),
    Response.json(feed(), { headers: { "Content-Length": "99999999" } }),
  ]) {
    assert.equal((await createNearServiceStatusAdapter({ fetcher: async () => response })("sol", "eth")).state, "invalid");
  }
});

test("fixed origin, no credentials/redirects, shared 30s cache, coalescing and post-create revalidation cap", async () => {
  let clock = Date.parse(date);
  let calls = 0;
  let active = false;
  const get = createNearServiceStatusAdapter({
    now: () => clock,
    fetcher: async (url, init) => {
      calls++;
      assert.equal(url, NEAR_STATUS_FEED);
      assert.deepEqual(init?.headers, { Accept: "application/json" });
      assert.equal(init?.credentials, "omit");
      assert.equal(init?.redirect, "error");
      assert.equal(init?.method, "GET");
      return Response.json(feed(active ? [incident()] : []));
    },
  });
  const results = await Promise.all(Array.from({ length: 20 }, () => get("sol", "eth")));
  assert.equal(calls, 1);
  assert.equal(results[0].freshUntil, new Date(clock + 60_000).toISOString());
  clock += 29_999;
  await get("sol", "near");
  assert.equal(calls, 1);
  active = true;
  assert.equal((await get("sol", "eth", true)).eligibility, "paused");
  assert.equal(calls, 2);
  await Promise.all(Array.from({ length: 20 }, () => get("sol", "eth", true)));
  assert.equal(calls, 2);
  clock += 5_000;
  await Promise.all(Array.from({ length: 20 }, () => get("sol", "eth", true)));
  assert.equal(calls, 3);
  clock += 30_000;
  active = false;
  assert.equal((await get("sol", "eth")).eligibility, "allowed");
  assert.equal(calls, 4);
});

test("failures immediately block, retain last observation, cache failure and age out at 60s", async () => {
  let clock = Date.parse(date);
  let mode = "ok";
  let calls = 0;
  const get = createNearServiceStatusAdapter({ now: () => clock, fetcher: async () => {
    calls++;
    if (mode === "down") return new Response("", { status: 429 });
    if (mode === "invalid") return Response.json({});
    return Response.json(feed());
  } });
  const success = await get("sol", "eth");
  clock += 30_000;
  mode = "down";
  const failure = await get("sol", "eth");
  assert.equal(failure.state, "unavailable");
  assert.equal(failure.eligibility, "unverified");
  assert.equal(failure.lastSuccessAt, success.lastSuccessAt);
  await get("sol", "eth", true);
  assert.equal(calls, 2, "post-create cannot bypass failure backoff");
  clock += 10_000;
  mode = "invalid";
  assert.equal((await get("sol", "eth")).state, "invalid");
  clock += 20_000;
  assert.equal((await get("sol", "eth")).state, "stale");
  mode = "ok";
  clock += 10_000;
  assert.equal((await get("sol", "eth")).eligibility, "allowed");
});

test("timeout bounds both headers and a stalled body; rate-limit/network errors are unavailable", async () => {
  const cases: typeof fetch[] = [
    async () => new Promise<Response>(() => {}),
    async () => new Response(new ReadableStream({ start() {} }), { headers: { "Content-Type": "application/json" } }),
    async () => { throw new Error("network error with sensitive details"); },
    async () => new Response("", { status: 429 }),
  ];
  for (const fetcher of cases) {
    const get = createNearServiceStatusAdapter({ fetcher, timeoutMs: 10 });
    const result = await get("sol", "eth");
    assert.equal(result.state, "unavailable");
    assert.equal(result.eligibility, "unverified");
    assert.doesNotMatch(result.reason, /sensitive details/);
  }
});