# Privacy wallet exit feasibility

Checked: October 9, 2026. These are point-in-time capabilities, not permanent assertions about provider support.

## October 10, 2026 update — shielded-only 1Click dry quote accepted

The earlier conclusion below is superseded at the **recipient-bound dry-quote** level. The current chain-support page still says transparent-only, but NEAR's official Intents SDK validates Unified Addresses containing Orchard receivers and includes an Orchard-only test fixture with no transparent receiver.

Direct `POST /v0/quote` checks using that **synthetic public SDK test fixture**, `dry: true`, the exact Solana ZEC source above and native destination `nep141:zec.omft.near` returned HTTP 201. An authenticated check also accepted `confidentiality: "basic"` and the configured 40-bps DarkSwap fee, echoed the recipient unchanged, and quoted 0.1 source ZEC → 0.09928 native ZEC. No deposit address was generated. No order was funded or payout executed.

This establishes live quote acceptance for a shielded-only recipient, not completed shielded settlement or spendability of the synthetic fixture. Never fund a test-fixture address. Actual supported receiver/pool semantics, validation, refund/tracking behavior and an owner-approved real-wallet settlement check remain necessary before claiming a completed shielded payout integration. Do not substitute a transparent receiver.

Sources:
- https://docs.near-intents.org/integration/devkit/intents-sdk
- https://github.com/defuse-protocol/sdk-monorepo/blob/main/packages/intents-sdk/src/lib/zcash-unified-address.ts
- https://github.com/defuse-protocol/sdk-monorepo/blob/main/packages/intents-sdk/src/lib/validateAddress.spec.ts
- https://docs.near-intents.org/api-reference/oneclick/request-a-swap-quote

The remaining sections preserve the October 9 findings; their blanket quote-capability blocker must not be reused as the current conclusion.

## Workspace implementation and owner test

The owner subsequently authorized implementation and will perform the funded test. Native Zcash is now a receive-only destination in the workspace Bridge. The application accepts checksum-valid mainnet Unified Addresses containing Orchard and no transparent receiver, preserves the full address, and rejects mixed, transparent, Sapling-only and unsupported receiver types. Solana remains the default production origin; no production-origin configuration was changed.

The running development application successfully returned a recipient-bound dry quote for 0.005 Solana ZEC → 0.00466 native ZEC, with the 40-bps application fee and an unchanged shielded-only synthetic receiver. The same endpoint rejected a transparent receiver with HTTP 400. No live order or funded transfer was created. Test fixtures must never be funded; the owner must use their own supported shielded-only receiving address.

Code readiness is not proof of shielded settlement or publication. An owner-approved real-wallet test and confirmation of actual shielded receipt remain outstanding.

## Decision

**Implementation is blocked at the provider-capability gate.** No investigated route has been verified to accept the exact Solana ZEC token and pay directly to a supported native shielded Zcash receiver through a manual-deposit API.

The owner requires shielded receipt and no wallet connection to DarkSwap. Transparent receipt followed by wallet shielding is not an acceptable fallback. Do not enable a selectable shielded exit, widen existing native-chain routing, create orders for research, or implement an operator-controlled payout wallet to bypass this gate.

The application and its existing swap routes remain unchanged. No order creation, wallet signing, funded transfer, publication, or countdown changes occurred during these checks.

## Capability matrix

| Provider / path | Exact Solana ZEC source | Native Zcash payout | Shielded receiver evidence | No DarkSwap wallet connection | Result |
| --- | --- | --- | --- | --- | --- |
| NEAR 1Click, origin-chain deposit | Public catalog lists exact mint, 8 decimals, newer `1cs_v1` identifier | Catalog lists native ZEC, 8 decimals | Official chain-support documentation explicitly says transparent t1/t3 only | Manual origin-chain deposits are documented | Do not enable shielded delivery; obtain route-specific clarification |
| Existing private-route partner API (Houdini v2) | Token-detail lookup matches exact mint, 8 decimals, issued token, enabled and CEX-capable | Native Zcash entry is enabled and CEX-capable | Current chain address validation is `^t1[1-9A-HJ-NP-Za-km-z]{33}$`; no shielded/Unified Address contract established | Private manual deposits are documented | Shielded payout unverified; dry quote returned zero routes at tested amount |
| Flyp.me manual-deposit API | No matching mint or Solana source entry in checked catalog | ZEC is listed, but `exchange:false` and `send:false` | Z.cash directory advertises shielded withdrawals; that does not establish currently enabled API/receiver support | Manual deposit API is documented | Currently unusable for this route |
| ZecHub guide's solswap.org → near.com legacy-balance withdrawal | Guide identifies exact mint and reports a funded transfer | Guide reports direct native shielded receipt | Guide reports an Ironwood shielded receiver and wallet receipt | **No:** wallet connection and a message signature authorize balance withdrawal | Evidence of a different execution path, not our required no-connect API route |

### Source identity

