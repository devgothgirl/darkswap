<p align="center">
  <img src="artifacts/solana-privacy-swap/public/brand/icon.png" alt="" width="52" />
  <img src="artifacts/solana-privacy-swap/public/brand/wordmark.png" alt="DarkSwap" width="260" />
</p>

<p align="center">
  <strong>Solana-origin swaps. Review first, deposit yourself.</strong><br />
  A wallet-free interface for comparing live routes, creating deposit instructions, and tracking an order.
</p>

> [!IMPORTANT]
> DarkSwap is in beta. A "private" or "confidential" route is **not a guarantee of anonymity or unlinkability**. Solana deposits are public on-chain. Review the live quote, destination, and other factors before proceeding.

## What works today

| Area | Status | How it works |
| --- | --- | --- |
| Private route | Live beta | Manual-deposit orders from Solana; track by order ID. |
| Privacy swap | Live beta | Confidential handling; review final terms, then decide whether to fund. |
| Screener Beta | Read-only | Search a dated token catalog; it is not a live trading route. |
| Split Mixer and Privacy Bundle | Previews | Planning tools only. They do not move, pool, mix, or hide funds. |
| Explore and public swap | Closed beta | Not available for live research or trading. A public swap would **not** be private. |

Live pairs, limits, fees, and destination chains depend on provider availability. An asset appearing in search does not mean a usable quote exists. For complete details on integrations and capabilities, see the [DarkSwap documentation](https://darkswap.app).

## How a swap works

1. Select a Solana source asset, destination asset, amount, and the addresses required by the route.
2. Review the quote, minimum output, fees, limits, estimated time, and destination network.
3. Create an order to receive deposit instructions. **Creating an order does not transfer funds.** Review the final live terms before proceeding, as they may differ from the initial quote.
4. If you choose to proceed, send the exact instructed asset and amount from your own Solana wallet to the shown deposit address, including any memo. Do not send from a different network.
5. Save your order ID or deposit address and track the provider-reported status. On-chain transfers generally cannot be reversed.

The browser never asks to connect a wallet for these routes. The API keeps provider credentials server-side. Order receipts are securely stored for tracking purposes.

## Run the project

This is a **pnpm workspace** with a React/Vite frontend, an Express API, an OpenAPI contract, and PostgreSQL for order receipts. Use Node.js 24 and pnpm 10.

```bash
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
```

Configure credentials through your host's secret manager, **never in source control**. For a complete list of required and optional environment variables, see the [DarkSwap documentation](https://darkswap.app).

On Replit, start the managed **API Server** and **web** workflows. The artifact configuration supplies ports, base paths, and `/api` routing. For an external local setup, refer to the [setup guide](https://darkswap.app).

## Repository map

| Path | Contents |
| --- | --- |
| `artifacts/solana-privacy-swap/` | Web app, landing page, swap and order screens |
| `artifacts/api-server/` | Provider integrations, validation, and API routes |
| `lib/api-spec/` | OpenAPI source contract and code generation |
| `lib/api-client-react/`, `lib/api-zod/` | Generated client and validation schemas |
| `lib/db/` | PostgreSQL schema and Drizzle configuration |

For usage details and limitations, see the [DarkSwap documentation](https://darkswap.app). Never commit API credentials, wallet keys, seed phrases, or user deposit details.
