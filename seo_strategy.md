# SEO Strategy

## In scope
- Public DarkSwap web pages, especially the landing page, private swap explanations, documentation, help, NEAR discovery and trends, and public previews where promoted.
- Public DarkSwap Launch discovery pages in the separate `artifacts/darkswap-launch` web artifact at `/launch/`: home, explore, public token details and legal explanations.
- Source-detectable WCAG 2.2 Level A/AA barriers on public pages.

## Out of scope
- API endpoints as search landing pages, private order-tracking identifiers, account-specific rewards state, internal mockup canvas, and unlaunched authenticated workflows.
- Launch private preparation/drafts, account-specific creator views and admin tools.
- Deliberately non-indexable founder/experimental previews and prelaunch holder leaderboard are not required to rank; retain appropriate sharing and accessibility checks.

## Target audience
- People comparing Solana-origin manual-deposit privacy swaps and learning their limits; NEAR Intents users exploring destinations.
- Launch users researching Solana launches through sourced discovery data; private preparation is not execution.

## Primary keywords
- DarkSwap; private swaps from Solana; privacy swap; NEAR swap; DarkSwap Launch; Solana launch discovery.

## Crawler assumptions
- Public pages should be discoverable by search, social, and AI crawlers; no explicit intent to block AI crawlers is documented. No claim that Solana deposits are anonymous or that the closed-beta public swap is available.
- The swap site now supplies route-aware initial HTML through Vite development middleware and the production `serve.mjs` service. Verify primary content coverage, not just the existence of a static summary.
- `https://darkswap.app` is the main site's source-configured canonical origin. Launch is a separate artifact currently mounted at `/launch/`; `launch.darkswap.app` is a target, not a verified deployed domain. Do not publish that target as canonical before deployment verification.

## Dismissed categories
- (None yet)