- Mint: `A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS`.
- NEAR catalog source: `1cs_v1:sol:spl:A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS`, chain `sol`, 8 decimals.
- NEAR catalog native destination: `nep141:zec.omft.near`, chain `zec`, 8 decimals.
- Houdini source token: `68f209b1a8a52dd27b0ea458`; returned `address` equals the mint, `chain:solana`, `decimals:8`, `mainnet:false`, `enabled:true`, `hasCex:true`.
- Houdini native Zcash token: `690ba9bb4f53f5543ae2a1a4`; returned empty contract address, `chain:Zcash`, `mainnet:true`, `enabled:true`, `hasCex:true`, and **18 decimals**.

Houdini's `mainnet` field means native coin versus issued token, not production versus test network. Its native Zcash decimals differ from the NEAR native catalog's 8 decimals and must be resolved before using metadata for atomic-unit calculations. Do not silently assume either catalog is a backing audit or proof of lossless redemption.

## Read-only quote checks

Houdini `GET /quotes`, `types=private`, source token `68f209b1a8a52dd27b0ea458`, input `0.1` ZEC:

| Native destination | Provider token | Result |
| --- | --- | --- |
| Zcash | `690ba9bb4f53f5543ae2a1a4` | `total:0`, `quotes:[]` |
| Monero | `6689b73ec90e45f3b3e5155c` | `total:0`, `quotes:[]` |
| Firo | `6689b73ec90e45f3b3e51578` | `total:0`, `quotes:[]` |

These responses prove only that no quotes were returned for these specific requests at check time. They do not prove that every amount or provider mode is unsupported. No quote was accepted and no exchange/order endpoint was called.

Monero's current catalog address pattern admits standard/subaddress-style and integrated-address-length strings but is not sufficient checksum validation. Firo's current short-address pattern does not establish Spark/private-receiver support. Zano search returned no entries. Neither Monero nor Firo is enabled as an expansion of this feature.

Flyp.me `GET /api/v1/currencies` returned 54 entries, with ZEC exchange and sending disabled and no entry establishing this Solana mint. Its listed USDC is ERC-20, not Solana USDC. Do not substitute a similarly named asset.

NEAR's documented shielded-address exclusion prevents establishing an approved recipient-bound shielded quote for the required route. No synthetic Unified Address was treated as proof of delivery, and no transparent control quote was used as a substitute.

## Resolving the guide/API discrepancy

The ZecHub guide describes depositing into a wallet-controlled NEAR Intents balance, then withdrawing through near.com's legacy-assets flow. The user's wallet connects and signs a message that authorizes spending from that balance.

The required DarkSwap flow uses a normal origin-chain deposit and requires no website signature or wallet connection. It needs a provider quote and payout contract binding that deposit to the user's shielded receiver. The guide does not demonstrate this contract. Its reported Ironwood support also cannot be inferred for either 1Click or Houdini from generic Zcash catalog entries.

The open question is whether a partner-enabled 1Click/other manual-deposit route supports the same shielded receiving pool and addresses, despite the documented restriction. Do not present the documentation discrepancy as proof that shielded delivery is impossible.

## Required provider confirmation

Ask NEAR/1Click and the existing private-route partner to confirm:

1. Can the manual-deposit API accept the exact Solana mint above and deliver native ZEC directly to a shielded receiver, without a user Intents balance or browser signature?
2. Which receiving pools and address formats are supported today? How does a Unified Address with multiple receivers enforce shielded-only delivery, without transparent fallback?
3. Which API path, token identifiers, recipient parameters, and response fields establish this capability? Is partner entitlement or a new route required?
4. What are source-pair minimums, withdrawal fees, quote expiry, and Solana refund requirements? Explain the native-ZEC decimal discrepancy where applicable.
5. How are failed payouts, compliance holds, underpayments, and uncertain order creation recovered without duplicate orders?
6. Is a read-only recipient-bound quote possible before obtaining separate owner approval for a small funded verification?

No provider request was sent as part of this research.

## Implementation boundary

Resume application work only when a supported manual-deposit shielded route is established. Then add exact-asset and receiver validation, fresh recipient-bound review, explicit order creation, refund handling, and recoverable tracking using the existing product and shared design system.

If no provider can supply that route, report the blocker to the owner. An operator-controlled payout service would introduce temporary funds control, spend-key operation, funding and security obligations. It is outside the current approved scope; do not build it without a separate architecture/business decision.

Publication and funded testing remain subject to separate explicit owner authorization.

## Sources and checked endpoints

- https://zechub.wiki/using-zcash/solana-zec-to-shielded
- https://docs.near-intents.org/resources/chain-support
- https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart/making-a-request
- https://1click.chaindefuser.com/v0/tokens
- https://docs.houdiniswap.com/developer-hub/swap-flows/private-swap
- https://docs.houdiniswap.com/developer-hub/core-concepts/tokens-networks
- https://docs.houdiniswap.com/api-reference/reference-data/get-token-by-id
- https://docs.houdiniswap.com/api-reference/private-and-standard-swaps/get-quotes-by-token-address
- Houdini v2 authenticated GET token-detail and quote endpoints, called through the existing application request library; credentials were not displayed.
- Existing app read-only source/destination token search endpoints.
- https://z.cash/ecosystem/flyp-me/
- https://flyp.me/en/api/
- https://flyp.me/api/v1/currencies
