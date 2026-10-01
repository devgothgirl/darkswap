# NEAR volume capture pilot — internal decision brief

**Research and decision date: October 1, 2026 (UTC). Internal planning only; not approved for publication or execution.**

## 1. Decision in brief

**Recommend a gated integrator/distribution experiment, not solver operation.** Start with experienced, self-custodial Solana USDC holders who already need to move $100–$2,000 to an existing account on another chain. Test a clear quote-review/manual-deposit experience against alternatives on delivered value and support, not a presumed privacy premium.

Prioritize **Solana USDC → Base native USDC**; keep **Solana USDC → Arbitrum native USDC** and **Solana USDC → native NEAR on NEAR** as two backups. These are research candidates, **not verified executable routes**. Advance only one corridor initially. Do not recruit people to trade merely to generate volume.

**Current decision: GO for owner review of this specification; HOLD funding, fee activation, outreach and acquisition spending.** Required evidence is missing: account-specific commercial terms, competitive current route quotes, funded destination settlement, interrupted-order recovery, support readiness and settled commissions. Missing revenue evidence is unknown revenue, not zero revenue; missing costs are not zero costs.

Use community education and ordinary links to the existing Privacy swap page first. Do not build a public API, widget, bot, embedded wallet or solver. Solver operation adds inventory, execution, hedging and capital risks before reachable demand or integrator margins are demonstrated.

### Work boundary

This review read source and public provider/organization pages. It did not access provider accounts, production records, secrets or private statements; request quotes; create/fund orders; contact anyone; change accounts, application code, UI, fees or gates; deploy; spend money; or publish promotional claims. No transaction identities or financial evidence are stored here. All budgets, rates, targets and schedules below are proposals.

## 2. Evidence: what exists and what it does not prove

Labels used throughout: **I** = confirmed in current implementation; **D** = official documentation/publisher statement, not an account test; **H** = hypothesis or proposed decision; **U** = unresolved.

| Evidence | Finding | Limit |
| --- | --- | --- |
| **I — request and funding** | `near.ts` builds `EXACT_INPUT`, `ORIGIN_CHAIN` deposit/refund, `DESTINATION_CHAIN` recipient, `confidentiality: basic`, 100-bps slippage tolerance and a 30-minute request deadline. Dry preview precedes instruction-only order creation; users send manually. Requests omit `appFees`. | No funded settlement or company commission demonstrated. The 1% slippage tolerance is not a fee or a resting limit price. |
| **I — scope/minimum** | Solana-only source; destination allowlist: Solana, NEAR, Ethereum, Arbitrum, Base, Optimism, Polygon, BNB Chain. $3 input-value floor; provider may require more. Missing usable price blocks a quote. | Eight allowed networks are not eight proven routes. Price retrieval/cache time does not prove market-price freshness. |
| **I — review/tracking** | `near-swap.tsx` shows estimated/minimum output and available withdrawal/refund fees; browser previews last at most 45 seconds. `near-order.tsx` polls provider status and hides funding instructions for unavailable, expired, funded or closed orders. Saved receipts and bounded provider-history matching exist. | Code and a provider `SUCCESS` label alone do not establish receipt of destination assets or fee settlement. Production recovery entitlement remains unverified. |
| **I — public engagement** | `analytics.ts` allows static navigation events such as `swap_entry_clicked`; its guard excludes financial/user-input properties. | Clicks are not orders, unique customers, completed volume or income. It does not implement a corridor conversion funnel. |
| **I — existing identity choices** | Optional rewards enrollment and per-order linkage exist; guest orders remain possible. | Do not reuse rewards emails or account/order links for pilot attribution, repeat-use measurement or marketing. |
| **D — confidential mode** | Official foreign-to-foreign guidance documents the same `basic` parameter without requiring embedded balances or signed-intent execution [S3]. | Provider privacy language is not independent proof. Public origin deposits and potentially public destination transfers, timing, amounts and provider records remain relevant. No anonymity, unlinkability, shielding or guaranteed settlement claim. |
| **D/U — recovery access** | Authentication docs distinguish the partner JWT from user-session authorization for private account balances/history [S4]. Code uses a partner key for `/account/history`. | Do not infer either entitlement or incompatibility from docs alone. Task #15 must confirm the appropriate history surface, permissions and safe interrupted-order behavior for this integration. Do not add user wallet signatures to bypass this gate. |
| **U — economics** | Account commissions, fee permissions, effective shares, recipient ownership, collection/withdrawal behavior and net receipts are unknown. | Absence of `appFees` does not rule out an external agreement. Public fee schedules cannot prove one. |

