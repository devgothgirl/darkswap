# DarkSwap

A Solana-origin, manual-deposit swap interface. The original private route uses Houdini; the separate, user-facing “Privacy swap” uses NEAR Intents 1Click with confidential `basic` handling. Neither route guarantees anonymity. Solana deposits remain public. Explore and public OKX swaps remain closed beta.

## Run & operate

- `artifacts/solana-privacy-swap: web` and `artifacts/api-server: API Server` are managed workflows.
- `pnpm run typecheck` checks the workspace. After OpenAPI edits, run `pnpm --filter @workspace/api-spec run codegen`.
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
- Never describe the public OKX route as private, or imply that confidential handling hides a public Solana-origin deposit.