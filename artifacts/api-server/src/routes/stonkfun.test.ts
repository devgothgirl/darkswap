import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import { createStonkfunRouter } from "./stonkfun";
import { DiscoveryService, StonkfunClient, type LaunchDiscoveryConfig } from "../lib/stonkfun";

test("discovery routes reject unknown/duplicate queries and bound client requests with Retry-After", async () => {
  const config: LaunchDiscoveryConfig = {
    darkPairingEnabled: false, darkTokenAddress: null, darkPairPriority: 1,
    nearPairingEnabled: false, pairOverrides: [], paused: false,
  };
  let upstreamCalls = 0;
  const service = new DiscoveryService(new StonkfunClient({
    fetch: (async () => { upstreamCalls++; return Response.json({ data: { pairs: [], selectBy: "mint", ambiguousSymbolCount: 0 }, meta: { generatedAt: new Date().toISOString() } }); }) as typeof fetch,
  }), { async get() { return null; }, async put() {} });
  const app = express();
  app.use(createStonkfunRouter({ service, loadConfig: async () => config, loadReviews: async () => [] }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    for (const path of ["/stonkfun/pairs?q=no", "/stonkfun/tokens?creator=abc", "/stonkfun/tokens?q=a&q=b",
      "/stonkfun/tokens/invalid", "/stonkfun/tokens/11111111111111111111111111111111?network=devnet"]) {
      const result = await fetch(origin + path);
      assert.equal(result.status, 400, path);
      assert.equal((await result.json() as { code: string }).code, "INVALID_INPUT");
    }
    assert.equal(upstreamCalls, 0);
    const fresh = await fetch(`${origin}/stonkfun/pairs`);
    assert.equal(fresh.status, 200);
    assert.equal(fresh.headers.get("x-discovery-state"), "fresh");
    const cached = await fetch(`${origin}/stonkfun/pairs`);
    assert.equal(cached.headers.get("x-discovery-state"), "cache");
    for (let i = 0; i < 113; i++) await fetch(`${origin}/stonkfun/pairs`);
    const limited = await fetch(`${origin}/stonkfun/pairs`);
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get("retry-after")) > 0);
    assert.equal((await limited.json() as { executionAvailable: boolean }).executionAvailable, false);
    assert.equal(upstreamCalls, 1);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});