Source inspection: `artifacts/api-server/src/routes/near.ts`; `artifacts/api-server/src/lib/swap-minimum.ts`; `artifacts/solana-privacy-swap/src/pages/near-swap.tsx`, `near-order.tsx`, `docs-route-economics.tsx`; `artifacts/solana-privacy-swap/src/lib/analytics.ts`; `README.md`; [existing rebate readiness](swap-rebate-readiness.md). README “live beta” describes exposed flows, not fresh production settlement verification. Existing user-facing Docs remain owned by Task #76.

## 3. Addressable opportunity: dated claims, not a market-share forecast

The assignment refers to user-supplied network-volume, chain-count and limit-launch claims but supplies no original figures, links or reporting periods. **Those specific assertions remain unverified.** The following independently located official statements are context, not retroactive validation of an unspecified claim.

| Source/reporting date | Official statement or retrieved display | Definition and qualification |
| --- | --- | --- |
| March 6, 2026, NEAR guide [S6] | $14B+ cross-chain Intents volume; 35+ chains | Publisher-reported ecosystem execution, not DarkSwap volume or NEAR base-chain DEX volume. No independently reconciled methodology here. |
| July 7, 2026, Confidential Intents GA [S7] | Over $22B cross-chain volume; over $1.5B cumulative ZEC volume | Network total and asset-specific cumulative turnover are different measures. Neither is total confidential volume. The article's roughly 42% confidential-volume share applies to **near.com**, not the entire network; over $30M confidential balances is a stock, not trading turnover. |
| July 8, 2026, Q2 report [S8] | $20B+ cumulative Intents volume; near.com $209M+ trailing-30-day volume as of June 11 | Different periods/products and rounded thresholds. Do not subtract the July headlines to infer daily growth or add near.com volume to network volume. |
| October 1, 2026 retrieval, official Explorer [S9] | Approximately $30.581B all-time, $118.448M 24h, $796.613M 7d, $3.450B 30d | Mutable publisher displays at retrieval, not an audited October 1 close. Display did not establish a complete inclusion, deduplication or USD-valuation methodology. Overlapping windows cannot be summed. |
| October 1 retrieval, official Intents homepage [S10] | $30B+ across 35 chains | High-level marketing aggregate. Not 35 verified DarkSwap destinations or any-pair execution support. Current chain-support docs explicitly include Solana, Base, Arbitrum and NEAR [S5]; selected asset pairs still require current token identity and quote checks. |
| February 24, 2026 announcement [S11] | Confidential transfers/deposits/withdrawals, with swaps described as coming soon | Not proof confidential swaps or limit orders were live then. |
| July 7 GA [S7]; official changelog [S12] | GA announcement July 7; B2B confidential launch recorded July 13; confidential swap limit orders recorded August 28 | Distinct announcements/milestones. The changelog's July 13 near.com perpetual limit orders are a separate product. No inferred confidential-limit launch volume or adoption figure. |

**Limit-order distinction:** official `/v0/orders` documentation describes a separate limit-order resource within 1Click, with price, quantity, side, partial fills, cancellation and default seven-day expiry [S13]. It is confidential and separate from near.com perpetuals. DarkSwap's immediate exact-input quote flow does not implement this lifecycle. Public documentation is not DarkSwap account authorization. Do not market limit orders or justify this pilot using their alleged adoption.

**Reachable demand is unknown.** Total network turnover includes other origins, frontends, assets and possibly activity inaccessible to this product. Do not apply an arbitrary capture percentage to $3.450B or $30.581B. A bottom-up learning target could be 200 relevant page visits × 10% funded-order incidence × $500 average completed input = $10,000, but every factor is an unverified hypothesis; visits are not unique people and that multiplication is not a forecast. Establish actual order counts and values separately.

## 4. Audience and corridor selection

**One segment:** experienced Solana USDC holders with a real, near-term need to fund their own existing Base, Arbitrum or NEAR account, comfortable checking network/token identity and making an exact manual deposit. Exclude first-time wallet users, institutional execution, automated traders, speculative newly listed assets and users needing a resting limit order. Do not solicit restricted jurisdictions; provider eligibility and legal review are prerequisites.

