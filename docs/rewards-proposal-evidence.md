# Rewards proposal: evidence and approval boundary

Research date: 2026-10-01. This is a proposal, not final launch-ready tokenomics.
The public proposal and its summary share editorial content in
`artifacts/solana-privacy-swap/src/components/rewards-proposal.ts`, rendered by
`terminal-economics.tsx` and `loyalty-explainer.tsx`.
Nothing in that module is an execution configuration.

## What was checked

Only public documentation and read-only endpoints were used. No mint was created,
wallet connected, message signed, quote funded, fee claimed or payout sent.
No account-points, database, treasury or provider integration logic was changed.

| Question | Evidence and result | Confidence / launch consequence |
| --- | --- | --- |
| Current launch mode | [Developer docs](https://www.stonkfun.xyz/developers), [stats](https://www.stonkfun.xyz/api/public/v1/stats): LaunchLab enabled; paid-launch path disabled at the time of the read. Reward mode uses Token-2022 transfer fees and has no creator-fee position. | Current public description; recheck at launch. Do not import standard-mode creator splits into reward-mode accounting. |
| Threshold and operating deduction | Search-indexed StonkFun BUDDY, TCAT and BASECAT token-page text described holdings of at least $20 at distribution; BUDDY described approximately 2.5% operating/distribution costs. Direct page fetches on this date did **not** reproduce those paragraphs. | Corroborated indexed wording, **not independently confirmed current provider configuration**. The proposal retains ≥ $20; activation requires written/current machine-readable confirmation, including exact deduction base. |
| Price timing and feed | [Rewards disclaimer](https://www.stonkfun.xyz/rewards-disclaimer) measures eligibility at each distribution and warns that displayed historical payouts are valued at current prices. No named eligibility feed, freshness limit or rounding method was exposed by the checked pages/stats. | Distribution-time provider evidence is authoritative. No invented oracle, no launch-price substitution, no confirmed eligibility display until evidence exists. |
| Reward asset and cadence | [Rewards](https://www.stonkfun.xyz/rewards) and disclaimer: pro-rata quote-token distributions, possible base-token distributions when platform holdings are large, accumulation until worthwhile, pausable/discretionary rather than a fixed cadence. | Do not promise native NEAR or deterministic recurring payments. |
| Supply, decimals, rates and collector | [SOL LaunchLab pricing read](https://www.stonkfun.xyz/api/public/v1/launchlab/pricing?quoteMint=So11111111111111111111111111111111111111112), generated 2026-10-01T00:33:37.763Z: 6 decimals, raw supply 1000000000000000, rates 100/300 bps, Token-2022 base program, provider withhold authority `5KXDF6QnqhBj72hDtJNkkpFaQVUfbFXNybMsp3DiK6tD`. Developer builder example uses maximum raw fee 1000000000000000. | An example configuration, **not an existing $DARK mint inspection**. Intended quote pair must be rechecked; publish active and scheduled settings and all authority controls before launch. |
| Venue support | Developer docs specify LaunchLab initialization and migration to Raydium CPMM; provider adoption depends on matching its launch shape. A mismatched reward mint can collect taxes without distribution. | Required support path, not proof of exact-mint wallet, aggregator, exchange or bridge support. No live creation for verification in this task. |
| Transfer semantics | [Solana transfer-fee docs](https://solana.com/docs/tokens/extensions/transfer-fees): recipient-side withholding, dedicated harvesting/withdrawal instructions, separate fee-config and withdrawal powers. | Fee is in the transferred token, not automatic NEAR conversion; requires explicit cap and authority inspection. |
| NEAR / ZEC representation | [Launchable pairs](https://www.stonkfun.xyz/api/public/v1/pairs?launchable=true&launchLabReady=true): NEAR quote mint `3ZLekZYq2qkZiSpnSvabjit34tUkjSwD1JFuW9as9wBG` (9 decimals), ZEC quote mint `A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS` (8 decimals), both classic SPL on Solana. | Catalog identities only. Their backing/redemption and compatibility with native-coin conversion were not proven. Never conflate a ticker with native coin. |
| Zcash network/address support | [NEAR Intents supported chains](https://docs.near-intents.org/resources/chain-support.md): Zcash partially supported, transparent t1/t3 only. [Zcash explanation](https://z.cash/learn/what-is-the-difference-between-shielded-and-transparent-zcash/): transparent transactions expose financial information. | Initial proposal explicitly uses native mainnet ZEC with transparent settlement consent, not shielded delivery. Actual exact-asset quotes and settlement are still launch evidence requirements. |

The StonkFun terms checked on the developer page were dated September 18, 2026;
they describe discretionary distributions and restrictions including the US,
Canada and UK. This is a legal-review gate, not a determination of eligibility
for any particular user or jurisdiction.

## Proposal choices, not external facts

The owner authorized resolving the draft as a proposal. The following are
design choices awaiting separate approval, not provider guarantees:

- Net, deduplicated team-holder receipts split equally into terminal reserves
  and a segregated loyalty budget. Public-holder earnings and customer assets
  are not a funding source. No fixed supply target or stream share.
- Receipt accounting is cash/settlement based, not an accrual forecast. Unproven
  staking attribution and reward-mode creator fees contribute zero.
- Seven 12-hour snapshots spanning a full 72 hours, explicit UTC boundaries,
  per-wallet custody exclusions, unknown-data handling and signed registration.
- Weekly balance-weighted distribution with proposed 1/2/3/4 progression,
  capped at 4. These multipliers have **not** been approved for launch.
- A 10% loyalty contingency, explicit quote/slippage/cost limits, beneficiary
  reservations for uneconomic or failed payments and no unfunded promises.
- Public native-ZEC delivery as the initial proposal, with no substitution of
  wrapped assets or silent Unified Address extraction.

The complete boundaries, formulas and failure policies are user-visible under
`/terminal-preview#rewards-proposal`; the landing explainer links there.
No numerical protocol stream share can honestly be confirmed before actual
eligible balances and provider exclusions exist. Its proposed calculation is
defined instead. No mint address can be finalized without a separately
authorized launch; the current identity status is explicitly “not designated.”

## Separate approval required before execution

1. Approve or revise the proposal and obtain legal/security review.
2. Obtain current provider evidence for threshold, price policy, deductions,
   exclusions, authority controls and staking attribution, if any.
3. Designate and independently inspect the official mint and exact supported
   venues without relying on a symbol search.
4. Under explicitly approved test scope, prove collection, asset redemption,
   NEAR settlement, native-ZEC output, refunds and payout reconciliation.
5. Implement reviewed registration, historical snapshots and payment accounting
   separately; existing wallet-streak work is not implemented by this proposal.