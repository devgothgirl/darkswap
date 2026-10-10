# Brief: the fee recipient and ZEC-DARK liquidity

For Matthew. Rewritten 2026-10-05 after the owner changed the pool-fee policy.
Companion to `REPLIT_HANDOFF.md` item 4b ("the fee recipient contract") and
`REPLIT_STATUS.md` ("Fee policy and addresses").

## Decisions already made

1. **Policy: pool fees compound the ZEC-DARK pool.** Every swept pool fee is
   converted to ZEC and $DARK and added as liquidity to the ZEC-DARK pool on
   Meteora (Solana, DAMM v2). This replaces the earlier buy-and-burn decision
   of 2026-10-03. It is not a holder payout.
2. **No cbZEC** in the Base pool. The listed pool assets stay ETH and whatever
   stablecoin we choose. The ZEC used here is the ZEC token already paired in
   the Meteora pool, bought on Solana.
3. **No addresses are published until they have to be.** The site does not
   show or serve the fee recipient. Fresh addresses only; nothing already tied
   to the team, the rewards signer or the marketing wallets.
4. **Nothing in the pool changes.** `DarkPool.sol` and the Solana program stay
   as reviewed. The recipient is fixed at deployment (`feeRecipient` is
   `immutable` on EVM; set once by the Solana `init`), so **the recipient
   addresses must exist before each mainnet deployment.** For the testnets any
   fresh key is fine.

## Still to decide

- **Who owns the liquidity that fees add.** Either the position is
  permanently locked (fees can then only ever deepen the pool), or it is held
  by a DarkSwap position whose own LP fees join DarkSwap's LP-fee income.
  Recommendation: permanent lock, so the policy cannot be reversed quietly.
- **The bridge** for EVM fees (below) and the DEX on Ethereum.

## What arrives, where

| Pool | What `collectFees` pays out | To |
| --- | --- | --- |
| Ethereum, Base | ETH by plain `call{value}` and each listed ERC-20 by `safeTransfer`, one asset per call | `feeRecipient` |
| Solana | SOL to `feeRecipient`; each listed SPL token to the recipient's associated token account for that mint | `feeRecipient` |

Anyone can call the sweep, at any time, for any asset. So the recipient must
accept ETH without a function call (a `receive()` that cannot revert) and must
never be a contract that only works for one token.

The ZEC-DARK pool is on Solana. EVM fees therefore need a bridge step first;
Solana fees do not.

## Design

Two small pieces, both permissionless to operate, neither able to send funds
anywhere except into the ZEC-DARK pool.

### 1. EVM: `FeeForwarder` (one per chain, Ethereum and Base)

- Receives ETH and ERC-20s. No owner withdrawal of any kind.
- `forward(token, minOut)`: anyone may call. Swaps the balance of `token` to
  USDC on the local DEX if it is not USDC already, then bridges the USDC to
  the Solana `Compounder`'s address. Slippage bound by `minOut`; per-call
  size cap so a caller cannot force a bad fill on a thin market.
- Bridge: deBridge DLN or NEAR Intents. DarkSwap already runs NEAR Intents
  server-side, so Intents is the smaller integration; DLN is the more common
  on-chain pattern. **Pick one; do not support both.** The destination
  address is hard-coded at deployment.
- Emits `Forwarded(token, amountIn, usdcOut, bridgeId)` so the sequence
  sweep → forward → compound is traceable without publishing anything else.

### 2. Solana: `Compounder` (one program, one vault PDA)

- The vault PDA is the Solana pool's `feeRecipient` and the bridge
  destination. It holds SOL, USDC and any listed SPL token.
- `compound(mint, minZecOut, minDarkOut)`: anyone may call. Swaps the vault's
  balance of `mint` into ZEC and $DARK in the ZEC-DARK pool's current ratio
  (Jupiter routes passed in by the caller, verified to end at the vault's ZEC
  and $DARK accounts), then adds both as liquidity to the one hard-coded
  Meteora ZEC-DARK pool. Leftover dust stays in the vault for the next call.
- The added liquidity goes to the position chosen under "Still to decide"
  and to nothing else. No instruction can send ZEC, $DARK or LP tokens
  anywhere other than that pool.
- Same guards as the EVM side: slippage bounds, per-call cap, no admin
  withdrawal, no upgrade authority after launch (or a timelocked one, stated).
- Emits an event with the amounts added so the public record is one
  program's history.

### 3. A crank

A small job in the API server (or a cron on Matthew's side) that calls
`collectFees`, `forward` and `compound` on a schedule, with sane minimums
from a price source. The system must keep working without it: anyone can call
every step, and the crank has no special powers.

## Before mainnet

- Settle the two open decisions above.
- Deploy `FeeForwarder` on Ethereum and Base and the `Compounder` on Solana
  **first**, then pass their addresses to the pool deployments.
- Audit the two contracts together with the pool; they are the only places
  pool fees ever sit.
- Decide the crank cadence and per-call caps against expected fee volume
  (0.5% of deposits + 0.5% of withdrawals at the current rate) and the
  ZEC-DARK pool's depth, so one call cannot move its price far.

## What the site will show

Only what is already on the Fees tab: fee rate, charged, swept, waiting, and
"Planned use: Add to ZEC-DARK liquidity". When the compounder is live the tab
can add a total added, read from the `Compounder` program's history, still
without naming addresses in copy.

## Out of scope

Paying holders from pool fees, buying and burning $DARK, listing cbZEC, any
change to the pool's fee math or cap, mainnet proving keys (separate
ceremony brief).