| Candidate, priority | Why consider it (H) | Availability/minimum/delivery now | Readiness and alternatives |
| --- | --- | --- | --- |
| 1. Solana USDC → Base native USDC | Same-asset value comparison; fund an existing Base account without an in-app wallet connection. Potentially qualifying 1-bp platform minimum under documented fee policy. | Networks allowed in code/docs; exact native asset identity, quote availability, delivered amount and provider minimum **unverified**. App floor $3 is insufficient proof. | Funded settlement/support **unverified**. Compare Relay, deBridge and Mayan where each supports this exact route; do not compare raw infrastructure against a retail app. |
| 2. Solana USDC → Arbitrum native USDC | Same user need and stablecoin comparison; backup if Base is uncompetitive. | Same unknowns; never substitute bridged USDC merely because the ticker matches. | Funded settlement/support **unverified**. Same alternative shortlist, each requiring its own availability and all-in quote check. |
| 3. Solana USDC → native NEAR on NEAR | Fund an existing NEAR account for actual ecosystem use; destination community may supply distribution. | Cross-asset price exposure; qualifying stablecoin fee treatment **not assumed**. Token, quote, minimum and delivered amount **unverified**. | Funded settlement/support **unverified**. Compare the official NEAR Intents frontend and DarkSwap's separate existing private route where an equivalent quote exists. Shared provider infrastructure is not independent execution redundancy. |

Do not broaden beyond these three during the pilot. If none passes, stop rather than add attractive but unsupported corridors.

### Comparable quote scorecard — proposed next evidence collection

No scorecard values were collected by this task. An authorized operator should record only redacted/aggregate results outside raw financial evidence:

1. Verify exact source/destination token identity and native/bridged representation against current catalogs and issuer/provider documentation. Check destination account readiness, gas needed for later use, refund compatibility and regional eligibility.
2. Test dry quotes for $100, $500 and $2,000 equivalent inputs, at three separated UTC time windows on each of two days: **18 attempts per corridor**. Use identical gross input, destination asset, comparable slippage (current DarkSwap setting 1%), timing within 60 seconds and comparable delivery mode. If quotes expire before comparison, repeat; do not treat stale quotes as executable.
3. Record availability, quote lifetime, exact input, estimated output, minimum output, fee inclusion, origin wallet gas, withdrawal fees, possible refund fee, expected time, provider minimum/maximum and support policy. Mark unknown costs unknown. Never double-subtract withdrawal/app fees already included in output.
4. Rank on **usable destination units for the same total customer outlay**. Compare native-USDC units for stablecoin corridors; for NEAR use synchronized destination prices and both unit and USD views. Include origin gas and any necessary post-delivery account/gas costs separately. Input/output differences are not automatically fees. Report lower-bound minimum output alongside estimates.
5. Suggested eligibility: at least 17/18 valid dry quotes; no unresolved asset/fee/minimum ambiguity; median delivered-value shortfall no more than 20 bps versus the best genuinely executable comparator, and no more than 50 bps on at least 90% of paired observations. Missing comparators mean “not demonstrated,” not a win. These are proposed tolerances, not performance claims.
6. Dry quotes can shortlist a corridor, never clear it for customer funding. Before distribution, require funded acceptance tests and support/recovery gates below. Use the same scorecard again with any proposed fee included; a previously competitive no-app-fee quote does not prove a fee-bearing quote competitive.

## 5. Commercial model and unresolved account questions

### Documented mechanism (D), not an enabled policy

Official fee configuration and fee schedule fetched October 1 [S1–S2]:

- `appFees` entries specify a supported NEAR-format recipient and integer fee in basis points, deducted from input for exact-input swaps. One basis point is 0.01%. The combined fee after provider additions is capped at 500 bps.
- With a partner API key and no app fee, published default platform fee is 20 bps, reduced to 1 bp for qualifying USDC/USDT/DAI pairs or same-asset multichain transfers. This provider charge is **not DarkSwap commission**.
- With an API key and app fees, documented generic policy divides the submitted fee 50/50, but the provider's half has a 20-bps minimum, or 1 bp on qualifying routes. Partner-specific configuration can differ.
- For submitted 10/20/30 bps on a **qualifying stablecoin route**, generic provider/integrator shares are 5/5, 10/10 and 15/15 bps. On a **normal cross-asset route**, provider minimum instead produces total charged platform/app components of 25/30/35 bps: integrator gets 5/10/15; provider gets 20. These are not all-in customer costs.
- Published protocol fee is 0.0001% (**0.01 bp**, not 1 bp); routing, price impact, network/withdrawal costs and possible refund charges also matter. The separately documented 0.2% near-intents.org frontend charge is not automatically an additional DarkSwap API charge.
- Docs also discuss price-improvement sharing on eligible fresh cross-asset orders. Do not recognize any of it as DarkSwap revenue without confirmation of who receives it and its accounting treatment.
- Unauthenticated requests follow a different extra-25-bps policy. Do not remove authentication to chase a headline share; fee, recovery and account consequences require provider confirmation.

### Recipient, collection and settlement prerequisites (U)

Before activation, confirm this account's written permission, effective fee policy, qualifying assets, fee base, ceilings/rounding, exclusions, applicable regions and disclosure obligations. Independently verify company control of the supported fee recipient through a restricted treasury process. A customer destination address is not a fee recipient, and a syntactically valid address does not establish ownership.

Clarify whether credits are spendable Intents balances, immediately withdrawn tokens or unpaid receivables; asset representations; claim/signing permissions; timing; minimum withdrawal; gas and conversion charges; reversals and taxes. Confirm who is responsible when fee collection or withdrawal fails. Do not place a real recipient or statement in project documents.

The docs describe optional `ANY_INPUT` fee aggregation, conversion and automatic withdrawal at a $1,000 pool threshold, indefinite collection and retry rather than refunds [S1]. That is **not** proof this account has configured it, nor a universal minimum for ordinary app-fee recipients. It would create a separate financial workflow and is **not recommended as an implicit pilot dependency**. At $100K/month and 20-bps gross fee with 50% retained, hypothetical $100 monthly integrator accrual could take roughly ten months to reach that threshold before price/cost effects; accrual is not cash.

Before any fee-bearing customer order, disclose the effective company/provider fee components, final delivered/minimum amounts, included/external costs and possible refund charges. Do not use “confidential” to imply a justified premium. Engineering must separately specify server-owned fee configuration, quote/final-term checks and recovery matching for nested fee data before implementation; simply inserting an array into today's request is not a completed fee integration.

### Eligibility and accounting

Define eligible volume as **deduplicated, verified completed customer input notional** on the approved corridor under the confirmed commission agreement. Exclude unfunded/expired previews, pending/failed/refunded/reversed orders, operator-funded tests, self/circular promotional activity, ineligible jurisdictions/assets and duplicates. Quote counts and destination output are not a second volume leg. For partial or disputed completion, exclude until policy and evidence resolve it.

Value completed inputs using a documented completion-time USD source; do not assume USDC always equals $1. Value commission accruals and actual receipts under finance's approved policy and keep timing/FX differences explicit. Keep eligible completed volume, earned commission, outstanding receivable, received commission and operating contribution separate. Task #41 owns reconciliation and any later rebate budget; no rebates or token payouts are included here.

## 6. Gross-to-net sensitivity — illustrative, not approved fees or a forecast

Define `V` = monthly eligible completed input USD; `t` = submitted gross fee-pool hypothesis (10/20/30 bps); `G = V × t / 10,000`. **G is not DarkSwap income.** Tables assume a qualifying stablecoin corridor under the documented generic 50/50 policy, so provider share `P = 0.50G`, integrator accrual `D = G − P`.

For illustration only: distribution partner compensation `K = 20% × D`; average completed order $1,000; allocated support $0.25/order (`S = V/1,000 × $0.25`); collection/conversion/network allowance `W = V × 1 bp`; fixed monthly company allocation `F = $300`. These are **test inputs**, not measured costs or offered partner terms. Compensation would be payable only after settlement and review, without identifying referred users.

`Modeled contribution subtotal = G − P − K − S − W − F`.

