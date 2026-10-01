import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
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

process.env.HOUDINI_API_KEY = "order-recovery-test";
process.env.HOUDINI_API_SECRET = "order-recovery-test";
process.env.NEAR_INTENTS_API_KEY = "order-recovery-test";

const [{ db, pool, privateSwapOrderClaimsTable, nearOrdersTable, nearSwapPreviewsTable },
  { default: swapRouter }, { default: nearRouter }, { issueQuoteTicket }] = await Promise.all([
  import("@workspace/db"),
  import("./swap"),
  import("./near"),
  import("../lib/swap-tickets"),
]);

const nativeFetch = globalThis.fetch;
const addressTo = "recovery-test-recipient";
const quoteContext = {
  fromTokenId: "solana:sol",
  toTokenId: "zec:zec",
  amountIn: 1,
  amountOut: 0.5,
};

const app = express();
app.set("trust proxy", true);
app.use(express.json());
app.use((req: ExpressRequest, _res: ExpressResponse, next: NextFunction) => {
  Object.assign(req, { log: { warn() {}, error() {} } });
  next();
});
app.use(swapRouter);
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
  await pool.query("TRUNCATE private_swap_order_claims, near_orders, near_swap_previews");
});

after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()));
  }
  await pool.end();
});

type ProviderCall = { url: URL; method: string };
type ProviderHandler = (url: URL, init: RequestInit) => Response | Promise<Response>;

function interceptProviders(handler: ProviderHandler, serviceHandler?: ProviderHandler): {
  calls: ProviderCall[];
  restore: () => void;
} {
  const originalFetch = globalThis.fetch;
  const calls: ProviderCall[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      return nativeFetch(input, init);
    }
    if (url.hostname === "partners.near-intents.org") {
      return serviceHandler ? serviceHandler(url, init ?? {}) :
        Response.json({ activeIncidentCount: 0, activeIncidents: [], recentlyResolved: [] });
    }
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    return handler(url, init ?? {});
  };
  return { calls, restore: () => { globalThis.fetch = originalFetch; } };
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function seedPrivateClaim(providerQuoteId: string) {
  const quoteHash = digest(`houdini-private-order-quote:v1\0${providerQuoteId}`);
  const recipientHash = digest(JSON.stringify({ addressTo, destinationTag: "" }));
  const createdAt = new Date(Date.now() - 1_000);
  await db.insert(privateSwapOrderClaimsTable).values({
    quoteHash,
    recipientHash,
    state: "uncertain",
    providerRequest: { quote: quoteContext },
    createdAt,
  });
  return {
    quoteHash,
    quoteId: issueQuoteTicket(providerQuoteId, Date.now() + 60_000, 3, quoteContext),
  };
}

function validHoudiniOrder(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    houdiniId: "recovered-houdini-order",
    depositAddress: "provider-deposit-address",
    receiverAddress: addressTo,
    receiverTag: null,
    anonymous: true,
    inToken: { id: quoteContext.fromTokenId },
    outToken: { id: quoteContext.toTokenId },
    inAmount: quoteContext.amountIn,
    inSymbol: "SOL",
    outAmount: quoteContext.amountOut,
    outSymbol: "ZEC",
    displayStatus: "Waiting for deposit",
    status: 0,
    created: new Date(now).toISOString(),
    expires: new Date(now + 60 * 60_000).toISOString(),
    ...overrides,
  };
}

