import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import { eq } from "drizzle-orm";
import express from "express";
import type { AddressInfo } from "node:net";
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
  NextFunction,
} from "express";

// This suite truncates order tables. Refuse direct execution against the
// workspace/operator database before importing any client or route.
if (process.env.ORDER_RECOVERY_TEST_DB !== "true"
  || !/^postgresql:\/\/order_recovery_test@127\.0\.0\.1:\d+\/postgres$/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Run via pnpm --filter @workspace/api-server test:order-recovery (temporary local database only).");
}

process.env.NEAR_INTENTS_API_KEY = "near-evm-origin-test";
// Parsed once when the route loads: Base is enabled as an origin here only.
process.env.NEAR_ORIGIN_CHAINS = "sol,base";

const [{ db, pool, nearOrdersTable, nearSwapPreviewsTable }, { default: nearRouter }] = await Promise.all([
  import("@workspace/db"),
  import("./near"),
]);

const nativeFetch = globalThis.fetch;
const app = express();
app.set("trust proxy", true);
app.use(express.json());
app.use((req: ExpressRequest, _res: ExpressResponse, next: NextFunction) => {
  Object.assign(req, { log: { warn() {}, error() {} } });
  next();
});
app.use(nearRouter);

let server: ReturnType<typeof app.listen>;
let baseUrl: string;
let clientNumber = 1;

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(async () => {
  await pool.query("TRUNCATE near_orders, near_swap_previews");
});

after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  await pool.end();
});

type ProviderCall = { url: URL; method: string; body?: Record<string, unknown> };

function interceptProviders(handler: (url: URL, body?: Record<string, unknown>) => Response): {
  calls: ProviderCall[];
  restore: () => void;
} {
  const originalFetch = globalThis.fetch;
  const calls: ProviderCall[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return nativeFetch(input, init);
    if (url.hostname === "partners.near-intents.org") {
      return Response.json({ activeIncidentCount: 0, activeIncidents: [], recentlyResolved: [] });
    }
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
    calls.push({ url, method: init?.method ?? "GET", body });
    return handler(url, body);
  };
  return { calls, restore: () => { globalThis.fetch = originalFetch; } };
}

// Base USDC → SOL, a representative EVM-origin bridge order.
const baseUsdc = {
  id: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
  symbol: "USDC", chain: "base", chainName: "Base", decimals: 6, price: 1,
  contractAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", native: false, originEligible: true,
};
const solana = {
  id: "nep141:sol.omft.near", symbol: "SOL", chain: "sol", chainName: "Solana", decimals: 9,
  native: true, originEligible: true,
};
const input = {
  from: baseUsdc.id, to: solana.id, amount: "5",
  recipient: "11111111111111111111111111111111",
  refundTo: "0xAbCdEf1111111111111111111111111111111111",
};
const issued = "0x52908400098527886E0F7030069857D2E4169EE7";

async function seedPreview(fromAsset: Record<string, unknown> = baseUsdc) {
  const quoteId = randomUUID();
  await db.insert(nearSwapPreviewsTable).values({
    quoteId, input, fromAsset: fromAsset as unknown as typeof baseUsdc, toAsset: solana,
    units: "5000000", minOut: "29000000", expiresAt: new Date(Date.now() + 45_000),
  });
  return quoteId;
}

function providerQuote(request: Record<string, unknown>, depositAddress = issued) {
  return {
    quoteRequest: request,
    quote: {
      depositAddress, deadline: new Date(Date.now() + 30 * 60_000).toISOString(),
      amountIn: "5000000", amountOut: "30000000", minAmountOut: "29700000",
      refundFee: "10000", withdrawFee: "5000", timeEstimate: 60,
    },
  };
}

