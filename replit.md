# DarkSwap

A Solana-origin, manual-deposit swap interface. The original private route uses Houdini; the separate, user-facing “Privacy swap” uses NEAR Intents 1Click with confidential `basic` handling. Neither route guarantees anonymity. Solana deposits remain public. Explore and public OKX swaps remain closed beta.

## Run & operate

- `artifacts/solana-privacy-swap: web` and `artifacts/api-server: API Server` are managed workflows.
- `pnpm run typecheck` checks the workspace. After OpenAPI edits, run `pnpm --filter @workspace/api-spec run codegen`.
- `pnpm --filter @workspace/solana-privacy-swap run test:ui` runs the jsdom UI tests (route forms, order components, recorded Houdini/Solana markup).
- Keep `HOUDINI_API_KEY`, `HOUDINI_API_SECRET`, `NEAR_INTENTS_API_KEY`, and `DATABASE_URL` in server-side secrets. Never expose them to browser code or commit values.
- On Replit, managed artifact configuration provides routing and ports. Outside Replit, configure a reverse proxy for `/api`.

## Source of truth

- React/Vite frontend: `artifacts/solana-privacy-swap/src/`
- Express API: `artifacts/api-server/src/routes/`
- Contract: `lib/api-spec/openapi.yaml`; generated hooks and validation types: `lib/api-client-react`, `lib/api-zod`
- PostgreSQL schema: `lib/db/src/schema/`

## Safety and persistence

- Neither route connects a wallet or automatically transfers funds. An order creates deposit instructions; users decide whether to send manually.
- Original private route: only non-expired, server-issued private quotes can create orders. Provider lookup is the source of truth; old order IDs may not be recoverable forever.
- Privacy swap: dry quotes produce no deposit address. A live instruction-only order requires a separate review of final terms; signed provider responses and order receipts are stored in PostgreSQL for recovery and tracking.
- Bridge (`/bridge`): the same confidential NEAR Intents rail, with origin networks from the server-side `NEAR_ORIGIN_CHAINS` allow-list (supported: `sol,eth,arb,base,op,pol,bsc`). Unset means Solana only; invalid, unsupported and NEAR values are logged and ignored. The Privacy swap stays Solana-origin. Do not enable an EVM origin in production until the owner has completed real orders on that chain (Base first) and approved it.
- NEAR public incident checks and fresh final-term funding gates are documented in `docs/near-rail-status-safety.md`; incident holds do not replace order tracking or establish recovery entitlement.
- Never describe the public OKX route as private, or imply that confidential handling hides a public Solana-origin deposit.

## DarkSwap Launch

- `artifacts/darkswap-launch` is a separate discovery/private-preparation product at `/launch/` in the workspace. Do not replace the swap app's root routes or import one artifact's source into the other.
- Launch uses the shared API through the Launch-only `/launch/api` ingress; canonical `/api/stonkfun` and `/api/launch` endpoints are also registered.
- Launch wallet message signatures prove ownership for private drafts; they are not transactions, fees or spending approvals. No execution, fee charging or reward issuance ships.
- Schema, sessions, draft logos, review flags and proposed incentives are launch-specific. Never join these identities to marketing contacts, private swap histories or current reward ledgers.
- Read `docs/launch-api-contract.md` for contracts, `docs/launch-release.md` for capability boundaries, and `docs/launch-standalone-deployment.md` for the current owner-selected hostname and release gates. A prepared target is not a verified live Launch deployment.


## Design system

- `artifacts/darkswap-design-system` owns the theme. Both web artifacts import `@workspace/darkswap-design-system/styles.css` once from their CSS entry and keep `class="dark"` on `<html>`. Colour values are edited in its `tokens.json` only; app CSS reads a role token (`hsl(var(--primary) / .18)`), never a brand hex, and never redeclares a `:root` / `.dark` role table.
- Recorded exception: the main site keeps Source Sans 3 and Space Mono (bundled via `@fontsource`) instead of the system's Inter and JetBrains Mono, by overriding `--app-font-sans` / `--app-font-serif` / `--app-font-mono` after the import. Fonts only — nothing else in the main site departs from the imported theme.

## Shielded pool (testnet)

- Spec: `packages/darkswap-pool/REPLIT_HANDOFF.md`. Never edit its `circuits/`, `evm/src/`, `evm/script/`, `solana/`, `keys-dev/` or `fixtures/`; never change fee math, hashing, key derivation, `dark1` addresses or note encryption.
- Client: `lib/pool-client` (`@darkswap/pool-client`, browser + Node). Server: indexer and relayer under `artifacts/api-server/src/lib/pool/`, routes at `/api/pool/*`, tables in `lib/db/src/schema/shielded-pool.ts`. UI: `/pool`, `/pool/:tab`, `/pool/what-stays-public` in `artifacts/solana-privacy-swap/src/pool/`.
- A chain goes live only when its deployment exists: EVM `packages/darkswap-pool/deployments/<chainId>.json`; Solana `POOL_PROGRAM_ID_<CLUSTER>`. Server secrets: `POOL_RELAYER_PRIVATE_KEY_EVM`, `POOL_RELAYER_KEYPAIR_SOLANA`, `RPC_URL_<CHAIN>`. Browser root checks use `POOL_PUBLIC_RPC_<CHAIN>` (public defaults).
- Pool pages render outside `RewardsProvider` (no wallet SDK), turn off the site analytics tracker, and show the "Testnet. Development proving keys. Do not deposit real funds." banner. The relayer never logs IPs, user agents or addresses.
- Token withdrawals: through the relayer (fee in the token, only for tokens with a rate in `POOL_RELAY_TOKEN_RATES_<CHAIN>`, JSON of token → whole tokens per 1 native coin) or from the user's own wallet (no relayer fee; the wallet is the public sender).
- Testnet set-up (deploy the three testnets, add files and secrets, verify, publish): follow `docs/pool-testnet-setup-manual.md`. Helpers in `packages/darkswap-pool`: `npm run deploy:evm` (EVM, reads `scripts/.env.deploy`), `npm run setup:devnet` (Solana initialize + list SOL, re-runnable, `--dry-run`), `npm run check:deployment` (PASS / FIX across the three chains; runs in the Replit shell too).
- Fee models and earnings: `docs/pool-earnings-models.md` compares competitor fee models, says which fit the reviewed contracts (0 to 100 bps on shield and unshield, never on sends, fees buy and burn $DARK off-chain), and records the owner's testnet rates (2026-10-04: 50 bps on all three chains; Solana relayer margin `POOL_RELAY_MIN_FEE_SOLANA_DEVNET=500000` lamports, no EVM margin; deploy with `PROTOCOL_FEE_BPS=50`). Projections: `node scripts/earnings-calculator.mjs --help` in `lib/pool-client` (offline; uses `protocolFeeOn` and the relayer's cost formula).
- Local check: run anvil with the pool deployed (`TEST_TOKEN=true`), start the built API with `RPC_URL_ANVIL`, a relayer key and `POOL_RELAY_TOKEN_RATES_ANVIL`, then `node scripts/relay-e2e.mjs` and `node scripts/relay-token-e2e.mjs` in `lib/pool-client`. If anvil restarts, delete the `anvil` rows from the pool tables first.
