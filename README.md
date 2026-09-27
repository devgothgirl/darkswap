# DarkSwap

**A Solana-first, deposit-based private swap and bridge experience.**

DarkSwap helps users compare a supported Houdini route, review its quote, and create an order without connecting a wallet to the app. The user then **manually sends the exact deposit amount** from a Solana wallet and tracks the order. Available assets, destinations, fees, and timing depend on the live quote. A private route does **not** guarantee anonymity.

## Beta status

| Area | Availability | What it does |
| --- | --- | --- |
| Landing page (`/`) | Open | Explains the route and current beta scope |
| Private swap / bridge (`/swap`) | Open | Solana-origin Houdini quotes and deposit-based orders |
| Order tracking (`/order/:id`) | Open | Deposit instructions and order status |
| Explore (`/explore`) | Closed beta | Token research; not available yet |
| Public swap (`/public-swap`) | Closed beta | Separate OKX same-chain Solana swap; **not private** |

The closed-beta pages display an availability notice. Their API endpoints return HTTP 403, so hiding a button is not the only access control. There is no invite-only login or waitlist in this release. Explore and OKX source code is retained for future work, but those flows are not available to visitors. In-app OKX bridging is **not** implemented.

## How the available route works

1. Choose a Solana asset, amount, and supported destination.
2. Review the live quote, fees, limits, expected time, and recipient address.
3. Create an order. **Creating an order does not move funds.**
4. Manually send the exact amount to the Solana deposit address shown on the order screen, including any required deposit memo.
5. Track progress using the order ID. Transfers cannot be reversed.

DarkSwap does not ask to connect a wallet for this flow. Route availability varies, execution can take longer than a direct swap, and no service can promise absolute privacy.

## Tech stack

- React, TypeScript, and Vite for the web app
- Express and TypeScript for the API
- OpenAPI contract with generated client and validation types
- Houdini for the available private route
- Tokens.xyz, Helius, and OKX integrations retained for currently gated areas

## Repository layout

| Path | Purpose |
| --- | --- |
| `artifacts/solana-privacy-swap` | Web app and beta launch pages |
| `artifacts/api-server` | API and provider calls; credentials stay server-side |
| `lib/api-spec` | OpenAPI contract and code generation |
| `lib/api-client-react`, `lib/api-zod` | Generated client and validation types |
| `lib/db`, `scripts` | Supporting workspace packages |

## Run locally

Use **Node.js 24** and **pnpm**. From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
```

Configure the secrets below in your hosting environment. Never commit actual values to GitHub.

| Variable | Needed for |
| --- | --- |
| `HOUDINI_API_KEY`, `HOUDINI_API_SECRET` | Available private route quotes and orders |
| `HELIUS_API_KEY` | Closed-beta Solana research |
| `TOKENS_XYZ_API_KEY` | Closed-beta token discovery |
| `OKX_API_KEY`, `OKX_API_SECRET`, `OKX_API_PASSPHRASE` | Closed-beta public OKX swaps |

The included Replit artifact manifests configure separate web and API services and route `/api` to the API server. On Replit, start the configured **API Server** and **web** workflows. Outside Replit, each service needs a port, the web app needs `BASE_PATH`, and a reverse proxy must forward `/api` requests to the API server:

```bash
# Terminal 1
PORT=8080 pnpm --filter @workspace/api-server run dev

# Terminal 2
PORT=18223 BASE_PATH=/ pnpm --filter @workspace/solana-privacy-swap run dev
```

The two commands alone do not configure the external reverse proxy. Without that proxy, the browser will not reach the API from the web dev server.

## Safety and scope

- Check the destination chain, address, amount, and any memo before depositing. Blockchain transfers are generally irreversible.
- Do not treat “private” as a promise of untraceability or universal chain/token support.
- The OKX feature, when eventually opened, is a **public** on-chain swap and is not a private bridge.
- Keep API credentials, wallet keys, seed phrases, `.env` files, dependencies, and build output out of Git.