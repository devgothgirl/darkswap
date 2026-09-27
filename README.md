<p align="center">
  <img src="artifacts/solana-privacy-swap/public/brand/wordmark.png" alt="DarkSwap" width="260" />
</p>

<p align="center">
  <strong>Solana-origin swaps. Review first, deposit yourself.</strong><br />
  A wallet-free interface for comparing live routes, creating deposit instructions, and tracking an order.
</p>

> [!IMPORTANT]
> DarkSwap is in beta. A “private” or “confidential” route is **not a guarantee of anonymity or unlinkability**. Solana deposits are public on-chain. Review the live quote, destination, asset, amount, address, memo, and deadline before sending anything.

## What works today

| Area | Status | How it works |
| --- | --- | --- |
| [Private route](artifacts/solana-privacy-swap/src/pages/home.tsx) | Live beta | Houdini quotes and manual-deposit orders from Solana; track by order ID. |
| [Privacy swap](artifacts/solana-privacy-swap/src/pages/near-swap.tsx) | Live beta | NEAR Intents 1Click quotes with confidential `basic` handling; review final terms, then decide whether to fund. Track by deposit address. |
| Screener Beta | Read-only | Search a dated token catalog; it is not a live trading route. |
| Split Mixer and Privacy Bundle | Previews | Planning tools only. They do not move, pool, mix, or hide funds. |
| Explore and public OKX swap | Closed beta | Not available for live research or trading. A public swap would **not** be private. |

Live pairs, limits, fees, and destination chains depend on provider availability. An asset appearing in search does not mean a usable quote exists. In-app OKX bridging is not implemented.

## How a swap works

1. Select a Solana source asset, destination asset, amount, and the addresses required by the route.
2. Review the quote, minimum output, fees, limits, estimated time, and destination network.
3. Create an order to receive deposit instructions. **Creating an order does not transfer funds.** On Privacy swap, review the final live terms separately because they can differ from the earlier estimate.
4. If you choose to proceed, send the exact instructed asset and amount from your own Solana wallet to the shown deposit address, including any memo. Do not send from a different network.
5. Save your order ID or deposit address and track the provider-reported status. On-chain transfers generally cannot be reversed.

The browser never asks to connect a wallet for these routes. The API keeps provider credentials server-side. Privacy swap stores its signed provider response and order receipt in PostgreSQL so the instructions can be recovered after a reload; the original private route uses the provider's order lookup instead.

## Run the project

This is a **pnpm workspace** with a React/Vite frontend, an Express API, an OpenAPI contract, and PostgreSQL for Privacy swap receipts. Use Node.js 24 and pnpm 10.

```bash
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
```

Configure credentials through your host's secret manager, **never in source control**:

| Variable | Purpose |
| --- | --- |
| `HOUDINI_API_KEY`, `HOUDINI_API_SECRET` | Original private-route quotes and orders |
| `NEAR_INTENTS_API_KEY` | Privacy swap quotes and deposit instructions (1Click Distribution Channel key) |
| `DATABASE_URL` | PostgreSQL connection for Privacy swap order receipts |

Optional integrations for gated research/public-swap code include `HELIUS_API_KEY`, `TOKENS_XYZ_API_KEY`, and the `OKX_API_KEY` / `OKX_API_SECRET` / `OKX_API_PASSPHRASE` set. They do not turn those closed-beta features on.

On Replit, start the managed **API Server** and **web** workflows. The artifact configuration supplies ports, base paths, and `/api` routing. For an external local setup, provide `PORT` to both services and `BASE_PATH=/` to the frontend, run `pnpm --filter @workspace/db run push` against a **dedicated development database**, and put a reverse proxy in front of the services so browser requests to `/api` reach the API server. Starting the two processes alone does not provide that proxy.

## Repository map

| Path | Contents |
| --- | --- |
| `artifacts/solana-privacy-swap/` | Web app, landing page, swap and order screens |
| `artifacts/api-server/` | Provider integrations, validation, and API routes |
| `lib/api-spec/` | OpenAPI source contract and code generation |
| `lib/api-client-react/`, `lib/api-zod/` | Generated client and validation schemas |
| `lib/db/` | PostgreSQL schema and Drizzle configuration |

For usage details and limitations, see the in-app [Docs](artifacts/solana-privacy-swap/src/pages/docs.tsx). Never commit API credentials, wallet keys, seed phrases, or user deposit details.