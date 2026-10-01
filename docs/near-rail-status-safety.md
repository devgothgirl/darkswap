# NEAR rail status safety — operator runbook

**Evidence checked: October 1, 2026 (UTC).** This concerns only DarkSwap's NEAR Intents 1Click Privacy swap rail. The public incident feed is an observation, not a route quote, order status, account entitlement, privacy certification, or settlement guarantee.

## Setup and contract

- No new secret or environment switch is required for the incident adapter. It reads the fixed public partners proxy [S1] using an unauthenticated GET, without cookies or forwarded credentials; redirects are rejected. Allow outbound HTTPS to that host. `NEAR_INTENTS_API_KEY` remains a separate server-side requirement for 1Click quotes/orders/tracking. `DATABASE_URL` remains necessary for saved previews and receipts.
- Browser callers use the same-origin `GET /api/swap/near/service-status`, optionally with `fromChain` and `toChain` (for example `sol` and `base`). This endpoint does **not** require the 1Click key. Keep `/api` proxy routing intact. The contract lives in `lib/api-spec/openapi.yaml`; do not edit generated hooks or validators manually.
- The response separates `state` (`fresh`, `stale`, `unavailable`, `invalid`), route `eligibility` (`allowed`, `paused`, `unverified`), `reason`, `sourceUrl`, nullable `lastSuccessAt`/`freshUntil`, and active versus recently resolved incidents. Incidents include scope/value, timestamps, status and computed `impact` (`matching`, `unrelated`, `unverified`). HTTP 200 alone is **not** permission to fund.
- The server shares an in-flight read and per-process cache: 30 seconds after success, 10 seconds after failure, a 60-second observation lifetime, a five-second whole-read timeout and a 256 KiB body limit. Counts, identifiers and timestamps are validated. Failure retains earlier observations only as historical context; it does not preserve permission to fund. A post-create recheck is separately bounded to at most once per five seconds per process and respects failure backoff. There is no cross-instance cache or guarantee of upstream publication freshness.
- No incident lookup changes order state or bypasses uncertain-order recovery. Public status access does not establish `/account/history` permission. Recovery entitlement remains its own release gate (Task #15).

## What the guard permits

New instruction-only orders require verified route eligibility before reservation/preview claim, including a second check after optional rewards authentication. Existing request replay, saved receipt lookup and provider tracking remain reachable while new orders are paused. Order and receipt responses attach a current `routeStatus`; they can still contain record details while funding is blocked.

Creating an order does not move funds. The create form stays on the final-order review instead of automatically advancing to deposit guidance. On the tracker, funding guidance requires **all** of:

1. A successful live order-status response fetched after this mount, no error/paused query, response age **at most 30 seconds**, `PENDING_DEPOSIT`, and a finite future deposit deadline.
2. Explicit acceptance of the exact material final terms **on this page mount**. The fingerprint includes order/asset identity, network/mint, deposit address/memo, amounts/minimum, available withdrawal/refund fees, recipient/refund address, deadline and estimate. A material change or changed lookup clears acceptance; routine status timestamps do not.
3. An independent successful route-status response fetched after this mount, at most 30 seconds old, online, non-error/non-paused, `state=fresh`, `eligibility=allowed`, and `freshUntil` still in the future.
4. No blocked, stale, unavailable, invalid or otherwise unverified `routeStatus` attached to the live order response. Attached blocked evidence vetoes an older independent allowed observation; an attached allowed field or saved receipt alone cannot authorize funding.

Queries poll every 15 seconds and revalidate on mount/focus. Offline, failed, paused or aged responses fail closed. Reload/back/receipt recovery require final-term acceptance again. While blocked, the send card/tips and deposit address/memo copy controls are withheld; expandable records can remain visible **as records, not an invitation to send**. A user's ability to manually copy visible text or send from an external wallet cannot be prevented by this UI.

## Scope handling and mapping limits

The adapter's explicit route chain set is `sol`, `near`, `eth`, `arb`, `base`, `op`, `pol`, `bsc`. It does not infer transit chains or bridge dependencies from token tickers, contract names, confidential mode or the word “NEAR.”

| Public scope | Evidence and DarkSwap handling |
| --- | --- |
| `chain` | Official schemas and public client recognize a chain-valued scope. An `active` incident with an exact known chain value matches either selected endpoint; another value in DarkSwap's chain set is unrelated. |
| `chain_all` | Public client labels this **“chain and intents”**, not “all chains.” It retains a chain-valued `scopeValue`; DarkSwap applies the same exact endpoint matching as `chain`. |
| `bridge` | Observed `hot` in the active feed. The catalog supplies no explicit selected-route bridge dependency, so impact remains unverified and new orders/funding guidance pause conservatively. Do not report that every confidential/basic route uses HOT or is down. |
| `token`, `token_chain` | Official schema/client recognize both; the client labels the latter “token, on-chain deposits” and displays token identifiers using a token catalog. DarkSwap's current incident endpoint is chain-only, not an exact-asset dependency evaluator: these scopes remain unverified and blocking. |
| `intents`, `address` | Included in the current official incident enum. The public client treats `intents` as chain-valued for display, but display behavior alone does not establish route-execution impact. Current DarkSwap handling remains unverified and blocking. |
| `global`, unknown scope/value/status | `global` appears in configuration/grant concepts, **not** in the observed incident enum. It was not observed as an active incident. Do not invent a supported public global-outage semantic; any such incident or unknown value/status is unverified and blocking. |

Only `active` incident status is mapped to verified chain impact; even an `acknowledged` entry is conservatively unverified. A chain outside the explicit DarkSwap set is also unverified, not automatically unrelated. These conservative choices can pause a route that is actually operating; that is a **local safety hold**, not evidence of a universal provider outage.

The public 1Click catalog [S6] returned 202 entries at 14:16 UTC, with `assetId`, `blockchain`, decimals, symbol and optional contract address. It includes native SOL and chain-specific representations sharing tickers such as ETH. Some `op`/`pol`/`bsc` entries use `nep245:`; current DarkSwap token normalization admits only `nep141:` plus its network/source checks. Chain allowlisting or a catalog listing is not executable-route proof. Neither catalog nor these incident fields establishes a bridge/transit dependency graph.

## Incident response and restoration

1. Read the local service-status response and public status page [S2]. Record UTC check time, state/eligibility, affected scope/value and redacted diagnostic result. Do not put keys, customer addresses, order payloads or transaction histories in repository notes.
2. If a known endpoint incident matches, say **“selected network incident; new orders and funding guidance paused.”** If impact cannot be mapped or the feed fails, say **“route impact unverified; conservative pause.”** Do not equate a feed transport failure, 1Click authentication failure or expired order with “NEAR is down.”
3. Preserve request IDs and saved receipts. Keep tracking available; do not delete/reset claims, replay provider creation, create replacement orders or send a second deposit to resolve an uncertain request. Already-funded users should retain their transaction hash for support; refund/recovery is not guaranteed.
4. Investigate transport/JSON/size/schema changes without weakening the guard or forwarding 1Click credentials to Shield. `/incident` is a different authenticated partner surface [S4]; this runbook does not authorize incident submission, enforcement or account permission changes.
5. Restore guidance only after a successful validated observation produces fresh **allowed** eligibility for the selected route, all active scopes are verifiably unrelated or removed/resolved, and fresh independent/live-order checks pass. A recent resolved record, empty stale cache or a working quote is insufficient. Exact final terms must still be accepted, the order must still await a deposit, and its deadline must remain future.
6. If an unknown scope/dependency persists, retain the hold and request provider clarification. Update explicit mappings/contract and isolated tests through review; do not add a manual “assume healthy” fallback. Incident resolution does not extend an expired deposit deadline or clear provider-history/recovery entitlement gates.

Houdini is a distinct private execution rail with its own credentials, quotes and order lifecycle; this guard neither disables it nor certifies it as a safe equivalent substitute. OKX/terminal research or preview is not private execution and must not be presented as an incident workaround. Confidential `basic` handling does not shield a public Solana deposit or guarantee anonymity, unlinkability or settlement.

## Verification without funds or live orders

Run from the repository root. The backend harness creates a disposable loopback PostgreSQL cluster, mocks external providers and includes the adapter regression tests. It requires Bash and `initdb`, `pg_ctl`, `psql` on `PATH`, under a non-root user. Do **not** execute DB test files directly against a workspace/operator/production database.

```bash
pnpm --filter @workspace/api-server run test:order-recovery
pnpm --dir scripts exec tsx --test ../artifacts/solana-privacy-swap/src/lib/near-funding-safety.test.ts
pnpm run typecheck
node scripts/verify-near-funding-browser.mjs
node scripts/verify-near-funding-browser.mjs --expired-preview
```

The dependency-free browser script requires Chromium on `PATH` (or `CHROMIUM_PATH`) and a running app at `http://localhost:80` (override with `NEAR_TEST_BASE_URL`). It intercepts every `/api/` request before navigation; all quote/order/status responses are fixtures. It checks desktop/mobile review, incident transitions, offline/stale/error/deadline/lifecycle gates, recovery and historical copy controls. Screenshots are written to ignored `screenshots/near-safety/`. The second command checks expired previews only.

Verify fresh/failed/stale/invalid/count-mismatched feed behavior; known matching/unrelated and unknown scopes; pre-create rejection without a preview claim/provider POST; replay/recovery during a pause; post-create attached blocking; deadline/status changes; exact-term changes; cached-before-mount, offline/error/paused and >30-second UI responses. Use mocks for allow/blocked states, including a mid-create incident; do not wait for a real incident or create a provider order to test a guard.

Public-read inspection only (no authorization/cookies needed):

```bash
curl --fail --max-time 10 -H 'Accept: application/json' \
  https://partners.near-intents.org/api/shield/public/status
curl --fail --max-time 10 -H 'Accept: application/json' \
  https://shield.chaindefuser.com/docs-json
```

These commands inspect public data, not settlement or account access. This documentation task performed only unauthenticated public GET/search and source inspection: no secrets, quote requests, live orders, deposits, browser tests, workflow changes, incident writes or deployment. Test commands above are source-verified instructions, not a claim that this documentation task executed them.

## Dated source evidence and unconfirmed limits

All sources below were retrieved October 1, 2026 UTC. Counts are point-in-time observations, not current status promises.

| Source | Evidence |
| --- | --- |
| **S1** — [Partners proxy feed](https://partners.near-intents.org/api/shield/public/status) | Unauthenticated GET HTTP 200 at 14:18:46 UTC: 22 active entries; `chain`/`chain_all` include `op`, `pol`, `bsc`; `bridge:hot` active. `sol`/`near` appeared in recently resolved history, not the active list. The implementation uses this fixed URL. This observation does not establish a stable versioned API, uptime SLA or complete incident coverage. |
| **S2** — [Public status page](https://partners.near-intents.org/shield/status) | HTTP 200. The fetched public client groups by scope type/value, labels `chain_all` “chain and intents,” and calls `/api/shield/public/status`. |
| **S3** — [Official Shield OpenAPI](https://shield.chaindefuser.com/docs-json), [direct public feed](https://shield.chaindefuser.com/public/status) | Both HTTP 200; direct feed had 22 active entries at 14:17:13 UTC. OpenAPI documents unauthenticated `GET /public/status`, required `activeIncidentCount`, `activeIncidents`, `recentlyResolved`; active entries require id/scope type/value/status/created/updated times. Incident enum: `chain`, `chain_all`, `intents`, `bridge`, `token_chain`, `token`, `address`. The endpoint summary mentions security mode, but the observed response and `PublicStatusResponseDto` omit it: do not fabricate normal/security-mode state. Official direct-service documentation does not promise the partners proxy's stability. |
| **S4** — [Shield Incident API](https://docs.near-intents.org/security-compliance/shield-incident-api.md) | Partner `/incident` uses a separately issued SHIELD JWT; unauthenticated GET returned HTTP 401. Its shorter prose scope table is not the complete current public-status enum. No account/token entitlement was tested. |
| **S5** — [Proactive Intents Security](https://docs.near-intents.org/security-compliance/proactive-intents-security.md) | Describes scoped quote-time checks and broader adoption as rolling out/vision. Does not prove end-to-end enforcement on every route or expose a public bridge-dependency graph. |
| **S6** — [1Click token catalog](https://1click.chaindefuser.com/v0/tokens) | Unauthenticated GET HTTP 200 at 14:16:29 UTC. Exact identity/network fields were inspected; no explicit bridge dependency field observed. |
| **S7** — [Public status client bundle inspected](https://partners.near-intents.org/_next/static/chunks/0rnwrujxobpro.js?dpl=dpl_2RD6fXc7jy4UGTXxWn7knLjDTwdR) | Served from S2; observed scope labels, chain/token display classification and public feed path. A deployment-specific bundle is mutable implementation evidence, not a contractual API or proof of route dependencies. |

Public observations do not establish production deployment, provider history authorization, executed/refunded settlement, price freshness, hidden incidents, incident direction (not supplied in this public feed), solver health or all intermediate-chain dependencies. No universal outage or healthy-network certification is inferred.