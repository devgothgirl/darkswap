# Swap rebate readiness — read-only review

Review date: September 28, 2026.

## Decision

**Do not offer or accrue rebates on either route. The currently supportable rebate budget is $0.** Actual revenue is unknown, not demonstrated to be zero. Missing evidence must not be treated as a zero cost, an earned commission, or permission to pay rewards.

This review inspected application requests, operational schemas, existing economics documentation, and workspace evidence availability. No account-specific signed agreement, commission statement, settlement receipt, cost ledger, refund statement, or financial reconciliation was located in the available materials. File/path inspection of uploads and exports found no identified financial evidence; it is not a forensic audit of every archive. No partner portal, external accounting system, or production transaction data was accessed. Public fee schedules were not refreshed in this review and cannot establish this account's terms.

No application configuration or partner account was changed. No quote or order was created, no funds moved, and no appFees, points, reward accrual, or payouts were enabled. This document is the only deliverable; operational data and transaction identities are not copied here.

## Evidence by route

| Evidence | Existing private route (Houdini) | Privacy swap (NEAR Intents 1Click) |
| --- | --- | --- |
| Request configuration verified in code | Requests private quotes; exchange creation submits quote and destination information. No explicit DarkSwap commission configuration is visible in those requests. Account-side arrangements remain unknown. | Dry and executable quote requests omit `appFees`. This establishes request behavior, not whether an external account arrangement pays revenue. |
| Account-specific agreement and rebate permission | **Unverified** | **Unverified** |
| Collected DarkSwap commissions and settlement timing | **Unverified** | **Unverified** |
| Provider share, deductions, minimum payout and clawbacks | **Unverified** | **Unverified** |
| Actual operating, execution and payout costs borne by DarkSwap | **Unverified** | **Unverified** |
| Refunds, reversals, liabilities and adequate reserves | **Unverified** | **Unverified** |
| Received net revenue and sustainable positive margin | **Unverified** | **Unverified** |
| Currently supportable rebate allocation | **$0** | **$0** |

Primary code references:

- `artifacts/api-server/src/routes/near.ts`: `quoteBody`, quote/order creation, refund/withdrawal fee presentation, status and receipt recovery.
- `artifacts/api-server/src/routes/swap.ts`: private quote requests, exchange creation and order recovery.
- `artifacts/api-server/src/lib/houdini.ts`: provider quote types and request serialization; a quoted `feeUsd` is not a DarkSwap commission receipt.
- `lib/db/src/schema/near-orders.ts` and `lib/db/src/schema/private-swap-order-claims.ts`: operational receipts and recovery state, not a financial ledger.
- `artifacts/solana-privacy-swap/src/pages/docs-route-economics.tsx`: published fee context and existing no-rewards disclosure.

The $3 minimum is an input threshold, not revenue. The NEAR 1% slippage tolerance is not a fixed fee. Provider fees, network charges, withdrawal/refund estimates and input/output differences are not automatically DarkSwap income. Customer deposits, swap volume, destination proceeds, successful order status and deposit-instruction receipts are not commission settlement evidence. Generic terms for another provider (such as OKX) cannot establish either route's economics.

## Evidence required to change the decision

Obtain the following separately for each route through an authorized, access-controlled channel, not a public project note:

1. Effective account-specific agreement or written provider confirmation: legal counterparty and applicable account, commission basis, fee owner, provider split, exclusions, payout asset and timing, thresholds, offsets, refunds/clawbacks, termination rights, and explicit permission for customer incentives. Confirm applicable legal, tax, sanctions and geographic restrictions with qualified advisers.
2. A defined closed reporting period and provider commission/settlement statement. Reconcile eligible completed orders privately to gross earned commission, provider deductions, actual amounts received into a verified company-controlled treasury, outstanding receivables, refunds and reversals. An unsigned screenshot, API key, quoted rate or successful swap alone is insufficient.
3. Actual invoices and records for costs borne by DarkSwap: infrastructure, provider/API access, support allocation, network/claim/payout costs, conversion costs and applicable taxes. Separate customer-paid charges from company expenses; do not double-count provider shares already withheld from received settlements.
4. Reconciliation of opening/closing unpaid commissions and rebate liabilities, plus a defensible reserve for delayed reversals, refund exposure and cost volatility. Resolve unexplained differences before budgeting. Retain restricted supporting evidence and publish only aggregate conclusions.

## Sustainable capped budget rule (proposal, not enabled)

Calculate in a single documented accounting currency, using documented receipt-time valuations and conservative valuations for liquid funds. For a closed period and each route:

`N = settled company commission receipts - provider amounts still payable - company-borne costs - refunds/reversals not already netted - taxes/liabilities - reserve top-up`

Provider deductions already withheld from receipts must not be subtracted twice. Exclude unsettled receivables, promotional projections, customer principal and restricted funds. Subtract a cost or refund once, with an auditable attribution; unknown material components block approval.

Only after positive margins and usable funds are verified:

`new budget <= max(0, min(approved fixed period cap, approved fraction × max(0, N), unrestricted funds after existing commitments))`

The fraction, fixed cap, per-claim cap, claimant-period cap, minimum economic payout and reserve policy all require explicit approval; none is approved here. Allocate no cross-route subsidy by default. Count accrued but unpaid claims against available funds and caps. Stop new accrual when evidence is stale, net margin is nonpositive, reconciliation fails or reserves/caps are exhausted. Do not promise a fixed yield or perpetual rebate. Stress-test low volume, adverse asset prices, higher payout costs and delayed clawbacks before any launch.

## Eligibility and abuse prerequisites (not an implementation)

- Publish program dates, supported routes/assets/jurisdictions, rate basis, caps, claim expiry, payout timing and dispute process before eligible activity. Do not imply historical swaps already earned rewards.
- Require provider-confirmed completion **and** associated settled company commission, followed by the approved refund/clawback hold. Exclude failed, pending, refunded, reversed, self-funded promotional and otherwise ineligible orders.
- Enforce one claim per eligible economic event, atomic cap reservations and idempotent accrual/payment. Repeated callbacks, retries and lost payout responses must not pay twice. Existing order-creation deduplication does not establish reward deduplication.
- Define review and exclusion rules for self-trading, circular swaps, wash volume, related-party activity, Sybil/split claims and coordinated farming. A wallet is not a unique person; wallet-only caps are insufficient. Design proportionate checks without promising perfect detection or collecting unnecessary identity data.
- Ensure the reward never makes an otherwise loss-making loop profitable after all costs. Provide a documented appeal process and audit controls for manual adjustments; do not silently change already published obligations.

## Privacy prerequisites

Reward claims can link a deposit, destination, reward wallet, timing and possibly an email. Confidential provider processing does not remove those links; wallet hashes alone do not make the data anonymous.

Before collecting claims, complete a data-flow/privacy review covering legal basis, required fields, separate optional consent, restricted access, encryption, retention/deletion, provider disclosures and public-chain payout correlation. Use purpose-scoped, non-public claim references and short retention where compatible with lawful accounting and abuse requirements. Do not join claim/swap data to marketing lists or analytics identities. Keep necessary reconciliation evidence in a restricted financial system rather than code, project notes, public docs or ordinary logs.

Resolve the tension between anti-Sybil checks and privacy claims explicitly. If adequate abuse controls require identifying data, disclose the tradeoff before enrollment or do not launch. Require a separate approved implementation and verification plan before introducing any fee, points, claim or payout feature.