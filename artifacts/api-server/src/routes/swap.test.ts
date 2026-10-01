import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import { issueTokenTicket, readQuoteTicket } from "../lib/swap-tickets";

// No database operations or real provider calls in this regression suite.
process.env.DATABASE_URL = "postgres://localhost/unused_quote_test";
process.env.HOUDINI_API_KEY = "quote-test";
process.env.HOUDINI_API_SECRET = "quote-test";
const { default: router } = await import("./swap");

test("quote endpoint enforces USD minimum before issuing order-authorizing tickets", async () => {
  const app = express();
  app.use(router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const realFetch = globalThis.fetch;
  const baseQuote = { quoteId: "provider-quote", type: "private", amountIn: 1, amountOut: 0.07 };
  let quotes: Record<string, unknown>[] = [baseQuote];
  let price: unknown = 118;
  let unavailable = false;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(init?.method ?? "GET", "GET");
    if (url.pathname === "/v2/quotes") return Response.json({ quotes });
    assert.equal(url.pathname, "/v2/tokens/source");
    if (unavailable) return Response.json({}, { status: 503 });
    return Response.json({ id: "source", price, chainData: { shortName: "solana" } });
  };
  try {
    const params = new URLSearchParams({
      from: issueTokenTicket("source", "solana", "source"),
      to: issueTokenTicket("native-zec", "Zcash", "destination"),
      amount: "1",
    });
    const get = () => realFetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/swap/quotes?${params}`);
    for (const invalid of [undefined, null, "118", 0, -1]) {
      price = invalid;
      const response = await get();
      assert.equal(response.status, 503);
      assert.match((await response.json() as { error: string }).error, /Unable to verify/);
    }
    price = 118;
    for (const invalid of [null, "118", 0, -1]) {
      quotes = [{ ...baseQuote, amountInUsd: invalid }];
      assert.equal((await get()).status, 503);
    }
    quotes = [baseQuote];
    unavailable = true;
    assert.equal((await get()).status, 503);
    unavailable = false;
    for (const direct of [false, true]) {
      quotes = [{ ...baseQuote, ...(direct ? { amountInUsd: 2.99 } : {}) }];
      price = 2.99;
      const response = await get();
      assert.equal(response.status, 400);
      assert.match((await response.json() as { error: string }).error, /Minimum swap/);
    }
    for (const direct of [false, true]) {
      quotes = [{ ...baseQuote, ...(direct ? { amountInUsd: 3 } : {}) }];
      price = 118;
      const response = await get();
      assert.equal(response.status, 200);
      const body = await response.json() as { total: number; quotes: { amountInUsd: number; quoteId: string }[] };
      assert.equal(body.total, 1);
      assert.equal(body.quotes[0].amountInUsd, direct ? 3 : 118);
      assert.equal(readQuoteTicket(body.quotes[0].quoteId, Date.now(), true), "provider-quote");
    }
  } finally {
    globalThis.fetch = realFetch;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});