async function postOrder(requestId: string, quoteId: string) {
  return nativeFetch(`${baseUrl}/swap/near/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": `203.0.113.${clientNumber++}` },
    body: JSON.stringify({ requestId, quoteId }),
  });
}

async function status(params: Record<string, string>) {
  return nativeFetch(`${baseUrl}/swap/near/status?${new URLSearchParams(params)}`, {
    headers: { "X-Forwarded-For": `203.0.113.${clientNumber++}` },
  });
}

test("an EVM-origin order is instruction-only, keeps the first-issued address, and tracks a case-only variant", async () => {
  const quoteId = await seedPreview();
  const requestId = randomUUID();
  let sentRequest: Record<string, unknown> = {};
  let statusEcho = issued.toLowerCase();
  const intercept = interceptProviders((url, body) => {
    if (url.pathname === "/v0/quote") {
      sentRequest = body ?? {};
      return Response.json(providerQuote(sentRequest));
    }
    if (url.pathname === "/v0/status") {
      return Response.json({ status: "PENDING_DEPOSIT", quoteResponse: providerQuote(sentRequest, statusEcho) });
    }
    assert.fail(`Unexpected provider call: ${url.pathname}`);
  });
  try {
    const created = await postOrder(requestId, quoteId);
    assert.equal(created.status, 200);
    const order = await created.json() as Record<string, any>;
    assert.equal(order.depositAddress, issued);
    assert.equal(order.from.chain, "base");
    assert.equal(order.from.native, false);
    assert.equal(order.from.contractAddress, baseUsdc.contractAddress);
    assert.equal(order.refundTo, input.refundTo);
    assert.equal(order.refundFee, "0.01", "refund fee stays in input-asset units");
    assert.equal(order.withdrawFee, "0.000005", "withdrawal fee stays in output-asset units");
    // One non-dry provider request with confidential execution; no transfer.
    assert.deepEqual(intercept.calls.map(call => `${call.method} ${call.url.pathname}`), ["POST /v0/quote"]);
    assert.equal(sentRequest.dry, false);
    assert.equal(sentRequest.confidentiality, "basic");
    assert.equal(sentRequest.originAsset, baseUsdc.id);
    assert.equal(sentRequest.refundTo, input.refundTo);
    assert.equal(sentRequest.refundType, "ORIGIN_CHAIN");
    const [saved] = await db.select().from(nearOrdersTable).where(eq(nearOrdersTable.id, requestId));
    assert.equal(saved.state, "ready");
    assert.equal(saved.depositAddress, issued);

    // The private receipt and a lowercase copy of the address authorize tracking.
    const tracked = await status({ requestId, depositAddress: issued.toLowerCase() });
    assert.equal(tracked.status, 200);
    const trackedBody = await tracked.json() as Record<string, any>;
    assert.equal(trackedBody.depositAddress, issued, "responses keep the address exactly as first issued");
    assert.equal(trackedBody.from.chain, "base");
    const lookup = intercept.calls.at(-1)!;
    assert.equal(lookup.url.pathname, "/v0/status");
    assert.equal(lookup.url.searchParams.get("depositAddress"), issued, "provider is queried with the issued address");

    // Unauthorized or mismatched lookups never reach the provider.
    const before = intercept.calls.length;
    for (const [params, code] of [
      [{ requestId, depositAddress: "11111111111111111111111111111111" }, 404],
      [{ requestId, depositAddress: "0x0000000000000000000000000000000000000001" }, 404],
      [{ requestId: randomUUID(), depositAddress: issued }, 404],
      [{ requestId, depositAddress: issued, depositMemo: "unexpected-memo" }, 404],
    ] as const) {
      const denied = await status(params);
      assert.equal(denied.status, code, JSON.stringify(params));
    }
    const invalid = await status({ requestId: "not-a-receipt", depositAddress: issued });
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { error: "Enter a valid private receipt ID and deposit address." });
    assert.equal(intercept.calls.length, before);

    // A genuinely different echoed address is rejected, not displayed.
    statusEcho = "0x0000000000000000000000000000000000000002";
    const tampered = await status({ requestId, depositAddress: issued });
    assert.equal(tampered.status, 502);
    assert.equal("depositAddress" in (await tampered.json() as object), false);
  } finally {
    intercept.restore();
  }
});

for (const interruptedState of ["uncertain", "creating"] as const) {
  test(`an EVM-origin order recovered from history while ${interruptedState} keeps the history copy of the deposit address`, async () => {
    const quoteId = await seedPreview();
    const requestId = randomUUID();
    const historyCopy = issued;
    const statusEcho = issued.toLowerCase();
    let sentRequest: Record<string, unknown> = {};
    const intercept = interceptProviders((url, body) => {
      if (url.pathname === "/v0/quote") {
        // The order may have been issued, but its response never arrives.
        sentRequest = body ?? {};
        return new Response("upstream unavailable", { status: 500 });
      }
      if (url.pathname === "/v0/account/history") {
        return Response.json({ items: [{
          createdAt: new Date().toISOString(), depositAddress: historyCopy,
          originAsset: baseUsdc.id, destinationAsset: solana.id,
          recipient: input.recipient, refundTo: input.refundTo,
          depositType: "ORIGIN_CHAIN", recipientType: "DESTINATION_CHAIN", refundType: "ORIGIN_CHAIN",
          amountInFormatted: input.amount,
        }] });
      }
      if (url.pathname === "/v0/status") {
        return Response.json({ status: "PENDING_DEPOSIT", quoteResponse: providerQuote(sentRequest, statusEcho) });
      }
      assert.fail(`Unexpected provider call: ${url.pathname}`);
    });
    try {
      const failed = await postOrder(requestId, quoteId);
      assert.equal(failed.status, 502);
      const [blocked] = await db.select().from(nearOrdersTable).where(eq(nearOrdersTable.id, requestId));
      assert.equal(blocked.state, "uncertain");
      assert.equal(blocked.depositAddress, null);
      if (interruptedState === "creating") {
        // A process stopped before it could record the outcome.
        await db.update(nearOrdersTable).set({ state: "creating" }).where(eq(nearOrdersTable.id, requestId));
      }

      const reopened = await nativeFetch(`${baseUrl}/swap/near/orders/${requestId}`, {
        headers: { "X-Forwarded-For": `203.0.113.${clientNumber++}` },
      });
      assert.equal(reopened.status, 200);
      const recovered = await reopened.json() as Record<string, any>;
      assert.equal(recovered.depositAddress, historyCopy, "the recovered receipt shows the history copy");
      assert.equal(recovered.from.chain, "base");
      const statusCall = intercept.calls.find(call => call.url.pathname === "/v0/status")!;
      assert.equal(statusCall.url.searchParams.get("depositAddress"), historyCopy);
      assert.equal(intercept.calls.filter(call => call.url.pathname === "/v0/quote").length, 1,
        "recovery never asks the provider for another order");

      const [saved] = await db.select().from(nearOrdersTable).where(eq(nearOrdersTable.id, requestId));
      assert.equal(saved.state, "ready");
      assert.equal(saved.depositAddress, historyCopy, "the saved receipt keeps the history copy");
      assert.equal((saved.orderDetails as Record<string, unknown>).depositAddress, historyCopy);
      assert.equal(((saved.providerResponse as Record<string, any>).quote).depositAddress, statusEcho,
        "the provider response is stored exactly as returned");

      // Tracking queries the provider with, and responds with, the history copy.
      const tracked = await status({ requestId, depositAddress: statusEcho });
      assert.equal(tracked.status, 200);
      assert.equal((await tracked.json() as Record<string, any>).depositAddress, historyCopy);
      assert.equal(intercept.calls.at(-1)!.url.searchParams.get("depositAddress"), historyCopy);

      // Reopening the finished receipt returns the same copy without another lookup.
      const lookups = intercept.calls.length;
      const again = await nativeFetch(`${baseUrl}/swap/near/orders/${requestId}`, {
        headers: { "X-Forwarded-For": `203.0.113.${clientNumber++}` },
      });
      assert.equal(again.status, 200);
      assert.equal((await again.json() as Record<string, any>).depositAddress, historyCopy);
      assert.equal(intercept.calls.length, lookups);
    } finally {
      intercept.restore();
    }
  });
}

test("an interrupted EVM recovery resumes with the saved history copy of the deposit address", async () => {
  const quoteId = await seedPreview();
  const requestId = randomUUID();
  let sentRequest: Record<string, unknown> = {};
  const intercept = interceptProviders((url, body) => {
    if (url.pathname === "/v0/quote") {
      sentRequest = body ?? {};
      return new Response("upstream unavailable", { status: 500 });
    }
    assert.fail(`Unexpected provider call: ${url.pathname}`);
  });
  try {
    assert.equal((await postOrder(requestId, quoteId)).status, 502);
    // Recovery saved the provider echo with the history copy, then stopped
    // before finalizing the receipt.
    await db.update(nearOrdersTable).set({
      state: "provider_received",
      depositAddress: issued,
      providerResponse: providerQuote(sentRequest, issued.toLowerCase()),
    }).where(eq(nearOrdersTable.id, requestId));

    const reopened = await nativeFetch(`${baseUrl}/swap/near/orders/${requestId}`, {
      headers: { "X-Forwarded-For": `203.0.113.${clientNumber++}` },
    });
    assert.equal(reopened.status, 200);
    assert.equal((await reopened.json() as Record<string, any>).depositAddress, issued);
    const [saved] = await db.select().from(nearOrdersTable).where(eq(nearOrdersTable.id, requestId));
    assert.equal(saved.state, "ready");
    assert.equal(saved.depositAddress, issued);
    assert.equal((saved.orderDetails as Record<string, unknown>).depositAddress, issued);
    assert.equal(intercept.calls.length, 1, "no further provider calls were needed");
  } finally {
    intercept.restore();
  }
});

test("a recovered EVM order whose saved history copy names a different address is held for review", async () => {
  const quoteId = await seedPreview();
  const requestId = randomUUID();
  let sentRequest: Record<string, unknown> = {};
  const intercept = interceptProviders((url, body) => {
    if (url.pathname === "/v0/quote") {
      sentRequest = body ?? {};
      return new Response("upstream unavailable", { status: 500 });
    }
    assert.fail(`Unexpected provider call: ${url.pathname}`);
  });
  try {
    assert.equal((await postOrder(requestId, quoteId)).status, 502);
    await db.update(nearOrdersTable).set({
      state: "provider_received",
      depositAddress: "0x0000000000000000000000000000000000000003",
      providerResponse: providerQuote(sentRequest, issued.toLowerCase()),
    }).where(eq(nearOrdersTable.id, requestId));

    const reopened = await nativeFetch(`${baseUrl}/swap/near/orders/${requestId}`, {
      headers: { "X-Forwarded-For": `203.0.113.${clientNumber++}` },
    });
    assert.equal(reopened.status, 502);
    assert.equal("depositAddress" in (await reopened.json() as object), false);
    const [saved] = await db.select().from(nearOrdersTable).where(eq(nearOrdersTable.id, requestId));
    assert.equal(saved.state, "review_needed");
    assert.equal(saved.orderDetails, null);
  } finally {
    intercept.restore();
  }
});

test("an EVM-origin order is refused when the issued deposit address is not an EVM address", async () => {
  const quoteId = await seedPreview();
  const requestId = randomUUID();
  const intercept = interceptProviders((url, body) => {
    if (url.pathname === "/v0/quote") return Response.json(providerQuote(body ?? {}, "11111111111111111111111111111111"));
    assert.fail(`Unexpected provider call: ${url.pathname}`);
  });
  try {
    const created = await postOrder(requestId, quoteId);
    assert.equal(created.status, 502);
    assert.equal("depositAddress" in (await created.json() as object), false);
    const [saved] = await db.select().from(nearOrdersTable).where(eq(nearOrdersTable.id, requestId));
    assert.notEqual(saved.state, "ready");
  } finally {
    intercept.restore();
  }
});

test("a preview from an origin that is not enabled is refused before any reservation or claim", async () => {
  const quoteId = await seedPreview({ ...baseUsdc, id: "nep141:arb.omft.near", symbol: "ETH", chain: "arb", chainName: "Arbitrum", native: true, contractAddress: undefined });
  const requestId = randomUUID();
  const intercept = interceptProviders((url) => assert.fail(`Unexpected provider call: ${url.pathname}`));
  try {
    const refused = await postOrder(requestId, quoteId);
    assert.equal(refused.status, 409);
    assert.equal(intercept.calls.length, 0);
    const [preview] = await db.select().from(nearSwapPreviewsTable).where(eq(nearSwapPreviewsTable.quoteId, quoteId));
    assert.equal(preview.claimedRequestId, null);
    assert.equal((await db.select().from(nearOrdersTable)).length, 0);
  } finally {
    intercept.restore();
  }
});

test("a legacy Solana receipt without chain or native metadata still opens and tracks", async () => {
  const requestId = randomUUID();
  const depositAddress = "So11111111111111111111111111111111111111112";
  const legacyFrom = { id: "nep141:sol.omft.near", symbol: "SOL", decimals: 9, price: 150 };
  const deadline = new Date(Date.now() + 30 * 60_000).toISOString();
  const orderDetails = {
    depositAddress, deadline, from: legacyFrom,
    to: { id: "nep141:eth.omft.near", symbol: "ETH", chain: "eth", chainName: "Ethereum", decimals: 18 },
    amountIn: "1", amountOut: "0.05", minAmountOut: "0.049",
    recipient: "0x1111111111111111111111111111111111111111", refundTo: "11111111111111111111111111111111",
    status: "PENDING_DEPOSIT", requestId, estimatedSeconds: 60,
  };
  const request = {
    originAsset: legacyFrom.id, destinationAsset: orderDetails.to.id, confidentiality: "basic",
    depositType: "ORIGIN_CHAIN", recipient: orderDetails.recipient, refundTo: orderDetails.refundTo,
  };
  await db.insert(nearOrdersTable).values({
    id: requestId, quoteId: randomUUID(), state: "ready", depositAddress,
    orderDetails, providerResponse: { quoteRequest: request },
  });
  const intercept = interceptProviders((url) => {
    if (url.pathname === "/v0/status") {
      return Response.json({
        status: "PROCESSING",
        quoteResponse: {
          quoteRequest: request,
          quote: { depositAddress, deadline, amountIn: "1000000000", amountOut: "50000000000000000", minAmountOut: "49000000000000000", timeEstimate: 60 },
        },
      });
    }
    assert.fail(`Unexpected provider call: ${url.pathname}`);
  });
  try {
    const receipt = await nativeFetch(`${baseUrl}/swap/near/orders/${requestId}`);
    assert.equal(receipt.status, 200);
    const body = await receipt.json() as Record<string, any>;
    assert.equal(body.from.chain, "sol");
    assert.equal(body.from.chainName, "Solana");
    assert.equal(body.from.native, true, "native comes from the exact SOL identity");

    const tracked = await status({ requestId, depositAddress });
    assert.equal(tracked.status, 200);
    assert.equal((await tracked.json() as Record<string, any>).status, "PROCESSING");
    // Solana addresses stay case-exact: a case-changed copy never reaches the provider.
    const lookups = intercept.calls.length;
    const changedCase = await status({ requestId, depositAddress: depositAddress.replace("So", "so") });
    assert.notEqual(changedCase.status, 200);
    assert.equal(intercept.calls.length, lookups);
  } finally {
    intercept.restore();
  }
});
