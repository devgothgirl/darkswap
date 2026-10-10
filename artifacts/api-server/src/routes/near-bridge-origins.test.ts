import assert from "node:assert/strict";
import { after, before, test } from "node:test";

// A staging-style allow-list with mixed case, blanks, NEAR and an unknown
// network. Parsed once when the route loads, so set env first.
process.env.NEAR_ORIGIN_CHAINS = " BASE,arb,near,btc,,pol,bsc";
process.env.DATABASE_URL ??= "postgres://localhost/near_bridge_origins_test";
process.env.NEAR_INTENTS_API_KEY ??= "near-bridge-origins-test";

const [{ default: nearRouter }, fixture] = await Promise.all([
  import("./near"),
  import("./near-catalog.test-fixture"),
]);
const {
  startNearRoute, SOL, ZEC_SOL, USDC_SOL, ETH, ETH_ARB, USDC_BASE, BASE_NO_CONTRACT, POL, USDT_BSC,
  SOLANA_ADDRESS, EVM_ADDRESS, NO_ROUTE, INVALID_SELECTION,
} = fixture;

let route: Awaited<ReturnType<typeof startNearRoute>>;
before(async () => { route = await startNearRoute(nearRouter, 422); });
after(async () => { await route.close(); });

test("enabled EVM origins list only assets a wallet can deposit; Solana stays enabled", async () => {
  const sources = await route.tokens({ side: "source" });
  assert.deepEqual(new Set(sources.map(token => token.chain)), new Set(["sol", "base", "arb", "pol", "bsc"]));
  assert.deepEqual(sources.map(token => token.id).sort(), [SOL, ZEC_SOL, USDC_SOL, ETH_ARB, USDC_BASE, POL, USDT_BSC].sort());
  assert.equal(sources.every(token => token.originEligible === true), true);
  // Not enabled (Ethereum), never an origin (NEAR), or no deposit identity.
  for (const id of [ETH, "nep141:wrap.near", BASE_NO_CONTRACT]) {
    assert.equal(sources.some(token => token.id === id), false, id);
  }
  assert.deepEqual((await route.tokens({ side: "source", chain: "base" })).map(token => token.id), [USDC_BASE]);
  assert.deepEqual(await route.tokens({ side: "source", chain: "eth" }), []);
  assert.deepEqual(await route.tokens({ side: "source", chain: "near" }), []);
  // The Solana form's explicit filter stays Solana-only under any allow-list.
  assert.deepEqual((await route.tokens({ side: "source", chain: "sol" })).map(token => token.id).sort(), [SOL, ZEC_SOL, USDC_SOL].sort());
});

test("bridge quotes validate the refund address on the origin network", async () => {
  const quotes = () => route.calls.filter(call => call.path === "/v0/quote").length;
  const before = quotes();
  const solanaRefund = await route.quote({ from: USDC_BASE, to: SOL, amount: "5", recipient: SOLANA_ADDRESS, refundTo: SOLANA_ADDRESS });
  assert.equal(solanaRefund.status, 400);
  assert.deepEqual(solanaRefund.body, { error: INVALID_SELECTION });
  const ineligible = await route.quote({ from: BASE_NO_CONTRACT, to: SOL, amount: "5", recipient: SOLANA_ADDRESS, refundTo: EVM_ADDRESS });
  assert.equal(ineligible.status, 400);
  const disabled = await route.quote({ from: ETH, to: SOL, amount: "1", recipient: SOLANA_ADDRESS, refundTo: EVM_ADDRESS });
  assert.equal(disabled.status, 400);
  assert.equal(quotes(), before, "rejected selections never reach the provider");
});

test("an EVM-origin quote requests confidential execution and shows the no-route error when none exists", async () => {
  const response = await route.quote({ from: USDC_BASE, to: SOL, amount: "5", recipient: SOLANA_ADDRESS, refundTo: EVM_ADDRESS });
  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: NO_ROUTE });
  const sent = route.calls.filter(call => call.path === "/v0/quote").at(-1)?.body;
  assert.equal(sent?.dry, true);
  assert.equal(sent?.confidentiality, "basic");
  assert.equal(sent?.originAsset, USDC_BASE);
  assert.equal(sent?.amount, "5000000");
  assert.equal(sent?.refundTo, EVM_ADDRESS);
  assert.equal(sent?.depositType, "ORIGIN_CHAIN");

  // The $3 minimum still applies to EVM origins before any provider request.
  const calls = route.calls.length;
  const small = await route.quote({ from: USDC_BASE, to: SOL, amount: "2.99", recipient: SOLANA_ADDRESS, refundTo: EVM_ADDRESS });
  assert.equal(small.status, 400);
  assert.match(String(small.body.error), /Minimum swap amount is \$3 USD/);
  assert.equal(route.calls.length, calls);
});
