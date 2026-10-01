import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";

process.env.DATABASE_URL ??= "postgres://localhost/rewards_order_auth_test";
process.env.NEAR_INTENTS_API_KEY = "rewards-order-auth-test";
delete process.env.PRIVY_APP_ID;
delete process.env.PRIVY_APP_SECRET;

const [{ default: swapRouter }, { default: nearRouter }] = await Promise.all([
  import("./swap"),
  import("./near"),
]);

test("bearer order requests fail closed before either provider or claim path when rewards config is disabled", async () => {
  const app = express();
  app.use(express.json());
  app.use(swapRouter);
  app.use(nearRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const realFetch = globalThis.fetch;
  let externalRequests = 0;
  globalThis.fetch = async (input, init) => {
    if (new URL(String(input)).hostname !== "127.0.0.1") externalRequests++;
    return realFetch(input, init);
  };
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const [privateResponse, nearResponse] = await Promise.all([
      realFetch(`${base}/swap/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer stale-ui-token" },
        body: JSON.stringify({ quoteId: "unimportant", addressTo: "recipient" }),
      }),
      realFetch(`${base}/swap/near/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer stale-ui-token" },
        body: JSON.stringify({
          quoteId: "00000000-0000-4000-8000-000000000001",
          requestId: "00000000-0000-4000-8000-000000000002",
        }),
      }),
    ]);
    for (const response of [privateResponse, nearResponse]) {
      assert.equal(response.status, 503);
      assert.match((await response.json() as { error: string }).error, /No order was created/);
    }
    assert.equal(externalRequests, 0);
  } finally {
    globalThis.fetch = realFetch;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()));
  }
});