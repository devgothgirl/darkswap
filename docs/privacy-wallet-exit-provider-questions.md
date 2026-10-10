# Shielded Zcash delivery: partner messages

Status: drafts only; not sent.

Prepared from the October 9, 2026 checks in `privacy-wallet-exit-feasibility.md`. The observations below are dated findings, not claims that provider support can never change.

## Message 1 — NEAR Intents / 1Click

**Subject: Solana ZEC → native shielded Zcash through 1Click manual deposits**

Hi team,

We're assessing a DarkSwap flow where users manually send Solana ZEC to a provider deposit address and receive native ZEC directly in their own shielded Zcash wallet.

Our source mint is:

`A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS`

The public 1Click catalog lists:

- Source: `1cs_v1:sol:spl:A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS` — 8 decimals.
- Destination: `nep141:zec.omft.near` — 8 decimals.

The required flow uses `depositType: ORIGIN_CHAIN` and `recipientType: DESTINATION_CHAIN`. Users paste a receiving address and Solana refund address, then authorize the deposit transfer in their own wallet app. They must not connect a wallet to DarkSwap, sign a website message, or manage an embedded Intents balance. DarkSwap must not control a Zcash payout wallet.

**Can a supported 1Click API route deliver this exact pair directly to a shielded Zcash receiver today?**

Your chain-support documentation currently says Zcash transparent t1/t3 addresses only. ZecHub reports shielded delivery through a connected-wallet legacy Intents balance withdrawal:

https://zechub.wiki/using-zcash/solana-zec-to-shielded

Please clarify whether that shielded withdrawal capability is also available through the manual-deposit 1Click flow, or only through a separately signed balance withdrawal.

If it is available, please provide:

1. The supported receiving pools and address formats today, and any partner entitlement required. Please clarify the receiving-pool terminology used in the guide.
2. An API request/response example for this exact source and destination, including how to handle the `1cs_v1` source identifier, the recipient, and any shielded-only option.
3. The guarantee that a Unified Address cannot fall back to a transparent receiver. Which field or documented payout rule binds the order to shielded receipt? Address-prefix acceptance alone is not sufficient for us.
4. Whether `dry: true` validates the actual receiving capability without creating a live deposit/order, and how we can perform that check safely.
5. Pair-specific minimums, fees, quote expiry, Solana refund requirements, and handling of underpayments, failed shielded payouts, and compliance holds. How do we recover an uncertain creation response without duplicating an order?

Transparent delivery followed by shielding in the user's wallet does not meet our requirement. If this flow is unsupported, please confirm that explicitly and identify any supported non-custodial, manual-deposit alternative that does not require the signed-balance workflow.

We're requesting technical confirmation only. We will not create live orders or run funded tests without separate approval.

Thanks,
DarkSwap

## Message 2 — Houdini Swap

**Subject: Exact Solana ZEC route and shielded-only native Zcash payout support**

Hi team,

We're assessing a DarkSwap manual-deposit route from this exact Solana ZEC mint:

`A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS`

Our October 9 checks returned:

- Source token: `68f209b1a8a52dd27b0ea458` — matching mint, Solana, 8 decimals, enabled, CEX-capable.
- Native Zcash destination: `690ba9bb4f53f5543ae2a1a4` — enabled, CEX-capable, but chain address validation accepts only t1 addresses.
- `GET /quotes` with these token IDs, `amount=0.1`, and `types=private` returned `total:0` and `quotes:[]`. This is a point-in-time result at one amount, not an assumption that every route is unsupported.
- The native Zcash token reports 18 decimals, which differs from native Zcash's 8-decimal unit convention.

**Can your manual-deposit API deliver this exact source token directly to a shielded native Zcash receiver today, without a wallet connection to DarkSwap?**

If so, please confirm:

1. Which quote type, provider/out-leg, partner entitlement, and minimum amount make this exact pair executable. Is the empty quote response explained by amount, liquidity, entitlement, or unsupported routing?
2. Which receiving pools and address formats are supported, including Unified Addresses. Does the current t1-only validation accurately reflect payout support?
3. How a route enforces shielded-only receipt and refuses transparent fallback when a Unified Address contains multiple receivers. A private intermediary hop is not a substitute for shielded Zcash payout.
4. The quote and order parameters, plus a documented response example, that bind the payout to the supported shielded receiver. Can the actual receiver capability be verified before order creation?
5. The correct native-ZEC decimals and amount representation. Please explain the destination metadata value of 18 before we use it for any atomic-unit calculation.
6. Pair-specific fees, limits, quote expiry, Solana refund-address requirements, underpayment and compliance handling, and recovery from uncertain order creation or a rejected shielded payout.

Users would paste their Zcash receiving address and Solana refund address, then manually send the deposit from their wallet app. DarkSwap must not hold a Zcash payout wallet or introduce a connected-wallet balance flow.

Transparent ZEC followed by user-managed shielding is not acceptable. Please give an explicit unsupported answer if no shielded-only route is available. We are seeking technical confirmation, not authorizing order creation or a funded test.

Thanks,
DarkSwap

## What a useful reply must establish

- The exact source asset and an executable manual-deposit API path.
- Current supported shielded receivers and a no-transparent-fallback guarantee.
- Safe pre-order verification, exact amount semantics, and refund/recovery behavior.
- Any partner-specific enablement needed.

A generic “Zcash supported,” “private swap supported,” or “Unified Address accepted” reply does not clear the gate. Even a positive API confirmation is not proof of actual shielded settlement; a small funded verification requires separate owner approval.

Application implementation remains blocked until the provider-capability gate is cleared. These drafts do not authorize publication, spending, a new custody service, or changes to the unrelated countdown.
