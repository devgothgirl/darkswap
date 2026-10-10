import assert from "node:assert/strict";
import { test } from "node:test";

// Importing the route constructs the database pool but does not open a connection.
process.env.DATABASE_URL ??= "postgres://localhost/near_recovery_test";
process.env.NEAR_INTENTS_API_KEY ??= "near-recovery-test";
// Partner-fee configuration is memoized on first use; fix it deterministically
// so recovery tests exercise both legacy (no appFees) and configured requests.
process.env.NEAR_PARTNER_FEE_BPS = "40";
process.env.NEAR_PARTNER_PAYOUT_ADDRESS = "0000000000000000000000000000000000000000000000000000000000000000";
const { reconcileNearProviderResponse, checkedQuote, echoedPartnerFeeBps } = await import("./near");

const PARTNER_PAYOUT = process.env.NEAR_PARTNER_PAYOUT_ADDRESS;
const PROVIDER_FEE_ADDRESS = "2238fd089f1c92b206c218cd16b8676cb98964e0d50f8ab729c6396a81e07805";

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
    from: { id: originAsset, chain: "sol", decimals: 6 } as Parameters<typeof reconcileNearProviderResponse>[1]["from"],
    to: { id: destinationAsset, chain: "eth" } as Parameters<typeof reconcileNearProviderResponse>[1]["to"],
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

function feePreview(createdAt: Date) {
  const recipient = "0x1111111111111111111111111111111111111111";
  const refundTo = "11111111111111111111111111111111";
  return {
    recipient,
    refundTo,
    preview: {
      input: { recipient, refundTo } as Parameters<typeof reconcileNearProviderResponse>[1]["input"],
      from: { id: "nep141:sol.omft.near", chain: "sol", decimals: 6 } as Parameters<typeof reconcileNearProviderResponse>[1]["from"],
      to: { id: "nep141:eth.omft.near", chain: "eth", decimals: 6 } as Parameters<typeof reconcileNearProviderResponse>[1]["to"],
      units: "1000000",
      minOut: 1n,
      expires: createdAt.getTime() + 60_000,
    },
  };
}

function feeRequestBody(createdAt: Date, withFees: boolean) {
  const { recipient, refundTo } = feePreview(createdAt);
  return {
    dry: false, swapType: "EXACT_INPUT", slippageTolerance: 100,
    originAsset: "nep141:sol.omft.near", depositType: "ORIGIN_CHAIN",
    destinationAsset: "nep141:eth.omft.near", amount: "1000000",
    recipient, recipientType: "DESTINATION_CHAIN",
    refundTo, refundType: "ORIGIN_CHAIN",
    confidentiality: "basic",
    deadline: new Date(createdAt.getTime() + 30 * 60_000).toISOString(),
    ...(withFees ? { appFees: [{ recipient: PARTNER_PAYOUT, fee: 40 }] } : {}),
  };
}

function stubProvider(echoed: unknown, createdAt: Date) {
  const { recipient, refundTo } = feePreview(createdAt);
  const historyItem = {
    createdAt: createdAt.toISOString(), depositAddress: "11111111111111111111111111111111",
    originAsset: "nep141:sol.omft.near", destinationAsset: "nep141:eth.omft.near",
    recipient, refundTo,
    depositType: "ORIGIN_CHAIN", recipientType: "DESTINATION_CHAIN", refundType: "ORIGIN_CHAIN",
    amountInFormatted: "1",
  };
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/account/history")) {
      return Response.json({ items: [historyItem] });
    }
    return Response.json({
      status: "PENDING_DEPOSIT",
      quoteResponse: {
        quoteRequest: { ...feeRequestBody(createdAt, true), ...(echoed === undefined ? {} : { appFees: echoed }) },
        quote: { depositAddress: "11111111111111111111111111111111" },
      },
    });
  };
}