async function postPrivateOrder(quoteId: string): Promise<Response> {
  return nativeFetch(`${baseUrl}/swap/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": `198.51.100.${clientNumber++}`,
    },
    body: JSON.stringify({ quoteId, addressTo }),
  });
}

const nearInput = {
  from: "SOL",
  to: "ETH",
  amount: "1",
  recipient: "0x1111111111111111111111111111111111111111",
  refundTo: "11111111111111111111111111111111",
};
const nearFrom = {
  id: "nep141:sol.omft.near",
  symbol: "SOL",
  chain: "sol",
  chainName: "Solana",
  decimals: 6,
  price: 100,
};
const nearTo = {
  id: "nep141:eth.omft.near",
  symbol: "ETH",
  chain: "eth",
  chainName: "Ethereum",
  decimals: 6,
};
const nearDepositAddress = "11111111111111111111111111111111";
const nearDepositAddressAlternative = "So11111111111111111111111111111111111111112";

async function seedNearOrder() {
  const requestId = randomUUID();
  const quoteId = randomUUID();
  const createdAt = new Date(Date.now() - 1_000);
  const providerRequest = {
    dry: false,
    swapType: "EXACT_INPUT",
    slippageTolerance: 100,
    originAsset: nearFrom.id,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: nearTo.id,
    amount: "1000000",
    recipient: nearInput.recipient,
    recipientType: "DESTINATION_CHAIN",
    refundTo: nearInput.refundTo,
    refundType: "ORIGIN_CHAIN",
    confidentiality: "basic",
    deadline: new Date(createdAt.getTime() + 30 * 60_000).toISOString(),
  };
  await db.insert(nearOrdersTable).values({
    id: requestId,
    quoteId,
    state: "uncertain",
    providerRequest,
    createdAt,
  });
  await db.insert(nearSwapPreviewsTable).values({
    quoteId,
    input: nearInput,
    fromAsset: nearFrom,
    toAsset: nearTo,
    units: "1000000",
    minOut: "1000000",
    expiresAt: new Date(Date.now() + 60_000),
    claimedRequestId: requestId,
    createdAt,
  });
  return { requestId, quoteId, createdAt, providerRequest };
}

function matchingNearHistory(createdAt: Date, depositAddress = nearDepositAddress) {
  return {
    createdAt: createdAt.toISOString(),
    depositAddress,
    depositMemo: "recovery-memo",
    originAsset: nearFrom.id,
    destinationAsset: nearTo.id,
    recipient: nearInput.recipient,
    refundTo: nearInput.refundTo,
    depositType: "ORIGIN_CHAIN",
    recipientType: "DESTINATION_CHAIN",
    refundType: "ORIGIN_CHAIN",
    amountInFormatted: "1",
  };
}

function matchingNearStatus(
  providerRequest: Record<string, unknown>,
  depositAddress = nearDepositAddress,
  requestOverrides: Record<string, unknown> = {},
) {
  return {
    status: "PENDING_DEPOSIT",
    updatedAt: new Date().toISOString(),
    quoteResponse: {
      quoteRequest: { ...providerRequest, ...requestOverrides },
      quote: {
        depositAddress,
        depositMemo: "recovery-memo",
        deadline: providerRequest.deadline,
        amountIn: "1000000",
        amountOut: "2000000",
        minAmountOut: "1500000",
        timeEstimate: 60,
      },
    },
  };
}

async function postNearOrder(requestId: string, quoteId: string): Promise<Response> {
  return nativeFetch(`${baseUrl}/swap/near/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": `198.51.100.${clientNumber++}`,
    },
    body: JSON.stringify({ requestId, quoteId }),
  });
}

test("Houdini recovery returns one exact match only after its receipt is saved", async () => {
  const { quoteHash, quoteId } = await seedPrivateClaim("exact-match-quote");
  const order = validHoudiniOrder();
  const { calls, restore } = interceptProviders((url) => {
    if (url.pathname === "/v2/orders") return Response.json({ orders: [order], totalPages: 1 });
    if (url.pathname === `/v2/orders/${order.houdiniId}`) return Response.json(order);
    assert.fail(`Unexpected provider request: ${url.pathname}`);
  });
  try {
    const response = await postPrivateOrder(quoteId);
    assert.equal(response.status, 200);
    const receipt = await response.json() as { houdiniId: string };
    assert.equal(receipt.houdiniId, order.houdiniId);
    const [saved] = await db.select().from(privateSwapOrderClaimsTable)
      .where(eq(privateSwapOrderClaimsTable.quoteHash, quoteHash));
    assert.equal(saved.state, "ready");
    assert.deepEqual(receipt, saved.response);
    assert.deepEqual(calls.map(({ method }) => method), ["GET", "GET"]);
  } finally {
    restore();
  }
});

