# DarkSwap Launch — release boundary and deployment

## Product boundary

DarkSwap Launch is a separate discovery and **private preparation** app. Saving a
draft does not create a token, submit a transaction, pay a fee, publish metadata,
or establish creator attribution. The production launch adapter is deliberately
unavailable for **all** pairs. No environment variable or administrator control can
activate it.

The existing DarkSwap artifact still owns `/`. Its swap handlers, manual-deposit
flows, beta gates, account points, and marketing identity boundaries are not
replaced. Launch identity and incentives are stored separately. There is no
linkage to swap history, marketing contacts, or the existing reward ledger.

## Serving and deployment boundaries

Workspace app: `/launch/`. Frontend routes and assets use Vite's `BASE_PATH`.
Browser requests use `/launch/api/...`; the shared API artifact has a dedicated
Launch-only ingress at this prefix. The contract's canonical endpoints also
remain available under `/api/stonkfun/...` and `/api/launch/...`.

`/launch/api` is **not** a second alias for swap, marketing, or existing rewards
routes. The launch artifact never imports another artifact's source.

Target hostname: `launch.darkswap.app`. It is a deployment target, **not a claim
that this hostname is live**. This work does not publish or change DNS/TLS.
The existing production deployment was reported as `https://darkswap.app` by the
deployment service during implementation.

For a subdomain-root build, set `BASE_PATH=/` when building this frontend.
This makes its assets/routes root-based and its API requests `/api/...`.
Serve `dist/public` with an SPA fallback **after** routing `/api` to the shared
API server. The same-origin API ingress must preserve Origin, cookies, HTTPS
scheme and the intended host, and forward only the Launch discovery/private
endpoints if the deployment should expose no other product APIs. Do not put API
secrets in the frontend or call StonkFun from browser code.

The workspace router is path-based. Adding a custom domain to the existing
deployment is not evidence of hostname-specific artifact routing. The owner must
verify whether their hosting/ingress can map the launch hostname to a root-built
Launch artifact without changing the swap hostname's `/` artifact. Otherwise use
a separate frontend deployment/project with a controlled same-origin API
ingress. Do not change this workspace's root artifact to solve that problem.

Owner-controlled release checks:

1. Choose and verify the hostname-aware ingress/deployment topology.
2. Build Launch with `/` only for its independent root host; keep `/launch/` here.
3. Configure the exact allowed HTTPS origin for wallet proof and secure sessions.
4. Configure an independently reviewed administrator wallet allowlist, or leave
   admin access denied. Merely owning an authenticated wallet is not admin access.
5. Apply additive development schema changes through the existing managed
   Publish schema-diff flow, reviewing the diff. No startup production DDL ships.
6. Ensure private object storage is attached and inaccessible without ownership.
7. Complete custom-domain ownership, DNS and TLS setup in the hosting account.
8. Verify direct public and private routes, actual response headers, cookie
   security, API routing and logo persistence on the real HTTPS hostname.

Until those checks pass, workspace tests and local production-build smoke tests
do not prove custom-domain behavior.

## Discovery evidence and limitations

Sources inspected read-only:

- `https://www.stonkfun.xyz/developers`
- `https://www.stonkfun.xyz/api/public/v1/openapi.json`
- `https://www.stonkfun.xyz/api/public/v1/tokens?sort=newest`
- `https://www.stonkfun.xyz/api/public/v1/pairs?launchable=true`

Public discovery uses `data.tokens`, provider pagination, and `mainnet-beta`.
Pair selection is by mint. Symbols can collide. Relative provider images are
resolved against the provider origin, not this app.

Documented provider-wide search covers name, symbol and mint, with exact quote
mint filtering. It is not creator lookup or a guarantee of fuzzy matching.
Bounded pagination is disclosed. A locally filtered multi-mint NEAR view
discloses that its matches cover the current provider page rather than the whole
catalog. Trending uses available volume/recency signals, not market cap alone.

`aboutToGraduate` and `graduated` use provider status, not an invented formula
based on current market cap. Provider timestamps are source timestamps, not
independently verified chain events. Missing holder, transaction, unique buyer,
growth, fee, creator attribution or reward data remains unavailable.

A NEAR-symbol Solana mint is not native NEAR-chain support or evidence of backing
or redemption. Ecosystem/stablecoin grouping is by evidence-backed mint and
network, never ticker alone. USDC is not classified as NEAR merely by name.
Only a matching current launchable/readiness-checked DARK mint may receive DARK
pair status; the prominent locked DARK card is not a launchable asset.

## Execution acceptance requirements for a future release

The interface in `src/lib/launch/adapter.ts` is a boundary, not an implementation.
Before replacing the unavailable adapter, verify official transaction
documentation and implement all of:

- Fresh provider terms with strict schema validation and short expiry.
- Binding to exact signer, network, mint pair, draft revision and full config.
- Independent transaction decoding and validation of every instruction, program,
  destination, fee mint, fee amount, authority and expected token configuration.
