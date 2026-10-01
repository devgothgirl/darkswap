# DarkSwap → NearFi Terminal funding first, Telegram bot later

## Primary user journey

The likely DarkSwap use case is to move assets from Solana into a user's [NearFi Terminal trading wallet](https://terminal.nearfi.trade/wallet) on NEAR. The user connects a separate NEAR wallet to NearFi, obtains the Terminal trading-wallet address, uses an eligible DarkSwap Solana-origin private route to receive **the exact asset and network NearFi accepts**, then checks the balance at NearFi before trading. NearFi holds the Terminal wallet's key; it is an external custodial service, not a DarkSwap wallet.

As of the initial quote-only check, DarkSwap's existing private-route catalog lists SOL as a source and NEAR on the NEAR network as a destination, and a live SOL→NEAR quote returned private options. **No recipient-specific order or funded transfer to NearFi Terminal has been verified.** The separate Privacy Swap / NEAR Intents catalog instead labels its NEAR-chain output **wNEAR (`wrap.near`)**. Do not treat wNEAR as native NEAR or suggest it will load a Terminal wallet unless NearFi explicitly confirms that deposit type.

## Bridge-provider check

- **Existing private route (Houdini):** Current token discovery lists SOL on Solana and NEAR on the NEAR network; a quote-only request returned private SOL→NEAR options. This is the first candidate for NearFi Terminal funding. Quotes depend on amount and availability, and an order to a real Terminal trading-wallet address has not yet been tested. [Private swap API guide](https://docs.houdiniswap.com/api-v1/swap-flows/private-swap).
- **Privacy Swap (NEAR Intents 1Click):** The live catalog includes SOL as source and `nep141:wrap.near` / wNEAR as a NEAR-chain output. A dry quote to a sample account returned no route for those test details; that does not establish general unavailability. More importantly, the output is labeled wNEAR rather than the native NEAR that NearFi Terminal says to send. Verify payout semantics and recipient support before using it for Terminal funding. [NEAR token documentation](https://docs.near-intents.org/integration/verifier-contract/deposits-and-withdrawals/near-token).
- **Relay:** Its [published supported-chain list](https://docs.relay.link/resources/supported-chains) includes Solana but not NEAR. Do not add it for this destination without a newly documented route.
- **OKX:** Its [developer DEX API reference](https://web3.okx.com/onchainos/dev-docs-v5/dex-api/dex-api-reference) documents swap APIs, but no Solana→NEAR bridge developer endpoint was verified. A consumer bridge page is not an executable integration contract.

## Funding readiness gate

1. Confirm NearFi Terminal's generated trading-wallet address format, whether it credits externally sent native NEAR, any memo or minimum deposit, and whether it accepts transfers arriving from the chosen private-route provider.
2. With a public Terminal trading-wallet address and user consent, obtain a fresh quote and review the exact destination network, token, amount, fees, and final order instructions. Creating an order must not send funds. Do not silently substitute wNEAR or a different chain.
3. Only with explicit approval, test a tiny funded transfer. Track the provider order and confirm the amount credited in Terminal before presenting the journey as a supported funding path. Do not ask for or store NearFi wallet keys or seed phrases.
4. Once verified, add a guided "Fund a NearFi Terminal wallet" path linking to Terminal for the address, selecting only the validated NEAR output, and reminding users to review the final order and NearFi custody terms. Keep quote failures and unsupported assets explicit.

## Boundary for the trading bot

DarkSwap's Privacy Swap is a Solana-origin manual-deposit route, not a limit-order system, pair scanner, or trading bot. NearFi is a separate NEAR-token trading service. Until DarkSwap has its own bot, link to [NearFi's bot page](https://nearfi.trade/#bot) for NEAR memecoin trades and label it external. NearFi says its Telegram bot creates and manages a custodial wallet; do not describe it as part of DarkSwap or imply its features apply to Privacy Swap.

NearFi's published page describes one-tap buy/sell, token-address entry, slippage settings, position tracking, and withdrawals. It does **not** confirm limit orders or new-pair alerts. Do not advertise those as NearFi features without a current provider confirmation. Building another trading bot is downstream of validating the wallet-funding journey; the first DarkSwap bot may simply guide quotes and order tracking rather than custody funds.

Before any in-chat trade execution, choose its trading chain and signing model. A Telegram bot cannot execute a wallet trade without authorization. A bot-held wallet is custodial and carries key-management, recovery, and loss risks; a wallet-signed web flow keeps keys with users but cannot silently execute unattended limit orders. Do not launch live trading until this is decided explicitly.

## Bot build sequence after funding validation

1. **Discovery and data contracts.** Choose chain and verified quote, liquidity, token-metadata, and new-pair feeds. Identify canonical token addresses, provider rate limits, stale-data handling, and scam-token warnings. Define what qualifies as a “new pair” and whether “limit order” means an alert or automatic execution.
2. **Read-only bot MVP.** Build a DarkSwap-owned Telegram bot with `/start`, `/help`, token lookup, fresh quotes, watchlists, and price/new-pair alerts. Identify the network on every message; link to an approved wallet-signed trading page or an explicitly external provider for execution. Do not collect seed phrases or private keys.
3. **Order intent and review.** Let users specify a target price, amount, expiry, and maximum slippage, then show a clear review and cancellation flow. If there is no verified execution authorization, call these *alerts*, not live limit orders.
4. **Trading only after security review.** Implement provider-backed execution for the chosen chain with explicit signing or deliberately approved delegation, idempotent order submission, stale-quote guards, fee disclosure, cancellation, balance checks, and transaction/status reconciliation. Never auto-trade on a new-pair alert by default.
5. **Operations and release.** Use Telegram's authenticated webhook delivery, rate limits, opt-in notifications, protected credentials, monitoring, and a kill switch. Test on a safe environment with tiny-value transactions before a limited beta.

## Done for the bot's first release

- Users can find a token by verified contract address, see the chain and source/time of a quote, and opt into or cancel alerts.
- Unavailable, stale, or unsupported pairs fail clearly; no fabricated quote or guaranteed execution.
- Every link and message distinguishes DarkSwap from an external provider and makes custodial-wallet risks clear where applicable.
- The bot never handles funds or labels an alert a live order unless the approved execution model actually supports it.

## Open product choices

- Can a funded Terminal wallet receive the existing route's NEAR output, and what address/memo/amount rules apply?
- Does DarkSwap need a separate trading bot at all, or should it help people fund and track transfers to NearFi's existing Terminal and Telegram bot?
- If a DarkSwap trading bot is needed later, which chain and token universe should it serve?
- First milestone: alerts and wallet-signed links, or funded in-chat buy/sell?
- Limit orders: notify at target price, or execute automatically after a separate custody/delegation design?