import assert from "node:assert/strict";
import test from "node:test";
import { valuePrivateQuotes } from "./private-quote-value";
import type { ProviderQuote, ProviderToken } from "./houdini";
import { MINIMUM_SWAP_USD } from "./swap-minimum";

const quote: ProviderQuote = { quoteId: "quote", type: "private", amountIn: 1, amountOut: 0.07 };
const token: ProviderToken = {
  id: "source", name: "Solana", symbol: "SOL", price: 118,
  chainData: { shortName: "solana" },
};

test("missing USD uses a fresh exact-source price, not the output valuation", async () => {
  let calls = 0;
  const result = await valuePrivateQuotes([{ ...quote, amountOutUsd: 999 }, quote], "source", 1, async id => {
    assert.equal(id, "source"); calls++; return token;
  });
  assert.equal(calls, 1);
  assert.deepEqual(result.map(q => q.amountInUsd), [118, 118]);
});

test("valid quote USD is preserved without a token lookup, including below minimum", async () => {
  for (const usd of [2.99, 3, 118]) {
    const result = await valuePrivateQuotes([{ ...quote, amountInUsd: usd }], "source", 1,
      async () => { throw new Error("must not fetch"); });
    assert.equal(result[0].amountInUsd, usd);
    assert.equal(result[0].amountInUsd! >= MINIMUM_SWAP_USD, usd >= 3);
  }
});

test("invalid explicit USD never gets replaced with a more favorable price", async () => {
  for (const value of [null, "118", "", NaN, Infinity, -1, 0]) {
    assert.deepEqual(await valuePrivateQuotes(
      [{ ...quote, amountInUsd: value as number }], "source", 1, async () => token), []);
  }
});

test("missing/invalid price, wrong identity/chain, disabled token, and outages fail closed", async () => {
  for (const value of [undefined, null, "118", NaN, Infinity, -1, 0]) {
    assert.deepEqual(await valuePrivateQuotes([quote], "source", 1,
      async () => ({ ...token, price: value as number })), []);
  }
  for (const patch of [{ id: "other" }, { chainData: { shortName: "ethereum" } },
    { enabled: false }, { hasCex: false }]) {
    assert.deepEqual(await valuePrivateQuotes([quote], "source", 1, async () => ({ ...token, ...patch })), []);
  }
  assert.deepEqual(await valuePrivateQuotes([quote], "source", 1, async () => { throw Error("outage"); }), []);
});

test("fallback preserves below-minimum values and rejects mismatched/invalid quantities", async () => {
  const result = await valuePrivateQuotes([{ ...quote, amountIn: 0.01 }], "source", 0.01, async () => token);
  assert.equal(result[0].amountInUsd, 1.18);
  assert.ok(result[0].amountInUsd! < MINIMUM_SWAP_USD);
  for (const amountIn of [0, -1, NaN, Infinity, 2]) {
    assert.deepEqual(await valuePrivateQuotes([{ ...quote, amountIn, amountInUsd: 118 }], "source", 1), []);
  }
  assert.deepEqual(await valuePrivateQuotes([{ ...quote, amountOut: Infinity, amountInUsd: 118 }], "source", 1), []);
  assert.deepEqual(await valuePrivateQuotes([{ ...quote, amountIn: 1e308 }], "source", 1e308, async () => token), []);
});

test("a failed fallback does not discard independently verified quotes", async () => {
  const valid = { ...quote, quoteId: "valid", amountInUsd: 10 };
  assert.deepEqual(await valuePrivateQuotes([quote, valid], "source", 1,
    async () => { throw Error("outage"); }), [valid]);
});