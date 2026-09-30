<p align="center">
  <img src="artifacts/solana-privacy-swap/public/brand/icon.png" alt="" width="52" />
  <img src="artifacts/solana-privacy-swap/public/brand/wordmark.png" alt="DarkSwap" width="260" />
</p>

<p align="center">
  <strong>Private swaps today. A cross-chain trading terminal with NEAR Intents in development.</strong><br />
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

DarkSwap combines live, manual-deposit private swap routes with a planned **cross-chain trading terminal with NEAR Intents**. They are separate experiences with different wallet and execution models.

- **Private swaps today:** compare quotes, review an order, and send the deposit yourself. No wallet connection or account is required for guest swaps.
- **Terminal in development:** a planned wallet-based trading experience across supported chains. The current preview uses fictional tokens and simulated calculations; it does not execute trades.

The terminal preview is not evidence of live cross-chain trading, supported pairs, or guaranteed privacy. NEAR Intents is already used by the separate Privacy swap route; the terminal's live integration is still planned.

## Availability

| Area | Status | How it works |
| --- | --- | --- |
| [Private route](https://darkswap.app/swap) | Live beta | Provider-backed quotes and manual-deposit orders from Solana; track by order ID. |
| [Privacy swap](https://darkswap.app/near-swap) | Live beta | Confidential-mode quotes and manual deposits; review final terms before funding. Track by deposit address. |
| [Cross-chain trading terminal with NEAR Intents](https://darkswap.app/terminal-preview) | Read-only demo; live trading planned | Fictional tokens, fixed sample data, and simulated buy/sell calculations. No wallet connection, deposits, or transactions in the preview. |
| Screener Beta | Read-only | Search a dated token catalog; it is not a live trading route. |
| Split Mixer and Privacy Bundle | Previews | Planning tools only. They do not move, pool, mix, or hide funds. |
| Explore and public swap execution | Closed beta | Gated research and execution code, not additional live trading products. |

Live pairs, limits, fees, and destination chains depend on provider availability. A catalog entry is not a usable quote. Terminal cross-chain execution and embedded-wallet trading are not enabled by opening the demo.

## Cross-chain trading terminal with NEAR Intents

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

The browser never asks to connect a wallet for these routes. The API keeps provider credentials server-side. Privacy swap stores its signed provider response and order receipt in PostgreSQL so the instructions can be recovered after a reload; the original private route uses the provider's order lookup instead.

## Optional rewards

Guest swaps remain account-free. Email rewards require separate enrollment and an explicit, off-by-default choice to associate each new order with the account. That association can reduce privacy; signing in alone does not link an order.

Current account points have no cash value and cannot be transferred or redeemed. Planned NEAR + ZEC loyalty concepts are separate from those points and do not establish live payouts, staking yield, or guaranteed returns. Marketing consent is separate from rewards enrollment.

## Run the project

This is a **pnpm workspace** with a React/Vite frontend, an Express API, an OpenAPI contract, and PostgreSQL for order receipts and application records. Use Node.js 24 and pnpm 10.

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
| `DATABASE_URL` | PostgreSQL connection for order receipts and application records |

Gated research and terminal-routing code also has optional provider credentials. Configuring a provider does not enable a closed-beta feature or make the terminal demo live. Consult the server configuration for the integration you are working on; keep all credentials server-side.

On Replit, start the managed **API Server** and **web** workflows. The artifact configuration supplies ports, base paths, and `/api` routing. For an external local setup, provide `PORT` to both services and `BASE_PATH=/` to the frontend, run `pnpm --filter @workspace/db run push` against a **dedicated development database**, and put a reverse proxy in front of the services so browser requests to `/api` reach the API server. Starting the two processes alone does not provide that proxy.

## Repository map

| Path | Contents |
| --- | --- |
| `artifacts/solana-privacy-swap/` | Landing page, live swap flows, terminal demo, rewards, and Docs |
| `artifacts/api-server/` | Provider integrations, validation, and API routes |
| `lib/api-spec/` | OpenAPI source contract and code generation |
| `lib/api-client-react/`, `lib/api-zod/` | Generated client and validation schemas |
| `lib/db/` | PostgreSQL schema and Drizzle configuration |

For usage details and limitations, see the [DarkSwap Docs](https://darkswap.app/docs). Never commit API credentials, wallet keys, seed phrases, or user deposit details.