| Eligible V / month | Gross t | G fee pool | P provider | D integrator accrual | K distribution | S support | W collection allowance | F fixed | Contribution subtotal |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| $100,000 | 10 bps | $100 | $50 | $50 | $10 | $25 | $10 | $300 | **−$295** |
| $100,000 | 20 bps | $200 | $100 | $100 | $20 | $25 | $10 | $300 | **−$255** |
| $100,000 | 30 bps | $300 | $150 | $150 | $30 | $25 | $10 | $300 | **−$215** |
| $1,000,000 | 10 bps | $1,000 | $500 | $500 | $100 | $250 | $100 | $300 | **−$250** |
| $1,000,000 | 20 bps | $2,000 | $1,000 | $1,000 | $200 | $250 | $100 | $300 | **$150** |
| $1,000,000 | 30 bps | $3,000 | $1,500 | $1,500 | $300 | $250 | $100 | $300 | **$550** |
| $10,000,000 | 10 bps | $10,000 | $5,000 | $5,000 | $1,000 | $2,500 | $1,000 | $300 | **$200** |
| $10,000,000 | 20 bps | $20,000 | $10,000 | $10,000 | $2,000 | $2,500 | $1,000 | $300 | **$4,200** |
| $10,000,000 | 30 bps | $30,000 | $15,000 | $15,000 | $3,000 | $2,500 | $1,000 | $300 | **$8,200** |

**These subtotals are not net profit or cash received.** Additional acquisition expense `A`, engineering/founder labor not covered by F, legal/compliance, taxes, refunds/clawbacks, reserves and actual provider charges remain **unknown**. Full economic result is subtotal minus those incremental costs, adjusted for actual terms; unknown material inputs block a profitability conclusion. The $300 allocation and $0.25 support assumption are intentionally visible and may badly understate costs.

- Before unknowns, variable contribution is 0.5/4.5/8.5 bps at 10/20/30-bps gross fees. Illustrative break-even V for $300 fixed cost is $6M / ~$666,667 / ~$352,941 respectively; real break-even is higher with positive additional costs.
- $500 paid acquisition would turn the $1M/20-bps $150 subtotal into **−$350**, before other unknowns.
- A stress case at $1M and 20 bps, with provider retaining 70%, partner taking 30% of the remaining share, $250 average order, $1 support/order, 1-bp collection allowance and $300 fixed, yields `$2,000 − $1,400 − $180 − $4,000 − $100 − $300 = −$3,980`, before unknowns. The 70% provider share is a stress assumption, not documented account policy.
- On USDC → NEAR, 10/20/30 submitted bps can cost the customer 25/30/35 bps under the normal provider floor. The integrator still gets only 5/10/15 bps. Do not fit that corridor into the stablecoin gross-pool table without modeling the extra provider charge and its effect on quote competitiveness.
- Actual distributable cash: **verified company receipts − provider amounts still payable − partner obligations − company cash costs − reversals/taxes/reserves**. Never subtract provider deductions twice when receipts are already net. Unsettled balances/receivables cannot fund acquisition. A delay can make cash contribution negative even with positive modeled accrual.

## 7. Unsent partner inquiry

**Draft only. No message sent; recipient selection and outreach require owner approval.** Proposed channel: official NEAR Intents Partner Portal, not an assumed personal contact.

**Subject: DarkSwap — Solana-origin 1Click distribution pilot and fee eligibility**

> We are assessing a small, gated distribution pilot for an existing Solana-origin, exact-input manual-deposit interface requesting basic confidential handling. Our current requests omit appFees. We are not claiming funded production settlement, verified fee receipts or limit-order entitlement.
>
> Please confirm through an authorized private channel:
>
> 1. For our integration, are app fees permitted, under which legal entity/terms/regions, and is any commission already attributable without appFees? What is the effective share, fee base, minimum, cap, rounding and stablecoin/same-asset classification? Does basic confidentiality change eligibility or cost? How is price improvement allocated?
> 2. Which recipient types and token representations are supported? What proves company control? Where do fees accrue, when are they earned, when are they withdrawable, and what gas/conversion/claim costs, minimums, settlement intervals or holds apply? Is ANY_INPUT optional, and what are its separate access and custody/operational requirements?
> 3. Which completed orders qualify? How are refunds, partial execution, reversals, exclusions and clawbacks reported? Are commission exports available with a closed reporting period and auditable settlement evidence? We will leave reconciliation to our finance owner.
> 4. Does our current partner authorization support the history lookup needed to recover an uncertain foreign-to-foreign order, or is another integrator-history interface required? How does that differ from user-session confidential account history? What are support escalation channels, service expectations and incident notifications? Our recovery owner will verify behavior separately.
> 5. What fee/disclosure language and branding are required? Are there lawful ecosystem directory, community education, referral or co-marketing opportunities for a small integrator? What are application criteria, placement terms, attribution options and any compensation obligations? We assume no listing, endorsement, grant or subsidy.
> 6. Are confidential swap limit orders separately entitled under /v0/orders, and what requirements govern access, funding, cancellation, expiry, partial fills, supported pairs and fees? Please distinguish these from near.com perpetual orders. This is discovery only, not a request to enable them.
>
> We can share restricted account references through an approved secure channel, not in public project notes. Please do not send credentials. No fee activation, account change, order creation or financial commitment is authorized by this inquiry.

