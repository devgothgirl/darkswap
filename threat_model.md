# Threat Model

## Project Overview

DarkSwap is a multi-artifact Solana-origin, manual-deposit swap product deployed on Replit (autoscale, public visibility, primary host `darkswap.app`). It is a pnpm monorepo:

- `artifacts/solana-privacy-swap` — React/Vite frontend (the main swap site, served at `/`).
- `artifacts/darkswap-launch` — a separate discovery/private-preparation web app at `/launch/`.
- `artifacts/api-server` — Express API (served at `/api`, and a Launch-only ingress at `/launch/api`).
- `artifacts/darkswap-design-system` — shared theme.
- `artifacts/mockup-sandbox` — design/mockup canvas (dev-only, `/__mockup`).
- `lib/*` — shared DB schema (Drizzle/PostgreSQL), generated API client/zod types, pool client.
- `packages/darkswap-pool` — testnet shielded pool (circuits/contracts; treated as out of scope per handoff rules).

The product never connects a wallet for the privacy routes; orders produce manual deposit instructions. Two provider-backed routes exist (Houdini private route; NEAR Intents 1Click "Privacy swap"). A public OKX swap and an "Explore / asset intelligence" discovery feature exist but are **closed beta**.

## Assets

- **Server-side secrets** — `HOUDINI_API_KEY/SECRET`, `NEAR_INTENTS_API_KEY`, `TOKENS_XYZ_API_KEY`, `HELIUS_API_KEY`, `OKX_API_KEY/SECRET/PASSPHRASE`, `DATABASE_URL`, pool relayer keys. Must never reach browser code.
- **Order / recovery records and signed provider responses** — stored in PostgreSQL for recovery/tracking.
- **Rewards accounts** — verified emails, enrollment, points ledger (non-cash), marketing consent.
- **User trust / accurate representation** — the product's core promise is that it never overstates privacy or asset legitimacy. Misleading users into thinking a public route is private, or that provider-reported tokens (incl. "AI" pre-stocks like OPENAI/ANTHROPIC/NEURALINK) are verified securities, is itself an abuse risk.

## Trust Boundaries

- **Browser → API** (`/api`, `/launch/api`) — all client input untrusted.
- **API → upstream providers** — StonkFun, tokens.xyz, Helius, OKX, GeckoTerminal, Houdini, NEAR Intents, Resend. Upstream responses are untrusted and are schema-validated (zod) and URL-sanitized before reaching clients.
- **API → PostgreSQL**.
- **Public vs closed-beta** — `/explore` and `/swap/okx` are gated to 403; the privacy/NEAR routes, NEAR trends, rewards, support, launch, and pool routes are public/live.
- **Main swap app vs Launch app** — separate identities/sessions; must not be joined.

## Scan Anchors

- Production API entry points: `artifacts/api-server/src/routes/` mounted from `routes/index.ts` under `/api`; Launch ingress `/launch/api` (`app.ts`).
- **Closed-beta gate**: `routes/index.ts:27-31` returns 403 for `/explore` and `/swap/okx` prefixes, mounted before `discoveryRouter`/`okxRouter`. Verified no bypass. These feature routers (`discovery.ts`, `okx.ts`) are therefore unreachable in production.
- Token "comparison"/discovery surface (this scan's focus): `near-trends.ts` (live, public), `stonkfun.ts`/`lib/stonkfun.ts` (discovery, hardened), `discovery.ts` (gated), frontend `pages/explore.tsx` (gated backend), `pages/screener-beta.tsx` + `pages/screener-catalog.ts` (static, client-only, disclaimered), `pages/near-trends.tsx`, `pages/near-discovery.tsx`.
- Upstream-data hardening helpers to reuse: `safeMetadataUrl`/`validMint` in `lib/stonkfun.ts`, `safePoolUrl` in `near-trends.tsx`. All external links use `rel="noopener noreferrer"`/`referrerPolicy="no-referrer"` and https-only validation.
- Per-IP rate limiting is implemented ad hoc per router (`discovery.ts` `limited()`, `okx.ts` `limited()`, `stonkfun.ts` middleware). There is **no global rate limiter** (`app.ts`). Any new public proxy endpoint must add its own.
- Dev-only / ignore unless proven reachable: `artifacts/mockup-sandbox`, `*.test.ts`, `dist/` build artifacts.

## Threat Categories

### Information Disclosure / Misrepresentation (Tampering of meaning)

The highest project-specific risk is users "getting the wrong idea": believing a public route is private, or that provider-reported tokens are verified/backed securities. Guarantees required: discovery/comparison UIs MUST label provider data as unverified, MUST NOT present closed-beta or non-private routes as private, and MUST keep `executionAvailable`/`verified` flags false unless proven. Current code enforces this well (heavy disclaimers, `verified`/`executionAvailable` default false, metadata suppression on review, static screener catalog). Upstream strings are control-char-stripped and length-bounded; React escapes output; external URLs are https-validated.

**Open finding (scan 209):** The unauthenticated `GET /api/near/status` handler (`near.ts:801-837`) returns the order `recipient`/`refundTo` keyed only by the Solana `depositAddress`. Because the deposit address is publicly observable in the user's on-chain funding transaction, any on-chain observer can link source activity to the confidential destination, undermining the Privacy swap promise. Any order-tracking lookup for the privacy routes MUST be keyed by a secret bearer token that is NOT revealed on-chain (as the Houdini route does), not by a public deposit address.

### Denial of Service

Public, unauthenticated read endpoints that proxy to third parties must bound outbound requests. Every unauthenticated upstream-proxy endpoint now rate-limits per IP and bounds concurrency, consistent across siblings: `GET /api/near/trends` and `GET /api/near/pools/search` (`near-trends.ts`) share a per-IP bucket (30/min), a global bucket (600/min), and a hard cap of 32 concurrent upstream fetches — slots are held for the full upstream operation so client disconnects cannot free them early, and the limiter is scoped to only those two paths so fall-through routes are never throttled. Guarantee required: any future unauthenticated upstream-proxy endpoint MUST follow the same pattern.

### Spoofing / Elevation of Privilege

Closed-beta features MUST be enforced server-side, not just hidden in the UI. Verified: `/explore` and `/swap/okx` are blocked server-side regardless of client. OKX transaction building verifies the signer/fee-payer equals the requested wallet and bounds min-receive, preventing the server from returning a transaction that drains a different account.