test("Houdini recovery rejects no match, multiple matches, and mismatched order details without creating again", async () => {
  const scenarios = [
    { quote: "no-match", orders: [] as ReturnType<typeof validHoudiniOrder>[], detail: undefined },
    {
      quote: "multiple-matches",
      orders: [
        validHoudiniOrder({ houdiniId: "ambiguous-one" }),
        validHoudiniOrder({ houdiniId: "ambiguous-two" }),
      ],
      detail: undefined,
    },
    {
      quote: "mismatched-details",
      orders: [validHoudiniOrder()],
      detail: validHoudiniOrder({ receiverAddress: "different-recipient" }),
    },
  ];
  for (const scenario of scenarios) {
    const { quoteId } = await seedPrivateClaim(scenario.quote);
    const { calls, restore } = interceptProviders((url) => {
      if (url.pathname === "/v2/orders") {
        return Response.json({ orders: scenario.orders, totalPages: 1 });
      }
      if (url.pathname.startsWith("/v2/orders/") && scenario.detail) {
        return Response.json(scenario.detail);
      }
      assert.fail(`Unexpected provider request: ${url.pathname}`);
    });
    try {
      const response = await postPrivateOrder(quoteId);
      assert.equal(response.status, 503, scenario.quote);
      assert.match((await response.json() as { error: string }).error, /cannot be submitted again/i);
      assert.equal(calls.some(({ method }) => method === "POST"), false);
      if (scenario.quote === "multiple-matches") {
        assert.equal(calls.length, 1, "ambiguous results must not fetch or select a detail record");
      }
    } finally {
      restore();
    }
  }
});

test("NEAR recovery reconciles history to status and persists the validated receipt", async () => {
  const seeded = await seedNearOrder();
  const { calls, restore } = interceptProviders((url) => {
    if (url.pathname === "/v0/account/history") {
      return Response.json({ items: [matchingNearHistory(seeded.createdAt)] });
    }
    if (url.pathname === "/v0/status") {
      return Response.json(matchingNearStatus(seeded.providerRequest));
    }
    assert.fail(`Unexpected provider request: ${url.pathname}`);
  });
  try {
    const response = await postNearOrder(seeded.requestId, seeded.quoteId);
    assert.equal(response.status, 200);
    const receipt = await response.json() as { depositAddress: string; requestId: string };
    assert.equal(receipt.depositAddress, nearDepositAddress);
    assert.equal(receipt.requestId, seeded.requestId);
    const [saved] = await db.select().from(nearOrdersTable);
    assert.equal(saved.state, "ready");
    const { routeStatus, ...durableReceipt } = receipt as typeof receipt & { routeStatus: unknown };
    assert.ok(routeStatus);
    assert.deepEqual(durableReceipt, saved.orderDetails);
    assert.deepEqual(calls.map(({ method }) => method), ["GET", "GET"]);
  } finally {
    restore();
  }
});

test("NEAR recovery requires an exact saved quoteRequest, history access, and one unambiguous match", async () => {
  const mismatched = await seedNearOrder();
  const mismatchFetch = interceptProviders((url) => {
    if (url.pathname === "/v0/account/history") {
      return Response.json({ items: [matchingNearHistory(mismatched.createdAt)] });
    }
    if (url.pathname === "/v0/status") {
      return Response.json(matchingNearStatus(mismatched.providerRequest, nearDepositAddress, { amount: "1000001" }));
    }
    assert.fail(`Unexpected provider request: ${url.pathname}`);
  });
  try {
    const response = await postNearOrder(mismatched.requestId, mismatched.quoteId);
    assert.equal(response.status, 502);
    assert.match((await response.json() as { error: string }).error, /Do not send funds/);
    assert.equal(mismatchFetch.calls.some(({ method }) => method === "POST"), false);
  } finally {
    mismatchFetch.restore();
  }

  const denied = await seedNearOrder();
  const deniedFetch = interceptProviders((url) => {
    assert.equal(url.pathname, "/v0/account/history");
    return Response.json({}, { status: 403 });
  });
  try {
    const response = await postNearOrder(denied.requestId, denied.quoteId);
    assert.equal(response.status, 503);
    assert.match((await response.json() as { error: string }).error, /Do not create another order/);
    assert.deepEqual(deniedFetch.calls.map(({ method }) => method), ["GET"]);
  } finally {
    deniedFetch.restore();
  }

  const ambiguous = await seedNearOrder();
  const ambiguousFetch = interceptProviders((url) => {
    assert.equal(url.pathname, "/v0/account/history");
    return Response.json({
      items: [
        matchingNearHistory(ambiguous.createdAt, nearDepositAddress),
        matchingNearHistory(ambiguous.createdAt, nearDepositAddressAlternative),
      ],
    });
  });
  try {
    const response = await postNearOrder(ambiguous.requestId, ambiguous.quoteId);
    assert.equal(response.status, 409);
    assert.match((await response.json() as { error: string }).error, /Do not send funds/);
    assert.deepEqual(ambiguousFetch.calls.map(({ method }) => method), ["GET"]);
  } finally {
    ambiguousFetch.restore();
  }
});