## 8. Proposed 30-day gated pilot

Day numbers are **relative to owner authorization**, not a promise to launch within 30 calendar days. Gates can pause the schedule. Name actual accountable people before Day 1; role labels below are not assigned staff or evidence of coverage.

| Window / gate | Proposed actions and owner | Evidence required to advance |
| --- | --- | --- |
| Days 1–5 — G0 commercial/eligibility | Business owner reviews/sends the inquiry only after approval; finance confirms account economics and recipient process; legal/privacy owner reviews regions, disclosures and evidence handling. Engineering prepares the dry-quote scorecard. | Written effective terms or explicit unresolved list; no secret/identity copied into notes. If no viable collection path, stop monetized pilot and keep research-only. |
| Days 6–10 — G1 route/readiness | Engineering/operator completes scorecard, selects at most one corridor; recovery owner completes Task #15; support owner confirms inbox/escalation and operating hours. Reuse price-freshness and support tasks rather than bypass them. | Competitive quotes, exact assets/minimums, fresh valuation, reviewed funding/recovery runbook, sufficient provider access, named support coverage. No funded test while recovery/support gate is unresolved. |
| Days 11–15 — G2 controlled verification | Only under a **separate explicitly approved test plan**, operator performs up to three small, legitimate company-controlled funding tests across at least two days for the chosen corridor. Engineering verifies final-term review and safe status handling; finance hands evidence to Task #41. | Destination receipt corroborates provider completion; no duplicate deposit/order after interruption; controlled recovery behavior verified; approved support escalation works. Test failure/uncertainty stops further funding. Fee activation additionally requires separately implemented/reviewed fee controls and evidence of fee collection/withdrawal; this brief authorizes none. |
| Days 16–23 — G3 small organic distribution | After G0–G2, growth owner may ask one approved community to share a route-specific guide and ordinary deep-link; add a second only if first passes support/quote checks. No paid ads initially. | Permission for placement; approved honest copy; existing privacy-safe engagement reporting; support available throughout invited use. Maintain a daily corridor/incident check. No acquisition while fee-settlement evidence is missing. |
| Days 24–30 — G4 evaluate | Finance supplies aggregate settled commission/cost conclusions via Task #41; product compares availability/delivery/support with alternatives; growth summarizes placements and static engagement. | Decision memo: stop, extend evidence collection without spending, or approve one tightly scoped implementation. If settlement period has not closed, result is **inconclusive/hold**, not success. |

### Funding, fee and spend approvals are distinct

- **Funding tests:** recovery access and interrupted-order safety cleared under Task #15; provider/asset/address compatibility, source-price freshness, final fee/minimum terms and destination account readiness checked; support escalation verified; written operator authority, risk cap and stop procedure. Never induce an uncontrolled failure with real customer funds.
- **Fee activation:** written account terms and supported controlled recipient; approved legal disclosure; separately approved engineering change with server-side fee bounds, preview/final-order comparison and recovery consistency; limited collection/withdrawal verification; finance acceptance. Authenticated quotes alone cannot clear this gate.
- **Acquisition:** satisfactory funded settlement and recovery, actual settled fee evidence, usable company funds, completed privacy/support review, competitive fee-inclusive quotes and written channel/budget approval. No assumption of fee-free trials being monetized retroactively.

### Budget decisions (H; approved spend today: $0)

