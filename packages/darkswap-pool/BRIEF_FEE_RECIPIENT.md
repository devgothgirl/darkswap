# Brief: the fee recipient and the $DARK burn

For Matthew. Written 2026-10-03 from the owner's decisions of the same day.
Companion to `REPLIT_HANDOFF.md` item 4b ("the fee recipient contract") and
`REPLIT_STATUS.md` ("Fee policy and addresses").

## Decisions already made

1. **Policy: buy and burn $DARK.** Not "pay holders", not "convert to ZEC".
   Every pool fee that is swept ends as a public $DARK burn on Solana.
2. **No cbZEC** in the Base pool. The listed assets stay ETH and whatever
   stablecoin we choose; nothing in this brief depends on a ZEC asset.
3. **No addresses are published until they have to be.** The site no longer
   shows or serves the fee recipient. Fresh addresses only; nothing that is
   already tied to the team, the rewards signer or the marketing wallets.
4. **Nothing in the pool changes.** `DarkPool.sol` and the Solana program
   stay as reviewed. The recipient is fixed at deployment (`feeRecipient` is
   `immutable` on EVM; set once by the Solana `init`), so **the recipient
   addresses must exist before each mainnet deployment.** For the testnets any
   fresh key is fine.

## What arrives, where

| Pool | What `collectFees` pays out | To |
| --- | --- | --- |
| Ethereum, Base | ETH by plain `call{value}` and each listed ERC-20 by `safeTransfer`, one asset per call | `feeRecipient` |
| Solana | SOL to `feeRecipient`; each listed SPL token to the recipient's associated token account for that mint | `feeRecipient` |

Anyone can call the sweep, at any time, for any asset. So the recipient must
accept ETH without a function call (a `receive()` that cannot revert) and must
never be a contract that only works for one token.

$DARK is an SPL token on Solana. EVM fees therefore need a bridge step before
they can buy anything; Solana fees do not.

## Design

Two small pieces, both permissionless to operate, neither able to send funds
anywhere except toward the burn.

### 1. EVM: `FeeForwarder` (one per chain, Ethereum and Base)

- Receives ETH and ERC-20s. No owner withdrawal of any kind.
- `forward(token, minOut)`: anyone may call. Swaps the balance of `token` to
  USDC on the local DEX if it is not USDC already, then sends the USDC through
  the bridge to the Solana `Burner`'s address. Slippage bound by `minOut`;
  per-call size cap so a caller cannot force a bad fill on a thin market.
- Bridge: deBridge DLN (Nullmask uses it for the same hop) or NEAR Intents.
  DarkSwap already runs NEAR Intents server-side, so Intents is the smaller
  integration for us; DLN is the more common on-chain pattern. **Pick one and
  state it in the design; do not support both.** The destination address is
  hard-coded at deployment.
- Emits `Forwarded(token, amountIn, usdcOut, bridgeId)` so the sequence
  sweep → forward → burn is traceable without us publishing anything else.

### 2. Solana: `Burner` (one program, one vault PDA)

- The vault PDA is the Solana pool's `feeRecipient` and the bridge
  destination. It holds SOL, USDC and any listed SPL token.
- `burn(mint, minDarkOut)`: anyone may call. Swaps the vault's balance of
  `mint` to $DARK via Jupiter (route passed in by the caller, verified to end
  at the vault's $DARK account), then burns the received $DARK with the SPL
  `Burn` instruction. The program never holds $DARK across instructions.
- Same guards as the EVM side: slippage bound, per-call cap, no admin
  withdrawal, no upgrade authority after launch (or a timelocked one, stated).
- Emits a burn event with the amount so the public record is one program's
  history.

### 3. A crank

A small job in the API server (or a cron on Matthew's side) that calls
`collectFees`, `forward` and `burn` on a schedule, with sane `minOut` values
from a price source. The system must keep working without it: anyone can call
every step, and the crank has no special powers.

## Before mainnet

- Decide the bridge (above) and the DEX on Ethereum (Base and Solana are
  obvious: Aerodrome or Uniswap on Base, Jupiter on Solana).
- Deploy `FeeForwarder` on Ethereum and Base and the `Burner` on Solana
  **first**, then pass their addresses to the pool deployments.
- Audit the two contracts together with the pool; they are the only places
  pool fees ever sit.
- Decide the cadence for the crank and the per-call caps against the expected
  fee volume (0.5% of deposits + 0.5% of withdrawals at the current rate).

## What the site will show

Only what is already on the Fees tab: fee rate, charged, swept, waiting, and
"Planned use: Buy and burn $DARK". When the burn is live the tab can add a
total burned, read from the `Burner` program's history, still without naming
addresses in copy. The homepage keeps teasing "Dark Pool" and nothing more.

## Out of scope

Paying holders from pool fees, ZEC conversion, listing cbZEC, any change to
the pool's fee math or cap, mainnet proving keys (separate ceremony brief).
