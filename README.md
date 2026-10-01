<p align="center">
  <img src="artifacts/solana-privacy-swap/public/brand/darkswap-mark.png" alt="DarkSwap logo" width="80" />
  <img src="artifacts/solana-privacy-swap/public/brand/wordmark.png" alt="DarkSwap" width="260" />
</p>

<p align="center">
  <strong>Private swaps today. A cross-chain trading terminal in development.</strong><br />
  Review a live Solana-origin route, deposit manually, or explore the read-only terminal preview.
</p>

<p align="center">
  <a href="https://darkswap.app">DarkSwap</a> ·
  <a href="https://darkswap.app/docs">Documentation</a> ·
  <a href="https://darkswap.app/terminal-preview">Terminal preview</a> ·
  <a href="https://x.com/darkswapapp">Follow on X</a>
</p>

> [!IMPORTANT]
> DarkSwap is in beta. A “private” or “confidential” route is **not a guarantee of anonymity or unlinkability**. Solana deposits are public on-chain. Review the live quote, destination, asset, amount, address, memo, and deadline before sending anything.

## One project, two distinct experiences

DarkSwap combines live, manual-deposit private swap routes with a planned **cross-chain trading terminal**. They are separate experiences with different wallet and execution models.

- **Private swaps today:** compare quotes, review an order, and send the deposit yourself. No wallet connection or account is required for guest swaps.
- **Terminal in development:** a planned wallet-based trading experience across supported chains. The current preview uses fictional tokens and simulated calculations; it does not execute trades.

The terminal preview is not evidence of live cross-chain trading, supported pairs, or guaranteed privacy. The separate Privacy swap route already uses provider-backed execution; the terminal's live integration is still planned.

## Availability

