import assert from "node:assert/strict";
import { after, before, test } from "node:test";

// Default configuration: NEAR_ORIGIN_CHAINS unset means Solana origins only.
// The allow-list is parsed once when the route loads, so set env first.
delete process.env.NEAR_ORIGIN_CHAINS;
process.env.DATABASE_URL ??= "postgres://localhost/near_origins_test";
process.env.NEAR_INTENTS_API_KEY ??= "near-origins-test";

const [{ default: nearRouter }, fixture] = await Promise.all([
  import("./near"),
  import("./near-catalog.test-fixture"),
]);
const {
  startNearRoute, SOL, ZEC_SOL, USDC_SOL, ETH, ETH_ARB, USDC_BASE, BASE_NO_CONTRACT, POL, USDT_BSC,
  SOLANA_ADDRESS, EVM_ADDRESS, NO_ROUTE, INVALID_SELECTION,
} = fixture;

let route: Awaited<ReturnType<typeof startNearRoute>>;
before(async () => { route = await startNearRoute(nearRouter); });
after(async () => { await route.close(); });

test("the catalog keeps nep141 and nep245 assets, applies the exact native map, and marks origin eligibility", async () => {
  const tokens = await route.tokens({ side: "destination" });
  const byId = new Map(tokens.map(token => [token.id, token]));
  for (const id of [SOL, USDC_SOL, ETH, ETH_ARB, USDC_BASE, BASE_NO_CONTRACT, POL, USDT_BSC, "nep141:wrap.near"]) {
    assert.equal(byId.has(id), true, `${id} is a destination`);
  }
  // Other prefixes, Solana tokens without a mint, and unsupported networks stay out.
  assert.deepEqual(tokens.filter(token => token.id.startsWith("1cs_v1:")).map(token => token.id), [ZEC_SOL]);
  assert.equal(byId.get(ZEC_SOL)?.originEligible, true);
  assert.equal(byId.get(ZEC_SOL)?.native, false);
  assert.equal(byId.has("nep141:sol-unlisted.omft.near"), false);
  assert.equal(byId.has("nep141:btc.omft.near"), false);

  for (const id of [SOL, ETH, ETH_ARB, POL]) {
    assert.equal(byId.get(id)?.native, true, `${id} is native`);
    assert.equal(byId.get(id)?.originEligible, true, `${id} can fund`);
  }
  for (const id of [USDC_SOL, USDC_BASE, USDT_BSC]) {
    assert.equal(byId.get(id)?.native, false, `${id} is a token`);
    assert.equal(byId.get(id)?.originEligible, true, `${id} has a chain-valid contract`);
  }
  // No contract and not the exact native ID: listed as a destination only.
  assert.equal(byId.get(BASE_NO_CONTRACT)?.native, false);
  assert.equal(byId.get(BASE_NO_CONTRACT)?.originEligible, false);
  assert.equal(byId.get("nep141:wrap.near")?.originEligible, false);
  assert.equal(byId.get(POL)?.chainName, "Polygon");
  assert.equal(byId.get(USDT_BSC)?.chainName, "BNB Chain");
});

test("with no origin allow-list only Solana assets are offered as sources", async () => {
  const sources = await route.tokens({ side: "source" });
  assert.deepEqual([...new Set(sources.map(token => token.chain))], ["sol"]);
  assert.deepEqual(sources.map(token => token.id).sort(), [SOL, USDC_SOL, ZEC_SOL].sort());
  assert.deepEqual(await route.tokens({ side: "source", chain: "sol" }), sources);
  // An explicit chain filter can only narrow the enabled origins.
  assert.deepEqual(await route.tokens({ side: "source", chain: "base" }), []);
  assert.deepEqual((await route.tokens({ side: "destination", chain: "pol" })).map(token => token.id), [POL]);
});

test("native Zcash is an exact eight-decimal destination, never a source", async () => {
  const destinations = await route.tokens({ side: "destination", chain: "zec" });
  assert.deepEqual(destinations.map(token => token.id), ["nep141:zec.omft.near"]);
  assert.equal(destinations[0].native, true);
  assert.equal(destinations[0].originEligible, false);
  assert.equal(destinations[0].chainName, "Zcash");
  assert.deepEqual(await route.tokens({ side: "source", chain: "zec" }), []);
});

