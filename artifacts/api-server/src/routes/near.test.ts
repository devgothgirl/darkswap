import assert from "node:assert/strict";
import { test } from "node:test";

// Importing the route constructs the database pool but does not open a connection.
process.env.DATABASE_URL ??= "postgres://localhost/near_recovery_test";
process.env.NEAR_INTENTS_API_KEY ??= "near-recovery-test";
const { reconcileNearProviderResponse } = await import("./near");

test("NEAR recovery accepts omitted memo but rejects a different status memo", async () => {
  const createdAt = new Date();
  const deadline = new Date(createdAt.getTime() + 30 * 60_000).toISOString();
  const depositAddress = "11111111111111111111111111111111";
  const originAsset = "nep141:sol.omft.near";
  const destinationAsset = "nep141:eth.omft.near";
  const recipient = "0x1111111111111111111111111111111111111111";
  const refundTo = depositAddress;
  const preview: Parameters<typeof reconcileNearProviderResponse>[1] = {
    input: { recipient, refundTo } as Parameters<typeof reconcileNearProviderResponse>[1]["input"],
    from: { id: originAsset, decimals: 6 } as Parameters<typeof reconcileNearProviderResponse>[1]["from"],
    to: { id: destinationAsset } as Parameters<typeof reconcileNearProviderResponse>[1]["to"],
    units: "1000000",
    minOut: 1n,
    expires: createdAt.getTime() + 60_000,
  };
  const requestBody: Parameters<typeof reconcileNearProviderResponse>[2] = {
    dry: false, swapType: "EXACT_INPUT", slippageTolerance: 100,
    originAsset, depositType: "ORIGIN_CHAIN",
    destinationAsset, amount: "1000000",
    recipient, recipientType: "DESTINATION_CHAIN",
    refundTo, refundType: "ORIGIN_CHAIN",
    confidentiality: "basic", deadline,
  };
  const historyItem = {
    createdAt: createdAt.toISOString(), depositAddress,
    originAsset, destinationAsset, recipient, refundTo,
    depositType: "ORIGIN_CHAIN", recipientType: "DESTINATION_CHAIN", refundType: "ORIGIN_CHAIN",
    amountInFormatted: "1",
    // No depositMemo: a valid memo-less provider order.
  };
  const originalFetch = globalThis.fetch;
  try {
    let statusMemo: string | undefined;
    const paths: string[] = [];
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      paths.push(url.pathname);
      if (url.pathname.endsWith("/account/history")) {
        return Response.json({ items: [historyItem] });
      }
      assert.equal(url.pathname.endsWith("/status"), true);
      assert.equal(url.searchParams.has("depositMemo"), false);
      return Response.json({
        status: "PENDING_DEPOSIT",
        quoteResponse: {
          quoteRequest: requestBody,
          quote: { depositAddress, ...(statusMemo ? { depositMemo: statusMemo } : {}) },
        },
      });
    };
    const receipt = { createdAt } as Parameters<typeof reconcileNearProviderResponse>[0];
    const recovered = await reconcileNearProviderResponse(receipt, preview, requestBody);
    assert.equal(recovered?.status, "PENDING_DEPOSIT");
    assert.equal(paths.filter(path => path.endsWith("/status")).length, 1);

    statusMemo = "different-memo";
    await assert.rejects(
      reconcileNearProviderResponse(receipt, preview, requestBody),
      /NEAR order history did not match the saved request/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});