| Area | Status | How it works |
| --- | --- | --- |
| [Private route](https://darkswap.app/swap) | Live beta | Provider-backed quotes and manual-deposit orders from Solana; track by order ID. |
| [Privacy swap](https://darkswap.app/near-swap) | Live beta | Confidential-mode quotes and manual deposits; review final terms before funding. Track by deposit address. |
| [NEAR trends](https://darkswap.app/near-trends) | Read-only research | Public trending/new pool feeds and paginated third-party pool search; not quotes or trading. |
| [NEAR pool discovery](https://darkswap.app/near-discovery) | Read-only research | Combine two limited feeds, filter loaded pools by text/feed/DEX, and sort their available metrics. |
| [Cross-chain trading terminal](https://darkswap.app/terminal-preview) | Read-only demo; live trading planned | Fictional tokens, fixed sample data, and simulated buy/sell calculations. No wallet connection, deposits, or transactions in the preview. |
| [Screener Beta](https://darkswap.app/screener-beta) | Read-only | Search a dated, provider-reported Solana xStock/PreStock catalog; no live prices or independently verified backing. |
| [Split Mixer](https://darkswap.app/split-mixer-preview) and [Privacy Bundle](https://darkswap.app/privacy-bundle-preview) | Previews | Planning tools only. They do not move, pool, mix, or hide funds. |
| Explore and public swap execution | Closed beta | Gated research and execution code, not additional live trading products. |
| [Email account rewards](https://darkswap.app/rewards) | Optional; configuration-dependent | Explicit enrollment and per-order association for non-cash points, not token payouts. |
| [$DARK tokenomics](https://darkswap.app/tokenomics) | Proposal; token unlaunched | Holder-streak and treasury plans, not active rewards, yield, or a live token. |
| [Help](https://darkswap.app/help) | Reviewed guidance and saved reports | Case persistence and delivery tracking; a saved report is not proof of inbox receipt or review. |

Live pairs, limits, fees, and destination chains depend on provider availability. A catalog entry is not a usable quote. Terminal cross-chain execution and embedded-wallet trading are not enabled by opening the demo.

### NEAR discovery is research, not execution

- **Trends:** switch between trending and new pools, inspect token/pool addresses, and compare available price, liquidity, volume, and 24-hour activity. Search queries the third-party index beyond the feed, one page at a time, up to **10 pages**. Sorting applies only to the current page; a next page can be empty, and the index is not an exhaustive directory.
- **Pool discovery:** merges and deduplicates the trending/new feeds, each described by the UI as up to **20 pools**. Its search and filters apply only to those loaded pools—not the wider index used by Trends search.
- Both show source/update information and explicit loading, empty, and error states. Missing figures remain unavailable rather than invented. Data is cached and may be delayed; activity or recency is not a safety assessment, endorsement, verified memecoin list, or proof of executable liquidity. Pool links leave DarkSwap.

These tools are linked from the [Founder area](https://darkswap.app/founder), separate from the launch navigation and live swap calls to action.

## Cross-chain trading terminal

The planned terminal brings asset discovery, quote review, and wallet-based trading into a single DarkSwap experience. Routing infrastructure is an implementation detail—not a separate feature or product.

The preview lets you explore the interface without connecting a wallet or risking funds. Its tokens and values are fictional. Simulated orders do not reach a provider and cannot create a deposit address or transaction.

Before live terminal trading launches, each supported route needs verified liquidity and execution support, clear fees and minimum output, explicit wallet authorization, and tested recovery behavior. Do not assume that a route available through the separate Privacy swap flow is available in the terminal.

## Liquidity and privacy

DarkSwap integrates provider-backed liquidity and execution; it does not operate its own liquidity pools or market-making system. A quote is an estimate, not proof of settlement. Technical provider details and route limitations belong in the [Docs](https://darkswap.app/docs#providers).

Confidential handling is not Zcash shielding. Native ZEC, bridged token representations, and shielded transfers are different capabilities. Public deposits, destination-chain activity, timing, and provider records can still expose or associate activity.

## How the live private swaps work

1. Select a Solana source asset, destination asset, amount, and the addresses required by the route.
2. Review the quote, minimum output, fees, limits, estimated time, and destination network.
3. Create an order to receive deposit instructions. **Creating an order does not transfer funds.** On Privacy swap, review the final live terms separately because they can differ from the earlier estimate.
4. If you choose to proceed, send the exact instructed asset and amount from your own Solana wallet to the shown deposit address, including any memo. Do not send from a different network.
5. Save your order ID or deposit address and track the provider-reported status. On-chain transfers generally cannot be reversed.

The browser never asks to connect a wallet for these routes. The API keeps provider credentials server-side. Both routes now persist order-creation claims and provider responses in PostgreSQL. Privacy swap also saves previews and final deposit receipts for reload recovery; the original private route tracks a known order through provider lookup. These stored responses are not a guarantee of settlement or a cryptographic proof of privacy.

If creation times out, the server can reuse a saved response or attempt a matched provider-history lookup instead of blindly submitting another order. Recovery requires adequate account access and an unambiguous match; bounded history lookups can still leave a request unresolved. Save the receipt/order reference, check again, and **do not resend funds or create a replacement to fix an uncertain result**. Privacy swap's tracker hides funding instructions when status is unavailable, expired, already funded, or closed.

Both routes enforce at least **$3 USD of the asset sent**; providers may require more. This is an input threshold, not a DarkSwap fee or revenue. Quote and source-price validation fail closed when the input value cannot be established; retrieval time alone does not establish market-price freshness.

## Optional rewards

Guest swaps remain account-free. Email rewards require separate enrollment and an explicit, off-by-default choice to associate each new order with the account. That association can reduce privacy; signing in alone does not link an order.

Current account points have no cash value and cannot be transferred or redeemed. Planned NEAR + ZEC loyalty concepts are separate from those points and do not establish live payouts, staking yield, or guaranteed returns. Marketing consent is separate from rewards enrollment.

The current $DARK proposal uses a **three-day holder streak**, then planned daily progression/compounding with the formula and rates undecided. The proposed split is **50% of rewards accrued by team allocations for holder-streak bonuses and 50% for buyback + burn**—not half of all volume or a token tax. Token identity, eligibility evidence, treasury funding, asset conversion, and distribution rules still need approval and verification. Treasury balances, holder counts, and payouts are not connected; unavailable is not zero.

## Source handoff status

This README describes implementation at **`5f2c842757f7d4c5dec063e5298917307a97faa1`**. “Live beta” identifies the exposed swap flows, **not a fresh production/provider/settlement verification**. The separate co-founder handoff report records isolated verification results; no live providers, email sends, funded orders, or production data are part of that verification.

Recent source includes the NEAR research pages and paginated search, persisted order recovery, optional email points, saved support cases with independent delivery states and manual retention tooling, and route-specific crawlable HTML/SEO. Marketing has separate confirmation, unsubscribe, suppression, signed-callback health, and durable processing-pause logic. Implementation and synthetic tests do not prove real inbox delivery, provider account entitlements, or production readiness.

Outstanding release gates include account access for uncertain-order recovery and batch routes, live email suppression/callback verification, actual support inbox receipt, price-freshness confirmation, and reviewed/funded token economics. **Swap rebates are not enabled:** revenue is unknown, and the existing readiness review authorizes no rebate budget. External trading links are separate services; no integrated terminal execution or funded external-wallet journey is established here.

## Developer setup

### Toolchain and offline limits

This is a **pnpm workspace** with React/Vite, an Express API, an OpenAPI contract, and PostgreSQL. Use **Node.js 24, pnpm 10, and Linux x64 with glibc**; the Replit configuration uses PostgreSQL 16. The committed workspace overrides remove native packages for macOS, Windows, ARM, and Linux musl. The frozen lockfile is not a portable macOS/ARM/Alpine install: use a compatible Linux environment rather than casually regenerating it or removing security settings.

Keep the workspace's minimum-release-age and allowed-build-dependency settings. Run commands below from the repository root unless noted. Supply required variables through the process environment. Do not assume a local `.env` file sets API variables or Vite's required `PORT`/`BASE_PATH`: those are read from `process.env`.

```bash
node --version   # expect 24.x
pnpm --version   # expect 10.x
pnpm install --frozen-lockfile
```

Offline source/UI review does not provide live quotes, order status, market feeds, authentication, or email. Those features require configured online services. The fictional terminal demo remains a demo even when credentials are present.

### Configuration

Configure credentials through your host's secret manager, **never in source control, browser bundles, or shell history**:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Dedicated development PostgreSQL connection; required when the API imports the database module |
| `PORT` | Required separately for API and frontend; also checked when loading Vite config for builds |
| `BASE_PATH` | Required frontend/Vite base path; use `/` for the root-mounted DarkSwap app |
| `HOUDINI_API_KEY`, `HOUDINI_API_SECRET` | Original private-route quotes and orders |
| `NEAR_INTENTS_API_KEY` | Privacy swap quotes, deposit instructions, and authorized recovery lookups |
| `PRIVY_APP_ID`, `PRIVY_APP_SECRET` | Optional email-rewards authentication; only the public app ID is returned to the browser |
| `MARKETING_PUBLIC_URL`, `MARKETING_FROM_EMAIL`, `MARKETING_POSTAL_ADDRESS`, `MARKETING_UNSUBSCRIBE_SECRET` | Optional email base configuration; see the marketing runbook for validation and secret stability |
| `MARKETING_RESEND_WEBHOOK_SECRET`, `MARKETING_WEBHOOK_READY`, `MARKETING_WEBHOOK_PROBE_EMAIL` | Signed marketing callback/readiness/probe configuration; do not mark ready before controlled verification |
| `SUPPORT_RESEND_WEBHOOK_SECRET`, `DISCORD_SUPPORT_WEBHOOK_URL` | Separate support-delivery callback and optional support notification configuration |

Gated research and terminal-routing code also has optional provider credentials. Configuring a provider does not enable a closed-beta feature or make the terminal demo live. Consult the server configuration for the integration you are working on; keep all credentials server-side.

**Connector runtime:** support and marketing email use `@replit/connectors-sdk` and an authorized email connector, not a direct email API-key environment variable implemented by this app. They require the Replit connector service and runtime identity facilities. Installing the SDK or setting swap credentials on an external host is insufficient. Do not copy runtime identity credentials into an offline handoff; external email hosting needs a separately reviewed adapter/configuration change. Signed webhook secrets and live readiness verification are still required independently of connector authorization.

### Database and services

> [!WARNING]
> Use an empty, **dedicated development database**, never production, an operator database, or a clone containing real users/orders. Schema push changes the target database. Starting the API also runs reward-order polling, marketing-health checks, and receipt retention; it is not a passive source viewer.

After setting `DATABASE_URL` to that dedicated database, review the schema and apply it deliberately:

```bash
pnpm --filter @workspace/db run push
```

Do not use `push-force`, reset data, or run unreviewed DDL to make a handoff work. A development push does not update production. Production schema/deployment changes require owner approval and the coordinated release process described in the operations docs.

On Replit, the managed **API Server** and **web** workflows and their `.replit-artifact/artifact.toml` files supply service ports, base paths, and routing. Canvas is a separate component-design service, not part of the trading runtime.

For an external Linux development setup, run the two services in separate terminals **only after** configuring the development database and required environment:

```bash
# API (DATABASE_URL supplied securely to this process)
PORT=3001 pnpm --filter @workspace/api-server run dev

# Frontend
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/solana-privacy-swap run dev
```

Put a **same-origin reverse proxy** in front: `/api` and `/api/*` must go to the API on port 3001 **without stripping `/api`**; all other requests go to the frontend on 5173. The API is mounted at `/api`, and browser clients use that prefix. Vite has no API proxy configured: starting the processes alone is insufficient. The API trusts one proxy hop, so the proxy must control forwarded client headers.

For built web serving, the artifact uses `artifacts/solana-privacy-swap/serve.mjs` against `dist/public`, including route-specific HTML and alias redirects—not just Vite preview. Preserve deep-link handling and `/api` routing when arranging an external deployment. No external or production deployment is verified by these instructions.

### Available checks and builds

These commands are **verified against source scripts**; the separate handoff report distinguishes executed checks from unrun commands. Codegen cleans/rewrites generated client/schema directories; the web build regenerates SEO assets. Review resulting changes before a release.

```bash
# OpenAPI → React Query client + Zod schemas; also typechecks the libraries
pnpm --filter @workspace/api-spec run codegen

# Libraries alone, then all configured workspace typechecks
pnpm run typecheck:libs
pnpm run typecheck

# API bundle, or frontend build (Vite requires PORT/BASE_PATH even for build)
pnpm --filter @workspace/api-server run build
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/solana-privacy-swap run build

# Root build: typecheck first, then recursive available builds, including Canvas
PORT=5173 BASE_PATH=/ pnpm run build

# Route classification, sitemap, and robots assets
pnpm --filter @workspace/solana-privacy-swap run seo:generate
pnpm --filter @workspace/solana-privacy-swap run seo:check
```

Build artifacts are not proof of provider access, database readiness, safe execution, or publication.

### Tests: choose isolated suites, never a broad database glob

There is no root `test` script. The following specific suites use local logic, mocked/rejected external calls, and, where applicable, loopback HTTP servers; they do not query an application database or send provider email. The deliberately unusable database URL satisfies imports in the non-DB marketing suite.

```bash
# Static HTML/metadata and mocked support notification behavior (Node 24)
node --test artifacts/solana-privacy-swap/seo-html.test.mjs
node --test artifacts/api-server/tests/support-discord.test.mjs

# Frontend feed/search/page state
pnpm --dir scripts exec tsx --test ../artifacts/solana-privacy-swap/src/pages/near-trends-state.test.ts

# Selected API/config regressions only; do not replace this list with a test glob
DATABASE_URL=postgresql://127.0.0.1:1/unused_unit_test pnpm --dir scripts exec tsx --test \
  ../artifacts/api-server/src/lib/private-quote-value.test.ts \
  ../artifacts/api-server/src/routes/swap.test.ts \
  ../artifacts/api-server/src/routes/near.test.ts \
  ../artifacts/api-server/src/routes/near-trends.test.ts \
  ../artifacts/api-server/src/routes/rewards-order-auth.test.ts \
  ../artifacts/api-server/src/lib/marketing.test.ts
```

The database harnesses below require Bash and PostgreSQL binaries **`initdb`, `pg_ctl`, and `psql` on `PATH`**, under a non-root user. Each unsets inherited `DATABASE_URL`, creates a temporary loopback-only cluster and test schema, uses mocks/synthetic callbacks, and stops/removes the cluster on exit. See the separate handoff report for results:

```bash
pnpm --filter @workspace/api-server run test:order-recovery
pnpm --filter @workspace/api-server run test:marketing-health
pnpm --filter @workspace/api-server run test:support-delivery
pnpm --filter @workspace/api-server run test:rewards
```

> [!CAUTION]
> Database tests can truncate tables or alter global health/retention state. Use the harnesses, not direct `*.db.test.ts` execution. Order-recovery, marketing-health, and support suites check both their test flag and exact loopback test URL; rewards concurrency checks only `REWARDS_CAP_TEST_DB=true`, so that flag alone is **not** database isolation. Never manually set these guards to bypass them.
>
> `marketing.db.test.ts` is **not included** in the marketing-health harness and has **no isolated-database guard**: it inherits `DATABASE_URL` and exercises global health/receipt-retention routines despite mocked mail and seeded-row cleanup. Run it only after separately provisioning and schema-initializing a disposable database and reviewing its effects. Do not run the older direct database command in the marketing doc against an application database.

## Repository map

All current workspace packages:

| Path / package | Contents |
| --- | --- |
| `./` — `workspace` | Workspace install/build/typecheck orchestration; lockfile and compiler configuration |
| `artifacts/solana-privacy-swap/` — `@workspace/solana-privacy-swap` | DarkSwap React app, live swap UI, NEAR research, demos, rewards, help, Docs, SEO generation, and web server |
| `artifacts/api-server/` — `@workspace/api-server` | Express integrations/validation/routes, order recovery, marketing/support/rewards logic, operators, and test harnesses |
| `artifacts/mockup-sandbox/` — `@workspace/mockup-sandbox` | Canvas component-design previews and generated component registry; separate `/__mockup` service |
| `lib/api-spec/` — `@workspace/api-spec` | `openapi.yaml` source contract and Orval codegen configuration |
| `lib/api-client-react/` — `@workspace/api-client-react` | Generated React Query client/types plus custom fetch handling |
| `lib/api-zod/` — `@workspace/api-zod` | Generated request/response validation schemas |
| `lib/db/` — `@workspace/db` | PostgreSQL pool, Drizzle schema, and schema-push commands with no development-target isolation guard |
| `scripts/` — `@workspace/scripts` | `tsx` tooling, script typechecks, helper and post-merge scripts |
| `docs/` (not a package) | Dated evidence, operations runbooks, and launch-readiness decisions |

Read `scripts/post-merge.sh` before using host post-merge automation: it includes a database push command. Do not treat it as a harmless offline bootstrap.

## Operations and launch evidence

Technical provider names, contracts, account limitations, and evidence belong in the [Docs provider reference](https://darkswap.app/docs#providers) and the repository notes below. These are source/runbook references, not a certification of the currently published site.

| Reference | Handoff use |
| --- | --- |
| [Marketing operations](docs/marketing.md) | Consent, confirmation/unsubscribe, signed callback health, processing-fence reconciliation, and controlled campaign/probe operations; apply the stricter DB-test warning above |
| [Support delivery and retention](docs/support-delivery.md) | Independent support callback/inbox verification, restricted recovery, manual review/holds, and explicitly approved deletion |
| [NEAR rail status safety](docs/near-rail-status-safety.md) | Public incident observation, conservative route holds, fresh final-term funding review, and isolated verification; independent of order state and recovery entitlement |
| [Private quote valuation](docs/private-quote-valuation.md) | Minimum-value validation evidence and deferred price-freshness confirmation; quote-only evidence is not settlement |
| [Split/batch readiness](docs/splitwise-live-readiness.md) | Account entitlement and execution/recovery gates; planning previews must stay separate from any future funded flow |
| [Swap rebate readiness](docs/swap-rebate-readiness.md) | Unknown economics, no approved rebate budget, and evidence needed before accrual or payouts |
| [Rewards evidence](docs/rewards-proposal-evidence.md) | Historical research/approval boundaries; its weekly multipliers and terminal-reserve allocation are **superseded** by the current Tokenomics three-day/daily plan and bonuses/buyback split |
| [External wallet funding and bot plan](docs/telegram-trading-bot-plan.md) | Separate third-party custody, exact-asset/network checks, and unverified funding journey; not a DarkSwap bot launch |
| [Share-card release note](docs/share-card-release.md) | Historical isolated-release constraints, not the current release baseline; whole-workspace publication requires deliberate scope and approval |

For usage details and limitations, see the [DarkSwap Docs](https://darkswap.app/docs). Never commit API credentials, wallet keys, seed phrases, or user deposit details.