- Renewed explicit review and consent after any config or provider-term change.
- Creator wallet signing only; no server signing or private/embedded keys.
- Persistent, atomic idempotency and recovery for uncertain submissions.
- Independent finalized confirmation matching the reviewed transaction and token;
  a submitted signature is not confirmation or a success receipt.
- Adversarial tests for wrong signers/networks/programs/destinations, fee changes,
  expiration, replays, concurrent submission and inconsistent confirmation.

No funded verification, fee charging, token creation, native NEAR execution,
bridging, or payout is part of this release.

## Moderation and incentive boundary

Manual review records require source evidence and reason, remain `under_review`,
and prevent automatic promotion/qualification. Metadata suppression is local; it
does not remove on-chain metadata. Wallet flags are review signals, not identity
verdicts.

Offline deterministic heuristics accept provenance-verified referral, activity,
or cluster evidence. Fixtures cover self-referrals, repeated two-wallet return
paths, distinct-event spam and sourced suspected clusters. No live evidence
ingestion is connected, so the UI reports these detectors inactive. Aggregate
volume cannot detect wash trading or sybils.

Campaigns, DarkPoints and launch fees in admin are auditable **draft proposals**.
They do not alter provider fees, activate campaigns, create claimable value or
override the unavailable adapter. Clean records do not earn rewards either.

## Configuration

| Server setting | Default / purpose |
| --- | --- |
| `STONKFUN_BASE_URL` | `https://www.stonkfun.xyz/api/public/v1` |
| `DARK_PAIRING_ENABLED` | `false`; never overrides upstream readiness |
| `DARK_TOKEN_ADDRESS` | Unset; no ticker-based replacement |
| `DARK_PAIR_SYMBOL` | `DARK`; fixed by the contract |
| `DARK_PAIR_PRIORITY` | `1`; valid configured integer priorities supported |
| `NEAR_PAIRING_ENABLED` | `false`; still requires evidence-backed Solana mint grouping |
| `LAUNCH_ALLOWED_ORIGINS` | Comma-separated exact origins; required for production wallet proof; development additionally accepts the managed development HTTPS domain |
| `LAUNCH_ADMIN_WALLETS` | Comma-separated independently authorized Solana wallet addresses; empty denies all admin access |
| `PRIVATE_OBJECT_DIR` | Managed private object-storage directory; never expose the value in frontend code |
| `BASE_PATH` | Frontend build/serve setting: `/launch/` here, `/` for a verified independent root host |

No execution enablement flag, transaction key, seed, or fee-collector address is
required or supported.

## Verification record

- Workspace `pnpm run typecheck`: passed, including the unchanged swap frontend.
- API production build: passed.
- Discovery mocked-provider tests: 14 passed.
- Wallet/drafts/admin/logo tests: 11 passed with temporary isolated PostgreSQL and
  mocked object storage.
- Adapter, lifecycle, evidence heuristics and both always-disabled submit
  ingresses: 5 passed.
- Existing order-recovery checks: 7 passed; rewards concurrency/authorization:
  4 passed; separate swap/NEAR route checks: 3 passed.
- `node scripts/src/verify-launch-serving.mjs`: passed prefix and root production
  builds and 25 modeled static-serving checks. See
  `docs/launch-serving-verification.md` for exact scope.
- Managed workspace discovery returned real token/pair pages (including 532
  pairs during the smoke check), explicit source timestamps and bounded pagination.
  These counts are observations, not permanent inventory assertions.
- Workspace private drafts/admin deny anonymous requests; the Launch ingress
  does not expose existing rewards; existing `/api/explore` remains beta-gated.
- Desktop homepage screenshot inspected with real provider catalog data.
- One browser pass verified real discovery/search/page navigation/detail, initial
  connection preserving unsaved fields, rejected and accepted Ed25519 message
  proofs, real private PNG storage upload/completion/rendering, the complete
  four-step preparation review, save/resume/reload, wallet-switch and explicit-null
  disconnection isolation, cross-wallet draft denial, non-admin denial and owner
  draft deletion. No transaction method or submit endpoint was called.
- At 402×844, navigation and keyboard focus worked without horizontal overflow;
  private Creator metadata was `noindex, nofollow`.
- The browser pass noted confusing delayed search-clear/pagination display.
  Committed filters now use the URL as the source of truth, clear immediately,
  preserve deep-linked pages, and do not show old results as a newly requested
  page loads. This follow-up was checked with TypeScript/build checks rather than
  another full browser pass.

The existing marketing webhook health warning remains unchanged; marketing sends
remain paused pending the separately tracked signed-webhook verification.
Custom-domain routing, DNS/TLS and actual launch transactions remain unverified
by design. Real storage CORS and owner-only rendering passed in the workspace
HTTPS browser, not on the unconfigured custom domain. External catalog images
can return provider errors independently of discovery API availability.