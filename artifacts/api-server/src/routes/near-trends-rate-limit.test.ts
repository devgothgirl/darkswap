import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";
import router from "./near-trends";

type RawResponse = { status: number | null; body: string };

function startServer() {
  const app = express();
  app.set("trust proxy", 1);
  app.use((req, _res, next) => {
    req.log = { error() {} } as unknown as typeof req.log;
    next();
  });
  app.use(router);
  app.get("/unrelated", (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, "127.0.0.1");
  return new Promise<{ server: http.Server; port: number }>(resolve => {
    server.once("listening", () => resolve({ server, port: (server.address() as AddressInfo).port }));
  });
}

function startGet(port: number, path: string, ip: string) {
  let resolveDone: (value: RawResponse) => void;
  const done = new Promise<RawResponse>(resolve => { resolveDone = resolve; });
  const req = http.request({ host: "127.0.0.1", port, path, headers: { "x-forwarded-for": ip } }, res => {
    let body = "";
    res.on("data", chunk => { body += chunk; });
    res.on("end", () => resolveDone({ status: res.statusCode ?? null, body }));
  });
  req.on("error", () => resolveDone({ status: null, body: "" }));
  // A manually destroyed request resolves via "close", not "error".
  req.on("close", () => resolveDone({ status: null, body: "" }));
  req.end();
  return { req, done };
}

async function get(port: number, path: string, ip: string): Promise<RawResponse> {
  return startGet(port, path, ip).done;
}

async function stopServer(server: http.Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

async function waitFor(condition: () => boolean, description: string) {
  for (let i = 0; i < 200; i++) {
    if (condition()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(`timed out waiting for ${description}`);
}

test("NEAR market endpoints rate limit repeated requests from a single IP", async () => {
  const { server, port } = await startServer();
  const realFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://api.geckoterminal.com", "no live provider requests");
    providerCalls++;
    return Response.json({ data: [], included: [] });
  };
  try {
    // 30 requests per minute per IP are allowed; the 31st is rejected before
    // any new upstream fetch (trends responses are cached, so the provider
    // sees at most a couple of calls regardless).
    for (let i = 0; i < 30; i++) {
      const response = await get(port, "/near/trends", "10.1.0.1");
      assert.equal(response.status, 200, `request ${i + 1} within the limit must pass`);
    }
    const limited = await get(port, "/near/trends", "10.1.0.1");
    assert.equal(limited.status, 429, "request beyond the per-IP limit is rejected");
    assert.match(limited.body, /wait|capacity/i);

    const limitedSearch = await get(port, "/near/pools/search?query=sol", "10.1.0.1");
    assert.equal(limitedSearch.status, 429, "search shares the same per-IP budget");
    assert.ok(providerCalls <= 2, "rate-limited requests never reach the provider");
  } finally {
    globalThis.fetch = realFetch;
    await stopServer(server);
  }
});

test("the NEAR market limiter never throttles unrelated routes mounted later", async () => {
  const { server, port } = await startServer();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://api.geckoterminal.com", "no live provider requests");
    return Response.json({ data: [], included: [] });
  };
  try {
    // Exhaust the per-IP NEAR budget for this client.
    for (let i = 0; i < 31; i++) await get(port, "/near/trends", "10.2.0.1");
    assert.equal((await get(port, "/near/trends", "10.2.0.1")).status, 429, "NEAR budget is exhausted");

    // Requests that fall through to other routers must not consume the NEAR
    // budget or receive its 429s.
    for (let i = 0; i < 40; i++) {
      const unrelated = await get(port, "/unrelated", "10.2.0.3");
      assert.equal(unrelated.status, 200, `unrelated request ${i + 1} is unaffected`);
    }
    const fresh = await get(port, "/near/trends", "10.2.0.4");
    assert.equal(fresh.status, 200, "unrelated traffic did not consume the NEAR budget");
  } finally {
    globalThis.fetch = realFetch;
    await stopServer(server);
  }
});

test("concurrent upstream fetches are capped and client disconnects cannot free slots early", async () => {
  const { server, port } = await startServer();
  const realFetch = globalThis.fetch;
  const pendingReleases: (() => void)[] = [];
  let searchCalls = 0;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://api.geckoterminal.com", "no live provider requests");
    if (!url.pathname.includes("/search/pools")) return Response.json({ data: [], included: [] });
    searchCalls++;
    // Only the initial cap-filling searches hang; later probes resolve at once.
    if (/^cap-test-\d+$/.test(url.searchParams.get("query") ?? "")) {
      await new Promise<void>(resolve => pendingReleases.push(resolve));
    }
    return Response.json({ data: [], included: [] });
  };
  try {
    // Fill the upstream concurrency cap with distinct slow searches.
    const hanging = [];
    for (let i = 0; i < 32; i++) {
      hanging.push(startGet(port, `/near/pools/search?query=cap-test-${i}`, `10.3.${Math.floor(i / 250)}.${i % 250}`));
    }
    await waitFor(() => searchCalls === 32, "32 in-flight upstream searches");

    const overCap = await get(port, "/near/pools/search?query=cap-test-over", "10.3.1.1");
    assert.equal(overCap.status, 429, "the 33rd concurrent upstream fetch is rejected");
    assert.match(overCap.body, /capacity/i);
    assert.equal(searchCalls, 32, "rejected requests never reach the provider");

    // Disconnecting clients must not free slots while their upstream fetch is
    // still running.
    for (let i = 0; i < 8; i++) hanging[i].req.destroy();
    await new Promise(resolve => setTimeout(resolve, 50));
    const stillCapped = await get(port, "/near/pools/search?query=cap-test-still", "10.3.1.2");
    assert.equal(stillCapped.status, 429, "disconnected clients keep their slot until the fetch ends");
    assert.equal(searchCalls, 32, "no extra upstream fetch after disconnects");

    // Once the upstream operations finish, capacity is restored.
    for (const release of pendingReleases.splice(0)) release();
    const results = await Promise.all(hanging.map(h => h.done));
    assert.ok(results.some(r => r.status === 200), "surviving clients receive their results");
    const after = await get(port, "/near/pools/search?query=cap-test-after", "10.3.1.3");
    assert.equal(after.status, 200, "capacity frees once upstream fetches complete");
  } finally {
    for (const release of pendingReleases.splice(0)) release();
    globalThis.fetch = realFetch;
    await stopServer(server);
  }
});