test("Zcash rejects transparent and mixed recipients before provider access, but forwards shielded-only recipients unchanged", async () => {
  const before = route.calls.filter(call => call.path === "/v0/quote").length;
  const mixed = "u1ngljcknkpc3k59rg493pz2fck9u7pd3fhq7yc45rt92s3c97rcm3nxxs659vn9d8u4n4x65yfsav90t0am2yea9huj8fgk8hzmh5w5g0sxdrm4q2dyp4jq839srf435uwxnvjf2xzaa9awprt76zrq45ppy60rzlru6p2t87el9m3syfn36jfdl5ts0kmyd629paqwfcqddnw8s6t3l";
  for (const recipient of ["t1Q879cLgqaCd7zKRi79wQYuGBenmNX6cKn", mixed, "u1invalid"]) {
    const result = await route.quote({ from: ZEC_SOL, to: "nep141:zec.omft.near", amount: "0.1", recipient, refundTo: SOLANA_ADDRESS });
    assert.equal(result.status, 400);
    assert.match(String(result.body.error), /shielded-only/);
  }
  assert.equal(route.calls.filter(call => call.path === "/v0/quote").length, before);
  const recipient = "u1x08faycv384llwet8r8zedp0w8axcjtckhpv03sj0anft683j2ku9lfamp5q60avusdt4xkg2rlf6nq7pxy444jm3lwtequrzwxm5d8dgcy023fjl4hh4j68c8uuy79v6dk4j5w042zl5wk3vgwatvfr8rlky09vwkjw5yltrqreyr3f";
  const result = await route.quote({ from: ZEC_SOL, to: "nep141:zec.omft.near", amount: "0.1", recipient, refundTo: SOLANA_ADDRESS });
  // This fixture deliberately returns no route: reaching it must not create an order.
  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { error: NO_ROUTE });
  const body = route.calls.filter(call => call.path === "/v0/quote").at(-1)?.body;
  assert.equal(body?.recipient, recipient);
  assert.equal(body?.destinationAsset, "nep141:zec.omft.near");
  assert.equal(body?.amount, "10000000");
  assert.equal(body?.dry, true);
  assert.equal(body?.confidentiality, "basic");
});

test("a direct quote request cannot bypass the origin allow-list", async () => {
  const before = route.calls.filter(call => call.path === "/v0/quote").length;
  const rejected = await route.quote({ from: USDC_BASE, to: SOL, amount: "5", recipient: SOLANA_ADDRESS, refundTo: EVM_ADDRESS });
  assert.equal(rejected.status, 400);
  assert.deepEqual(rejected.body, { error: INVALID_SELECTION });
  // Solana origins still validate the refund address on Solana.
  const wrongRefund = await route.quote({ from: SOL, to: ETH, amount: "1", recipient: EVM_ADDRESS, refundTo: EVM_ADDRESS });
  assert.equal(wrongRefund.status, 400);
  assert.equal(route.calls.filter(call => call.path === "/v0/quote").length, before);
});

test("a Solana quote requests confidential execution and a missing confidential route creates nothing", async () => {
  const response = await route.quote({ from: SOL, to: ETH, amount: "1", recipient: EVM_ADDRESS, refundTo: SOLANA_ADDRESS });
  assert.equal(response.status, 400);
  assert.deepEqual(response.body, { error: NO_ROUTE });
  const sent = route.calls.filter(call => call.path === "/v0/quote").at(-1)?.body;
  assert.equal(sent?.dry, true);
  assert.equal(sent?.confidentiality, "basic");
  assert.equal(sent?.originAsset, SOL);
  assert.equal(sent?.amount, "1000000000");
  assert.equal(sent?.refundTo, SOLANA_ADDRESS);
  assert.equal(sent?.refundType, "ORIGIN_CHAIN");
});

test("Solana ZEC works on both sides and forwards its exact ID and eight-decimal amount", async () => {
  for (const side of ["source", "destination"]) {
    const list = await route.tokens({ side, chain: "sol", term: "zec" });
    assert.deepEqual(list.map(token => token.id), [ZEC_SOL]);
  }
  for (const input of [
    { from: ZEC_SOL, to: ETH, amount: "0.01234567", recipient: EVM_ADDRESS, refundTo: SOLANA_ADDRESS },
    { from: SOL, to: ZEC_SOL, amount: "1", recipient: SOLANA_ADDRESS, refundTo: SOLANA_ADDRESS },
  ]) {
    const response = await route.quote(input);
    assert.equal(response.status, 400);
    assert.deepEqual(response.body, { error: NO_ROUTE });
    const sent = route.calls.filter(call => call.path === "/v0/quote").at(-1)?.body;
    assert.equal(sent?.dry, true);
    assert.equal(sent?.confidentiality, "basic");
    assert.equal(sent?.originAsset, input.from);
    assert.equal(sent?.destinationAsset, input.to);
    assert.equal(sent?.amount, input.from === ZEC_SOL ? "1234567" : "1000000000");
  }
});
