import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import execution from "./launch-execution";

test("both ingress paths fail closed before parsing regardless of admin/pair/pause claims", async () => {
  const app = express();
  app.use(["/api", "/launch/api"], execution);
  app.use(express.json({ limit: "1kb" }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const realFetch = globalThis.fetch;
  try {
    for (const prefix of ["/api", "/launch/api"]) {
      for (const body of [
        "{malformed", "x".repeat(2048),
        JSON.stringify({ pair: "DARK", executionAvailable: true, admin: true, paused: false }),
        JSON.stringify({ pair: "USDC", configuration: { adapterVerified: true } }),
      ]) {
        const response = await realFetch(`${origin}${prefix}/launch/submit`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body,
        });
        assert.equal(response.status, 503);
        assert.equal(response.headers.get("cache-control"), "no-store");
        const payload = await response.json() as Record<string, unknown>;
        assert.equal(payload.code, "EXECUTION_UNAVAILABLE");
        assert.equal(payload.executionAvailable, false);
        assert.equal(payload.signature, undefined);
        assert.equal(payload.tokenMint, undefined);
      }
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});