test("both recovery routes withhold deposit instructions when ready-state storage fails", async () => {
  const privateClaim = await seedPrivateClaim("storage-failure-quote");
  const nearOrder = await seedNearOrder();
  await pool.query(`
    CREATE OR REPLACE FUNCTION block_recovered_receipt_ready() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.state = 'ready' THEN RETURN NULL; END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER block_private_recovered_ready BEFORE UPDATE OF state
      ON private_swap_order_claims FOR EACH ROW EXECUTE FUNCTION block_recovered_receipt_ready();
    CREATE TRIGGER block_near_recovered_ready BEFORE UPDATE OF state
      ON near_orders FOR EACH ROW EXECUTE FUNCTION block_recovered_receipt_ready();
  `);
  const order = validHoudiniOrder();
  const failedStorageFetch = interceptProviders((url) => {
    if (url.pathname === "/v2/orders") return Response.json({ orders: [order], totalPages: 1 });
    if (url.pathname === `/v2/orders/${order.houdiniId}`) return Response.json(order);
    if (url.pathname === "/v0/account/history") {
      return Response.json({ items: [matchingNearHistory(nearOrder.createdAt)] });
    }
    if (url.pathname === "/v0/status") return Response.json(matchingNearStatus(nearOrder.providerRequest));
    assert.fail(`Unexpected provider request: ${url.pathname}`);
  });
  try {
    const privateResponse = await postPrivateOrder(privateClaim.quoteId);
    assert.equal(privateResponse.status, 503);
    const privateBody = await privateResponse.json() as Record<string, unknown>;
    assert.equal("depositAddress" in privateBody, false);

    const nearResponse = await postNearOrder(nearOrder.requestId, nearOrder.quoteId);
    assert.equal(nearResponse.status, 502);
    const nearBody = await nearResponse.json() as Record<string, unknown>;
    assert.equal("depositAddress" in nearBody, false);
    assert.equal(failedStorageFetch.calls.some(({ method }) => method === "POST"), false);

    const [savedPrivate] = await db.select().from(privateSwapOrderClaimsTable);
    const [savedNear] = await db.select().from(nearOrdersTable);
    assert.notEqual(savedPrivate.state, "ready");
    assert.notEqual(savedNear.state, "ready");
  } finally {
    failedStorageFetch.restore();
    await pool.query(`
      DROP TRIGGER IF EXISTS block_private_recovered_ready ON private_swap_order_claims;
      DROP TRIGGER IF EXISTS block_near_recovered_ready ON near_orders;
      DROP FUNCTION IF EXISTS block_recovered_receipt_ready();
    `);
  }
});