Propose a **maximum $500 incremental cash envelope** only if the owner signs off: up to $100 reusable test principal exposure, $50 test fees/loss allowance, $150 education/community placement expense and $200 incremental support/contingency. Test principal is capital at risk, not revenue or automatically an expense; losses count against the envelope. No top-ups without approval. Paid ads, referral bounties and rebates remain $0; the model's partner percentage is not a promised payment.

Approve staff allocation separately: suggested ceiling 12 engineering/operator hours, 8 growth/content hours and 8 finance/support hours, each valued at an approved rate before judging economics. Incremental pilot cash and monthly model allocations overlap where they cover the same cost: reconcile once, do not double-count or treat them as different free budgets. A $500 learning budget is not justified by the small-volume revenue table; owner must explicitly accept a bounded research loss.

### Stop/go rules

- **Immediate pause:** uncertain funded order, duplicate funding risk, unresolved receipt discrepancy, unverifiable fee recipient, unexpected fee, stale price/minimum evidence, asset mismatch, unavailable support, privacy leak or unapproved spend. Do not advise a replacement deposit to resolve uncertainty.
- **Operational advance:** G1 quote thresholds plus three successful controlled tests with verified destination receipts; no unresolved recovery or support incidents. Tests are excluded from acquisition volume/revenue evidence.
- **Organic learning targets:** two authorized placements at most; 200 relevant landing visits where existing analytics can safely establish that aggregate; 20 verified completed customer orders and $10,000 eligible volume; at least 95% completed among funded orders, with pending included in the denominator at cutoff. Low sample sizes cannot establish a production SLA. Record all failures/refunds separately.
- **Service target:** staffed acknowledgement within two hours during stated pilot hours; escalate overdue processing using a provider-agreed corridor threshold, not a universal settlement promise. Suspend invitations outside staffed coverage or when a funded case remains unresolved.
- **Commercial GO for further work:** finance verifies settled commissions and all material costs for a closed cohort/period; contribution before discretionary paid acquisition is positive and conservative downside remains acceptable; no unresolved fee/settlement differences. Positive modeled table cells do not meet this condition.
- **Paid acquisition stays off** unless a separate approval limits spend to at most 25% of verified positive, unrestricted post-cost/post-reserve contribution. Unknown economics or nonpositive contribution means no paid acquisition. Without private, approved attribution, do not claim channel ROAS or customer acquisition cost.
- **Day-30 decision:** all safety gates plus meaningful demand and economic evidence → consider a bounded next build. Too few observations or unclosed settlement → evidence insufficient; extend only with a newly approved cap, never automatic renewal. Uncompetitive routes, continuing loss after measured costs or unresolved safety issues → stop.

## 9. Measurement without new customer linkage

| Layer | Proposed aggregate measure and evidence | Explicit boundary |
| --- | --- | --- |
| Public engagement | Existing static page/navigation counts, approved placement dates and guide views when already available. Optional community-provided aggregate reach. | Not unique traders or revenue. Do not add pixels, wallet fingerprints, order/amount properties, per-user referral tags or tracking IDs. Direct deep-link traffic may bypass `swap_entry_clicked`; do not invent that event's coverage. |
| Restricted operations | Deduplicated provider-confirmed funded/completed/failed/refunded/pending counts; eligible input USD; destination-receipt verification; completion-time distribution; support workload. Authorized operator produces aggregates from existing operational evidence. | Separate system/access from web analytics. No addresses, hashes, receipt IDs, precise transaction timestamps or raw exports in this repo, marketing or public dashboards. No automatic new reporting pipeline is implied. |
| Restricted finance | Eligible fee base, gross accrual, provider deductions, receivable roll-forward, actual settled company receipts, partner obligations, costs, reversals and reserves by closed period. | Task #41 owns reconciliation. Settled commissions are not the same as completed order value or gross fee pool. No inferred revenue from a quote spread. |
| Decision report | Weekly coarse corridor totals and end-of-pilot company contribution with explicit unavailable fields. Combine small cells below 10 orders or keep them restricted. | No joins to emails, rewards accounts, marketing lists, analytics sessions or public referral identities. Retain raw evidence only under the existing approved operational/accounting retention policy; agree access and retention before collection. |

No order-level channel attribution, unique-customer count, retention curve or measured repeat-use rate is available under this design. Do not hash wallets/emails and call them anonymous. Existing optional rewards association is not permission to repurpose it. Qualitative voluntary feedback can ask about route usefulness without collecting addresses/order IDs; support remains a separate purpose. Any later repeat-use study needs a separate necessity/privacy/consent decision and implementation approval.