test("NEAR recovery accepts verbatim and 50/50-split partner fee echoes, rejects tampering", async () => {
  const createdAt = new Date();
  const { preview } = feePreview(createdAt);
  const requestBody = feeRequestBody(createdAt, true);
  const receipt = { createdAt } as Parameters<typeof reconcileNearProviderResponse>[0];
  const originalFetch = globalThis.fetch;
  try {
    // Authenticated echoes repeat our entry verbatim and append the
    // provider's own platform-fee entry (observed against the live API).
    stubProvider([{ recipient: PARTNER_PAYOUT, fee: 40 }, { recipient: PROVIDER_FEE_ADDRESS, fee: 20 }], createdAt);
    assert.equal((await reconcileNearProviderResponse(receipt, preview, requestBody))?.status, "PENDING_DEPOSIT");

    // The documented partner schedule may instead split our fee 50/50.
    stubProvider([{ recipient: PARTNER_PAYOUT, fee: 20 }, { recipient: PROVIDER_FEE_ADDRESS, fee: 20 }], createdAt);
    assert.equal((await reconcileNearProviderResponse(receipt, preview, requestBody))?.status, "PENDING_DEPOSIT");

    // A different fee to our address, an inflated provider entry, and a
    // missing partner entry must all fail verification.
    for (const tampered of [
      [{ recipient: PARTNER_PAYOUT, fee: 41 }, { recipient: PROVIDER_FEE_ADDRESS, fee: 20 }],
      [{ recipient: PARTNER_PAYOUT, fee: 40 }, { recipient: PROVIDER_FEE_ADDRESS, fee: 30 }],
      [{ recipient: PROVIDER_FEE_ADDRESS, fee: 20 }],
    ]) {
      stubProvider(tampered, createdAt);
      await assert.rejects(
        reconcileNearProviderResponse(receipt, preview, requestBody),
        /NEAR order history did not match the saved request/,
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("NEAR legacy orders saved before partner fees recover despite provider-added fee entries", async () => {
  const createdAt = new Date();
  const { preview } = feePreview(createdAt);
  const requestBody = feeRequestBody(createdAt, false);
  const receipt = { createdAt } as Parameters<typeof reconcileNearProviderResponse>[0];
  const originalFetch = globalThis.fetch;
  try {
    // The provider adds its own platform-fee entry even to requests that
    // never carried appFees; legacy orders must still reconcile.
    stubProvider([{ recipient: PROVIDER_FEE_ADDRESS, fee: 20 }], createdAt);
    assert.equal((await reconcileNearProviderResponse(receipt, preview, requestBody))?.status, "PENDING_DEPOSIT");

    stubProvider(undefined, createdAt);
    assert.equal((await reconcileNearProviderResponse(receipt, preview, requestBody))?.status, "PENDING_DEPOSIT");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("NEAR quote validation and fee disclosure accept both echo shapes and reject tampering", () => {
  const createdAt = new Date();
  const { preview } = feePreview(createdAt);
  const requestBody = feeRequestBody(createdAt, true) as Parameters<typeof checkedQuote>[2];
  const quote = { amountIn: "1000000", amountOut: "990000", minAmountOut: "980000", timeEstimate: 22 };
  const result = (appFees: unknown) => ({
    quoteRequest: { ...requestBody, appFees },
    quote,
  });
  assert.equal(checkedQuote(result([{ recipient: PARTNER_PAYOUT, fee: 40 }, { recipient: PROVIDER_FEE_ADDRESS, fee: 20 }]), preview, requestBody), quote);
  assert.equal(checkedQuote(result([{ recipient: PARTNER_PAYOUT, fee: 20 }, { recipient: PROVIDER_FEE_ADDRESS, fee: 20 }]), preview, requestBody), quote);
  assert.throws(
    () => checkedQuote(result([{ recipient: PARTNER_PAYOUT, fee: 60 }, { recipient: PROVIDER_FEE_ADDRESS, fee: 20 }]), preview, requestBody),
    /did not match/,
  );

  // Disclosure reports the configured total whenever the echo accounts for
  // it, and stays silent for legacy or foreign requests.
  assert.equal(echoedPartnerFeeBps({ appFees: [{ recipient: PARTNER_PAYOUT, fee: 40 }, { recipient: PROVIDER_FEE_ADDRESS, fee: 20 }] }), 40);
  assert.equal(echoedPartnerFeeBps({ appFees: [{ recipient: PARTNER_PAYOUT, fee: 20 }, { recipient: PROVIDER_FEE_ADDRESS, fee: 20 }] }), 40);
  assert.equal(echoedPartnerFeeBps({ appFees: [{ recipient: PROVIDER_FEE_ADDRESS, fee: 20 }] }), undefined);
  assert.equal(echoedPartnerFeeBps({}), undefined);
});
test("NEAR recovery for an EVM origin checks the deposit address on that network and accepts a case-only echo", async () => {
  type ReconcilePreview = Parameters<typeof reconcileNearProviderResponse>[1];
  const createdAt = new Date();
  const deadline = new Date(createdAt.getTime() + 30 * 60_000).toISOString();
  const issued = "0x52908400098527886E0F7030069857D2E4169EE7";
  const originAsset = "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near";
  const destinationAsset = "nep141:sol.omft.near";
  const recipient = "11111111111111111111111111111111";
  const refundTo = "0xAbCdEf1111111111111111111111111111111111";
  const preview: ReconcilePreview = {
    input: { recipient, refundTo } as ReconcilePreview["input"],
    from: { id: originAsset, chain: "base", decimals: 6 } as ReconcilePreview["from"],
    to: { id: destinationAsset, chain: "sol", decimals: 9 } as ReconcilePreview["to"],
    units: "5000000",
    minOut: 1n,
    expires: createdAt.getTime() + 60_000,
  };
  const requestBody: Parameters<typeof reconcileNearProviderResponse>[2] = {
    dry: false, swapType: "EXACT_INPUT", slippageTolerance: 100,
    originAsset, depositType: "ORIGIN_CHAIN",
    destinationAsset, amount: "5000000",
    recipient, recipientType: "DESTINATION_CHAIN",
    refundTo, refundType: "ORIGIN_CHAIN",
    confidentiality: "basic", deadline,
  };
  let historyAddress = issued;
  let statusAddress = issued.toLowerCase();
  const statusLookups: string[] = [];
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/account/history")) {
        return Response.json({ items: [{
          createdAt: createdAt.toISOString(), depositAddress: historyAddress,
          originAsset, destinationAsset, recipient, refundTo,
          depositType: "ORIGIN_CHAIN", recipientType: "DESTINATION_CHAIN", refundType: "ORIGIN_CHAIN",
          amountInFormatted: "5",
        }] });
      }
      statusLookups.push(url.searchParams.get("depositAddress") ?? "");
      return Response.json({
        status: "PENDING_DEPOSIT",
        quoteResponse: { quoteRequest: requestBody, quote: { depositAddress: statusAddress } },
      });
    };
    const receipt = { createdAt } as Parameters<typeof reconcileNearProviderResponse>[0];

    // The provider may echo an EVM address with a different checksum case.
    const recovered = await reconcileNearProviderResponse(receipt, preview, requestBody);
    assert.equal(recovered?.status, "PENDING_DEPOSIT");
    assert.deepEqual(statusLookups, [issued], "status is queried with the history copy as issued");
    assert.equal(recovered?.issuedDepositAddress, issued, "the history copy is retained as the issued address");
    assert.equal((recovered?.response.quote as Record<string, unknown>).depositAddress, issued.toLowerCase(),
      "the provider response itself is kept exactly as returned");

    // A Solana-shaped address is never a valid Base deposit address.
    historyAddress = "11111111111111111111111111111111";
    assert.equal(await reconcileNearProviderResponse(receipt, preview, requestBody), undefined);
    assert.equal(statusLookups.length, 1, "an invalid origin address never reaches the status lookup");

    // A genuinely different EVM address is still rejected.
    historyAddress = issued;
    statusAddress = "0x0000000000000000000000000000000000000001";
    await assert.rejects(
      reconcileNearProviderResponse(receipt, preview, requestBody),
      /NEAR order history did not match the saved request/,
    );

    // Recipient and refund comparisons remain exact, including hex case.
    statusAddress = issued;
    assert.equal(await reconcileNearProviderResponse(receipt, preview, { ...requestBody, refundTo: refundTo.toLowerCase() }), undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