test("NEAR incident safety blocks before claiming, preserves recovery/tracking, and retains orders issued during an incident", async (t) => {
  let clock = Date.now() + 60_000;
  t.mock.method(Date, "now", () => clock);
  const emptyFeed = { activeIncidentCount: 0, activeIncidents: [], recentlyResolved: [] };
  const activeFeed = (scopeValue: string, scopeType = "chain") => ({
    activeIncidentCount: 1,
    activeIncidents: [{
      id: "incident-test", scopeValue, scopeType, status: "active",
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }],
    recentlyResolved: [],
  });
  let feedResponse: () => Response = () => Response.json(activeFeed("sol"));
  let beganDuringCreation = false;
  let lastRequest: Record<string, unknown> = {};
  let recoveryCreatedAt: Date | undefined;
  let feedCalls = 0;
  const intercept = interceptProviders((url, init) => {
    if (url.pathname === "/v0/quote") {
      assert.equal(init.method, "POST");
      lastRequest = JSON.parse(String(init.body));
      if (beganDuringCreation) feedResponse = () => Response.json(activeFeed("eth", "chain_all"));
      return Response.json(matchingNearStatus(lastRequest).quoteResponse);
    }
    if (url.pathname === "/v0/account/history" && recoveryCreatedAt) {
      return Response.json({ items: [matchingNearHistory(recoveryCreatedAt)] });
    }
    if (url.pathname === "/v0/status") return Response.json(matchingNearStatus(lastRequest));
    assert.fail(`Unexpected provider call: ${url.pathname}`);
  }, () => { feedCalls++; return feedResponse(); });

  async function unclaimedPreview() {
    const seeded = await seedNearOrder();
    await db.delete(nearOrdersTable).where(eq(nearOrdersTable.id, seeded.requestId));
    await db.update(nearSwapPreviewsTable).set({ claimedRequestId: null })
      .where(eq(nearSwapPreviewsTable.quoteId, seeded.quoteId));
    return seeded;
  }
  try {
    for (const reply of [
      () => Response.json(activeFeed("sol")),
      () => Response.json(activeFeed("hot", "bridge")),
      () => Response.json(activeFeed("solana")),
      () => Response.json({}),
      () => new Response("", { status: 503 }),
    ]) {
      clock += 60_000;
      feedResponse = reply;
      const seeded = await unclaimedPreview();
      const response = await postNearOrder(seeded.requestId, seeded.quoteId);
      assert.equal(response.status, 503);
      const [preview] = await db.select().from(nearSwapPreviewsTable).where(eq(nearSwapPreviewsTable.quoteId, seeded.quoteId));
      const order = await db.select().from(nearOrdersTable).where(eq(nearOrdersTable.id, seeded.requestId));
      assert.equal(preview.claimedRequestId, null);
      assert.equal(order.length, 0);
      assert.equal(intercept.calls.length, 0, "blocked creation never calls trading provider");
    }

    // A clean preflight changes to an incident during the live quote request.
    clock += 60_000;
    feedResponse = () => Response.json(emptyFeed);
    beganDuringCreation = true;
    const seeded = await unclaimedPreview();
    const created = await postNearOrder(seeded.requestId, seeded.quoteId);
    assert.equal(created.status, 200);
    const body = await created.json() as Record<string, any>;
    assert.equal(body.routeStatus.eligibility, "paused");
    assert.equal(body.routeStatus.state, "fresh");
    assert.equal(body.depositAddress, nearDepositAddress);
    const [saved] = await db.select().from(nearOrdersTable).where(eq(nearOrdersTable.id, seeded.requestId));
    assert.equal(saved.state, "ready");
    assert.equal("routeStatus" in (saved.orderDetails as object), false, "incident observations are not durable order truth");

    const replay = await postNearOrder(seeded.requestId, seeded.quoteId);
    assert.equal(replay.status, 200);
    assert.equal((await replay.json() as Record<string, any>).routeStatus.eligibility, "paused");
    const receipt = await nativeFetch(`${baseUrl}/swap/near/orders/${seeded.requestId}`);
    assert.equal(receipt.status, 200);
    assert.equal((await receipt.json() as Record<string, any>).routeStatus.eligibility, "paused");
    const status = await nativeFetch(`${baseUrl}/swap/near/status?depositAddress=${nearDepositAddress}&depositMemo=recovery-memo`);
    assert.equal(status.status, 200);
    assert.equal((await status.json() as Record<string, any>).routeStatus.eligibility, "paused");
    assert.equal(intercept.calls.filter(call => call.method === "POST").length, 1, "replay never replaces issued order");

    const uncertain = await seedNearOrder();
    recoveryCreatedAt = uncertain.createdAt;
    lastRequest = uncertain.providerRequest;
    const recovered = await postNearOrder(uncertain.requestId, uncertain.quoteId);
    assert.equal(recovered.status, 200, "uncertain receipt reconciliation remains accessible during incidents");
    assert.equal((await recovered.json() as Record<string, any>).routeStatus.eligibility, "paused");
    assert.equal(intercept.calls.filter(call => call.method === "POST").length, 1, "recovery only performs reads");

    // Explicit fresh checks clear the incident and unrelated supported networks
    // alone do not block a newly reviewed Solana -> Ethereum order.
    clock += 60_000;
    beganDuringCreation = false;
    feedResponse = () => Response.json(activeFeed("bsc"));
    const unrelated = await unclaimedPreview();
    const permitted = await postNearOrder(unrelated.requestId, unrelated.quoteId);
    assert.equal(permitted.status, 200);
    assert.equal((await permitted.json() as Record<string, any>).routeStatus.eligibility, "allowed");
    assert.ok(feedCalls >= 9, "preflight and bounded post-create checks both read the public feed");

    // Public feed route is independent of trading credentials.
    const key = process.env.NEAR_INTENTS_API_KEY;
    delete process.env.NEAR_INTENTS_API_KEY;
    try {
      const publicResponse = await nativeFetch(`${baseUrl}/swap/near/service-status?fromChain=sol&toChain=eth`);
      assert.equal(publicResponse.status, 200);
      assert.equal((await publicResponse.json() as Record<string, any>).eligibility, "allowed");
    } finally {
      process.env.NEAR_INTENTS_API_KEY = key;
    }
  } finally {
    intercept.restore();
  }
});