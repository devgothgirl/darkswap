# DarkSwap

A Solana-first, no-wallet-connect private swap interface using HoudiniSwap's partner API v2.

## Run & operate

- `artifacts/solana-privacy-swap: web` is the managed frontend workflow.
- `artifacts/api-server: API Server` is the managed backend workflow.
- `pnpm run typecheck` checks the workspace.
- `pnpm --filter @workspace/api-spec run codegen` regenerates API hooks and Zod schemas after contract edits.
- Required Replit Secrets: `HOUDINI_API_KEY` and `HOUDINI_API_SECRET` from the HoudiniSwap Partner Portal. Never expose either to browser code.
- Provider docs: https://docs.houdiniswap.com/developer-hub/swap-flows/private-swap

## Stack and source of truth

- React/Vite frontend: `artifacts/solana-privacy-swap/src/`
- Express backend: `artifacts/api-server/src/routes/swap.ts` and `src/lib/houdini.ts`
- API contract: `lib/api-spec/openapi.yaml`; generated hooks and Zod schemas are under `lib/api-client-react` and `lib/api-zod`
- pnpm workspaces, TypeScript, TanStack Query, Express

## Product

Users choose a CEX-supported Solana source token and a destination token, request live `private` quotes, enter a recipient address, explicitly create an order, and manually send the exact amount to the returned Solana deposit address. The order view polls Houdini for status.

## Architecture decisions

- Partner credentials and all Houdini API requests stay server-side. The browser only calls `/api/swap/*`.
- No wallet connection or automatic funds movement: a created order is not a transfer. The user sends from their own wallet after reviewing deposit details.
- The app does not persist addresses or order history in its own database. A recent order ID can be held locally in the browser; Houdini remains the source of truth for status. **Why:** private swaps should avoid unnecessary app-side transaction data retention.
- Only server-issued, non-expired `private` quote IDs can create orders, and the source token must come from a Solana-only provider search.

## Gotchas

- The `/tokens` endpoint can search on demand; source requests filter by `chain=solana` and `hasCex=true`. Destination search supports other chains.
- `/quotes` uses `types=private`. `POST /exchanges` creates a deposit order; it does not sign or send a Solana transaction.
- Houdini's order lookup covers recent orders, not permanent archival. The app should not imply that old order IDs are recoverable forever.