A manually compared weekly engagement/volume trend is correlation, not a conversion funnel or proof a partner caused orders. Without individual attribution, use flat approved community compensation or negotiate aggregate terms; do not implement per-user revenue-share tracking. Check existing pageview/referrer and query-string behavior before distribution, especially because order tracking URLs can contain sensitive references; safe custom events alone do not certify the entire analytics stack.

## 10. Bounded next decision and ownership

**Next authorized deliverable should be a read-only corridor comparison and readiness scorecard, not fee code.** It should replace the unknowns in §4 without creating orders or changing accounts. Business owner separately obtains commercial answers through an approved channel.

Only if quote competitiveness, support/recovery, account economics and demand evidence support continuation should engineering scope a fee-aware review/receipt change with restricted accounting handoff. After a small funded/fee pilot proves actual settlement and acquisition usefulness, consider route-prefilled navigation if manual selection causes observed friction. Today `/near-swap` is an ordinary page link; asset-prefilled links are **not implemented**. Do not embed addresses or amounts in links.

Keep ownership intact:

- **Task #15 — Confirm NEAR order recovery is enabled for DarkSwap:** account/history entitlement and interrupted-order recovery verification.
- **Task #41 — Reconcile partner statements before approving a rebate budget:** restricted accounting reconciliation and any rebate-budget decision. This pilot neither performs reconciliation nor approves rebates.
- **Task #76 — Explain Confidential Swap Integration:** user-facing provider/fee/confidentiality documentation. Internal source analysis here is not publication.
- Existing price-freshness and support-delivery owners retain their launch checks. No duplicate recovery/reconciliation/documentation work is created.

Do not build solver infrastructure, a widget/API distribution product, a trading bot, embedded wallets or limit orders on the strength of network headlines. Each would require separate demonstrated demand, economics, authorization and safety evidence.

## Sources

All external sources below were consulted on **October 1, 2026**. Living documentation and dashboard displays can change; retrieval date is not a publication date. Official claims are attributed, not independently audited. No account-specific authority is inferred.

- **S1:** [NEAR Intents — Fee configuration](https://docs.near-intents.org/integration/distribution-channels/1click-api/fee-config), living docs.
- **S2:** [NEAR Intents — Fees](https://docs.near-intents.org/resources/fees), living docs.
- **S3:** [Confidential swap integration](https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart/confidential-swaps), living docs.
- **S4:** [API keys and user-session authentication](https://docs.near-intents.org/integration/distribution-channels/1click-api/authentication), living docs.
- **S5:** [Supported chains/address formats](https://docs.near-intents.org/resources/chain-support), living docs, not an execution matrix.
- **S6:** [What is NEAR Protocol?](https://www.near.org/blog/what-is-near-protocol), March 6, 2026.
- **S7:** [General availability of Confidential Intents](https://www.near.org/blog/announcing-general-availability-of-confidential-intents), July 7, 2026.
- **S8:** [State of NEAR Q2 2026](https://www.near.org/blog/the-state-of-near-q-2-2026), July 8, 2026; near.com 30-day metric dated June 11.
- **S9:** [NEAR Intents Explorer](https://explorer.near-intents.org/), mutable all-time/24h/7d/30d displays.
- **S10:** [NEAR Intents homepage](https://intents.near.org/), mutable summary.
- **S11:** [Confidential Intents announcement](https://www.near.org/blog/confidential-intents), February 24, 2026.
- **S12:** [Official changelog](https://docs.near-intents.org/changelog/overview), dated milestones.
- **S13:** [1Click limit orders](https://docs.near-intents.org/integration/distribution-channels/1click-api/orders), separate resource/lifecycle.
- **S14:** [Swap types](https://docs.near-intents.org/integration/distribution-channels/1click-api/swap-types), exact-input versus other types.
- **S15:** [1Click overview](https://docs.near-intents.org/integration/distribution-channels/1click-api/about-1click-api), provider routing/settlement description.

Distribution-candidate and comparator sources are recorded in the companion [distribution shortlist](near-pilot-distribution-shortlist.md); they establish public identity/product context only, not partnerships or route readiness.