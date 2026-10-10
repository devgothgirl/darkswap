# Pool earnings models: what competitors charge, what this pool can do, and what to set on the testnets

**Status: TESTNET planning document. Evidence checked October 4, 2026.** Nothing here is a revenue claim about a live deployment. No live fee rate was changed, no funds were moved, and no contract was called with a signer.

The owner asked to try the earning methods other privacy pools use and see which fits this pool best. The reviewed contracts fix what can be tried, so this document does three things:

1. Lists how each competitor earns, with a source and date for every fact. Anything that could not be read from a primary source is marked **unverified**.
2. Says for each method whether this pool can do it as a setting, as an off-chain policy at the fee recipient, or not at all without changing the reviewed contracts.
3. Proposes a fee rate per testnet chain, with numbers from the calculator, for the owner to approve.

The calculator is `lib/pool-client/scripts/earnings-calculator.mjs` (`node scripts/earnings-calculator.mjs --help` from `lib/pool-client`). It runs offline and uses the pool's own fee arithmetic and the relayer's cost formula; `test/earnings-calculator.test.mjs` fails if either drifts from the contract or the relayer.

The volumes in section 4 are assumed scenarios. Once a testnet pool has real usage, the exporter turns a month of it into the same input file, so the worked examples can be replaced by observed numbers — see [section 4.4](#44-exporting-a-real-testnet-month).

---

## 1. What this pool's revenue can be

From `packages/darkswap-pool/evm/src/DarkPool.sol`, the Solana program and `lib/pool-client/src/relayer-fees.js` (the one definition of the relayer's quote, used by the relayer, the volume exporter and the earnings calculator alike):

| Lever | Rule | Who controls it |
| --- | --- | --- |
| Fee on shield | `protocolFeeBps` of the note amount, paid by the depositor **on top** | Owner, per chain, `setProtocolFee`, 0 to 100 bps |
| Fee on unshield | `protocolFeeBps` of the payout, taken **out of** the payout | Same setting as above; one rate covers both directions |
| Fee on a private send | **None.** A fee would reveal the asset | Fixed by the circuit; not a setting |
| Rounding | Up (`(amount * bps + 9_999) / 10_000`), so no shield or unshield pays zero | Fixed |
| Hard cap | `MAX_PROTOCOL_FEE_BPS = 100` (1%) | Fixed |
| Where fees go | `feeRecipient`, immutable on EVM, set once at Solana `initialize`; anyone can sweep | Fixed at deployment |
| Relayer fee, EVM | `1,500,000 gas x gasPrice x 1.2 + margin`, paid from the payout to the relayer | Operator sets `margin` (`POOL_RELAY_MIN_FEE_<CHAIN>`, e.g. `_BASE_SEPOLIA`) |
| Relayer fee, Solana | `5,000 lamports + 2 x nullifier rent + margin` | Same |
| Relayer on private sends | Free, rate-limited; the relayer eats the gas | Operator (`POOL_RELAY_FREE_PER_10_MIN`) |
| Deposits | Sit idle in the pool; the admin cannot move them | Fixed |

So revenue is exactly two things: the protocol fee (in and out, same rate, at most 1%) and the relayer's margin over its own costs. There is no fee on sends, no fee above 1%, no yield on deposits, and no way for the pool to pay anyone except the fee recipient.

---

## 2. How competitors earn

Source and date are given per row. "Verified" means read from the project's own docs, contract or filing on October 4, 2026. "Unverified" means the number circulates but no primary source was found; it is not used in any recommendation.

| Project | Fee charged where | Rate | Who pays | Relayer / gas | Proceeds go to | Source |
| --- | --- | --- | --- | --- | --- | --- |
| **Nullmask** (EVM) | Shield **and** unshield | 0.5% + 0.5% (verified from its own DefiLlama fees filing) | Depositor on shield, withdrawer on unshield | Relayer paid from the shielded balance: `gas x 1.25 x gasPrice`, kept separate from the protocol fee | Protocol fee wallet on Ethereum; Solana team wallets hold MASK. Filing counts 100% of fees as protocol revenue. **A buy-and-burn or holder payout policy is not published: unverified.** | [Fees filing](https://github.com/DefiLlama/dimension-adapters/pull/9855), [TVL filing](https://github.com/DefiLlama/DefiLlama-Adapters/pull/21369), [Fees page](https://docs.nullmask.io/user-guide/fees) |
| **DARKPOOL** (darkpool.ag, Solana) | Private **swap** only | 0.5% of the trade. Shield, unshield and send: no fee | The swapper | Relayer charges about 0.0009 SOL per note spent on SOL swaps and SOL unshields (rent plus network fee); sends and other unshields relayed free | 80% buys back $DARKPOOL: half burned, half to a vault owned by shielded $DARKPOOL holders; 20% builder wallet (10% to a referrer when there is one) | [Docs, "Fees & $DARKPOOL"](https://darkpool.ag/docs) |
| **Railgun** (EVM) | Shield **and** unshield | 0.25% + 0.25% | Depositor / withdrawer | Broadcaster charges a premium on **gas**, not on the amount; self-relay possible | Governance treasury, distributed to stakers of the governance token over time | [Deductions](https://docs.railgun.org/wiki/learn/railgun-deductions), [Costs FAQ](https://docs.railgun.org/community-faqs/readme/costs-and-fees) |
| **Privacy Cash** (Solana, Base, Ethereum, BSC) | Unshield only | Deposit 0. Withdrawal 0.35% + flat per recipient: 0.006 SOL, 0.00025 ETH on Base, 0.001 BNB, dynamic on Ethereum | Withdrawer | Relayer pays network fees on withdrawals; the flat part covers it. User pays its own deposit gas | Protocol. **Use of proceeds not published: unverified.** | [User docs](https://privacycash.mintlify.app/index.md), [Withdraw](https://privacycash.mintlify.app/sdk/withdraw.md), [live config](https://api3.privacycash.org/config) (`withdraw_fee_rate: 0.0035`, `deposit_fee_rate: 0`) |
| **Tornado Cash** (EVM, archived docs) | No protocol fee on deposit or withdrawal | Relayer sets its own fee (gas plus a premium) | Withdrawer, out of the note | Relayer pays gas and keeps its fee; direct withdrawal possible | The relayer. Separately, listed relayers pay 0.3% of each relayed withdrawal in the governance token to the staking contract, split among locked token holders (governance parameter) | [Staking doc, 2022](https://github.com/tornadocash/docs/blob/en/general/staking/README.md) |
| **Privacy Pools / 0xbow** (Ethereum) | Deposit ("vetting fee") | 0.5% of each deposit per the terms; on-chain `vettingFeeBPS` per pool, changeable by the operator | Depositor | Relayed withdrawal: relayer fee in bps up to `maxRelayFeeBPS`, paid to the relayer's own fee recipient; direct withdrawal has no fee | 0xbow (screening and operations). **Buy-back or holder payout: none published.** | [Terms](https://docs.privacypools.com/toc), [Entrypoint contract](https://github.com/0xbow-io/privacy-pools-core/blob/main/packages/contracts/src/contracts/Entrypoint.sol), [Withdrawal](https://docs.privacypools.com/protocol/withdrawal) |
| **Hinkal** (EVM, Solana) | Relayed withdrawal and swaps | Hinkal Pay: 10 bps (0.10%), shown before submit. Solana swaps: `relayer_fee + amount x variable_rate / 10,000`. **The EVM pool's percentage and the Solana `variable_rate` value are not published: unverified.** | Withdrawer / swapper | Relayer paid from the amount; self-withdrawal pays its own gas | Relayer and protocol. **Use of proceeds: unverified.** | [Hinkal Pay FAQ](https://hinkal.io/pay-app-info), [Solana instructions](https://hinkal-team.gitbook.io/hinkal/protocol/solana-program/instructions), [Whitepaper](https://hinkal.pro/Whitepaper.pdf) |
| **Umbra** (Solana) | Withdrawal, note creation, conversion, burn. Self-deposit: 0 | 35 / 16,384 of the token amount, about 0.2136% (floor rounding) | Withdrawer / sender | Relayer bps currently 0; a fixed SOL fee on note creation prefunds rent and the costliest burn path, so the relayer pays nothing out of pocket | Protocol (`ProtocolFeesConfiguration` account, admin-set). **Use of proceeds: unverified.** | [SDK pricing](https://sdk.umbraprivacy.com/pricing) |
| **Zcash** (baseline) | No protocol fee | Network fee only: ZIP 317, 5,000 zatoshis per logical action, minimum 2 actions (0.0001 ZEC) | Sender, to miners | No relayer; the sender pays the fee from the transaction | Development is funded from the block subsidy (8% community grants, 12% coinholder fund under ZIP 1016), not from transaction fees | [ZIP 317](https://zips.z.cash/zip-0317), [ZIP 1016](https://zips.z.cash/zip-1016) |
| **Houdini Swap** (contrast: aggregator, not a pool) | Per swap, inside the quote | No published rate: "all-in" quote, Houdini earns a commission back from each exchange; private swaps cost about double a no-wallet swap. Third-party reports of 0.2 to 0.5% are **unverified** | Swapper | None; partner exchanges execute | Houdini. DefiLlama shows about $6.5M cumulative fees, all counted as revenue. **Buy-back of its token: unverified from primary docs.** | [Fees & pricing](https://docs.houdiniswap.com/overview/coverage-and-economy/monetization-and-fees), [DefiLlama](https://defillama.com/protocol/houdini-swap) |

Patterns worth noting:

- The two closest shapes to ours, Nullmask and Railgun, both charge the same rate in and out and keep relayer gas separate. Ours is identical in shape; the only difference is the number.
- Everyone with a shielded-balance product charges on the way **out** at least. Privacy Cash and Umbra charge **only** on the way out, which makes depositing free and defers the fee until the user has had the benefit.
- DARKPOOL is the outlier: it earns nothing on shield or unshield and everything on in-pool swaps, which this note pool does not have.
- No pool reviewed here lends out deposits or pays yield from inside the pool. Railgun and Tornado pay token stakers from a treasury, DARKPOOL pays shielded holders from a vault its pool program owns; both are mechanisms outside a plain note pool.

---

## 3. Can this pool do it?

| Method | Verdict | Why |
| --- | --- | --- |
| Same rate on shield and unshield (Nullmask 50/50, Railgun 25/25, the 1% cap) | **Yes, a setting.** | `setProtocolFee(bps)` per chain, 0 to 100. Owner-only, no redeploy. |
| Different rate in and out (Privacy Cash 0/35, Umbra 0/21) | **No without a contract change.** | One `protocolFeeBps` covers both directions. The closest setting is a low symmetric rate. |
| Flat per-withdrawal fee (Privacy Cash 0.006 SOL, DARKPOOL 0.0009 SOL per note) | **Yes, a setting, on the relayer side.** | That is what the relayer `margin` is. It goes to the relayer, not the fee recipient, and only on relayed unshields. |
| Relayer-only, no protocol fee (Tornado) | **Yes, a setting.** | `setProtocolFee(0)` plus a relayer margin. The calculator's "Tornado" preset shows what that earns: only the margin. |
| Fee on private sends | **No without a contract change.** | The circuit's relayed-send path has no fee slot; a fee amount would reveal the asset. Not recommended even then. |
| Fee above 1% | **No without a contract change.** | `MAX_PROTOCOL_FEE_BPS` is a constant. |
| Fee on in-pool swaps (DARKPOOL) | **No without a contract change.** | There are no in-pool swaps; the handoff lists them as a later brief. |
| Add swept fees to ZEC-DARK liquidity (standing decision since 2026-10-05; replaced buy and burn) | **Yes, off-chain.** | The pool only ensures fees leave to the one fixed recipient. What the recipient does is policy: `packages/darkswap-pool/BRIEF_FEE_RECIPIENT.md`. |
| Pay token stakers from a treasury (Railgun, Tornado) | **Yes, off-chain, but out of scope.** | Same recipient-side policy; the owner chose ZEC-DARK liquidity, not payout. |
| Pay **shielded** holders from inside the pool (DARKPOOL vault) | **No without a contract change.** | Needs the pool program to own a share vault and value notes against it. This note pool has no such account. |
| Lend out deposits for yield | **No, and not recommended.** | The admin cannot move deposits; that property is the point of the review. Lending them out adds counterparty and smart-contract risk to every depositor, changes what "withdrawals always work" means, and would require a new review of the whole pool. No competitor reviewed here does it. |
| Charge a screening or vetting fee (0xbow) | **Yes, as the shield fee, in name only.** | It is the same 0 to 100 bps on shield; there is no screening step to attach it to. |

---

## 4. Worked examples

Produced by the calculator with these inputs. ETH at $2,670 and gas at 0.13 gwei are the October 2 figures in the package README; Base-class gas is shown at 0.01 gwei; SOL at $121 and 890,880 lamports rent per nullifier account (the relayer reads `getMinimumBalanceForRentExemption(0)`). Relayer margin 0 and every unshield relayed, so the relayer column is the floor. All figures are monthly, in USD, and are projections from these inputs only.

Reproduce with, for example:

```
cd lib/pool-client
node scripts/earnings-calculator.mjs --chain evm --gas-price-gwei 0.01 --shield-volume-usd 1000000 --unshield-volume-usd 1000000 --avg-size-usd 500
node scripts/earnings-calculator.mjs --chain solana --price-usd 121 --shield-volume-usd 1000000 --unshield-volume-usd 1000000 --avg-size-usd 500 --csv out/solana.csv
```

### 4.1 Base-class EVM chain, 0.01 gwei

| Scenario | Model | Protocol fees | Relayer net | Total | One user in + out | Of size |
| --- | --- | --- | --- | --- | --- | --- |
| $100k in, $100k out, $250 typical | Ours 50/50 | $1,000 | $4 | $1,004 | $2.55 | 1.02% |
| | Railgun 25/25 | $500 | $4 | $504 | $1.30 | 0.52% |
| | Privacy Cash 0/35 + flat | $350 | $271 | $621 | $1.59 | 0.64% |
| | Tornado relayer-only | $0 | $4 | $4 | $0.05 | 0.02% |
| | Cap 100/100 | $2,000 | $4 | $2,004 | $5.05 | 2.02% |
| $1M in, $1M out, $500 typical | Ours 50/50 | $10,000 | $22 | $10,022 | $5.05 | 1.01% |
| | Railgun 25/25 | $5,000 | $22 | $5,022 | $2.55 | 0.51% |
| | Privacy Cash 0/35 + flat | $3,500 | $1,357 | $4,857 | $2.47 | 0.49% |
| | Tornado relayer-only | $0 | $22 | $22 | $0.05 | 0.01% |
| | Cap 100/100 | $20,000 | $22 | $20,022 | $10.05 | 2.01% |
| $10M in, $10M out, $2,000 typical | Ours 50/50 | $100,000 | $54 | $100,054 | $20.05 | 1.00% |
| | Railgun 25/25 | $50,000 | $54 | $50,054 | $10.05 | 0.50% |
| | Privacy Cash 0/35 + flat | $35,000 | $3,392 | $38,392 | $7.72 | 0.39% |
| | Tornado relayer-only | $0 | $54 | $54 | $0.05 | 0.00% |
| | Cap 100/100 | $200,000 | $54 | $200,054 | $40.05 | 2.00% |

On Ethereum mainnet at 0.13 gwei the relayer quote per unshield is $0.62 instead of $0.05 and relayer net at $1M/$1M is about $282; the fee columns do not change.

### 4.2 Solana, SOL $121

| Scenario | Model | Protocol fees | Relayer net | Total | One user in + out | Of size |
| --- | --- | --- | --- | --- | --- | --- |
| $100k in, $100k out, $250 typical | Ours 50/50 | $1,000 | $0 | $1,000 | $2.72 | 1.09% |
| | Railgun 25/25 | $500 | $0 | $500 | $1.47 | 0.59% |
| | Privacy Cash 0/35 + flat | $350 | $290 | $640 | $1.82 | 0.73% |
| | Tornado relayer-only | $0 | $0 | $0 | $0.22 | 0.09% |
| | Cap 100/100 | $2,000 | $0 | $2,000 | $5.22 | 2.09% |
| $1M in, $1M out, $500 typical | Ours 50/50 | $10,000 | $0 | $10,000 | $5.22 | 1.04% |
| | Railgun 25/25 | $5,000 | $0 | $5,000 | $2.72 | 0.54% |
| | Privacy Cash 0/35 + flat | $3,500 | $1,452 | $4,952 | $2.69 | 0.54% |
| | Tornado relayer-only | $0 | $0 | $0 | $0.22 | 0.04% |
| | Cap 100/100 | $20,000 | $0 | $20,000 | $10.22 | 2.04% |
| $10M in, $10M out, $2,000 typical | Ours 50/50 | $100,000 | $0 | $100,000 | $20.22 | 1.01% |
| | Railgun 25/25 | $50,000 | $0 | $50,000 | $10.22 | 0.51% |
| | Privacy Cash 0/35 + flat | $35,000 | $3,630 | $38,630 | $7.94 | 0.40% |
| | Tornado relayer-only | $0 | $0 | $0 | $0.22 | 0.01% |
| | Cap 100/100 | $200,000 | $0 | $200,000 | $40.22 | 2.01% |

Solana relayer net is $0 with no margin because the quote equals the cost exactly (signature plus two rents); with free private sends it goes negative. The relayer margin is therefore not optional on Solana once sends are in use.

### 4.3 What the numbers say

- **Protocol fee income is linear in the rate and in volume; relayer income is not.** Fee income is a percentage of volume; relayer income is a flat amount per relayed unshield. At any volume above a few thousand dollars a month, the fee dominates. The relayer margin's job is to keep the relayer solvent, not to earn.
- **Per-user cost is almost entirely the protocol fee.** At $500 typical size the relayer adds $0.05 on Base and $0.22 on Solana to a $5 round trip at 50/50.
- **Railgun's 25/25 halves both income and per-user cost; the 1% cap doubles both.** There is no rate at which income rises faster than user cost, because both are the same percentage of the same amount. The sweep (`--sweep-step`) prints this as two columns side by side; the owner picks the point on the line, not an optimum.
- **The Privacy Cash shape (nothing in, more out) cannot be set on this pool** because one rate covers both directions, but its total at 0/35 is close to a symmetric 18/18. If free deposits matter for adoption, a lower symmetric rate is the available substitute.
- **Relayer-only (Tornado) earns nothing for the fee recipient.** It is a valid setting but it means no $DARK is bought and burned.

### 4.4 Exporting a real testnet month

Everything above assumes volumes. Once a testnet pool is live, the indexer records one row per public pool action (shield, unshield, deposit, private send) with its external amount, the relayer fee the sender paid, and when it happened. The exporter summarises a month of that into the calculator's own input file:

```
cd artifacts/api-server
pnpm run pool:export-volumes -- --chain base-sepolia --month 2026-09 \
  --price-usd 2670 --out /tmp/base-sepolia-2026-09.json
cd ../../lib/pool-client
node scripts/earnings-calculator.mjs --config /tmp/base-sepolia-2026-09.json
```

What it does and does not do:

- **Prices are the operator's.** Testnet assets have no market price, so `--price-usd` sets the chain's own coin and `--token-price <token>=<usd>` sets each listed token. A token with no price stops the export and is named; `--exclude-token <token>` drops it from the month, counts included, and says so. Nothing in this path calls a market provider, and none of it runs when the server starts.
- **It reads the database only.** No chain call, no proving, no signer.
- **The relayer inputs come from fees that were really paid.** `margin` is the operator's current `POOL_RELAY_MIN_FEE_<CHAIN>`; the EVM gas price and the Solana rent are read back by inverting the relayer's own quote (section 1) over the month's relayed unshields. With no relayed unshield in the chain's own coin, the calculator's defaults stand and the export says so.
- **Deposits count as shields.** Adding to an existing note pays the same fee as a shield, so the two are one direction here.
- **The record starts when the indexer first sees a chain with this table in place; there is no backfill.** The export carries the first and last action it has for the chain, so a partial month is visible rather than silent.
- **A withdrawal sent through another contract still counts.** A transact publishes no amount, so the indexer reads it back out of the call's own arguments. A batcher, a smart account or an aggregator carries those arguments somewhere inside its own calldata, so the indexer looks for the call anywhere in the transaction's input and matches it to the two notes the pool logged as spent. A transaction holding several transacts is counted once per transact.
- **Calldata is not taken as proof that a call ran.** A forwarding contract can also carry a payload it never used, or one whose call reverted, naming the same notes with a different amount. So a call found inside another contract's calldata is believed only when the pool's own logs bear it out: the two notes it created, and the protocol fee, which the pool computes from the very amount being claimed. A planted payload is charged a fee that does not match and is never counted; where no log depends on the amount (the pool's fee rate is zero, or the tree was full and the notes were discarded) the action stays a gap rather than a guess.
- **A gap is always stated.** An action the indexer saw but could not read the amounts of is recorded as unreadable and counted in the export as a known hole (`observed.unreadableActions`, plus a warning), never folded into the volumes. An RPC that simply failed is not a gap: the sync keeps its place and reads those blocks again.
- **It stays testnet.** Every export carries `observed.testnet` and the same "not a revenue claim" note the calculator prints.

`artifacts/api-server/scripts/test-pool-volumes.sh` runs the exporter against a temporary postgres and feeds its output to the calculator, so the two cannot drift apart.

---

## 5. What to set on the testnets

**Decided by the owner on October 4, 2026: 50 bps on all three testnets, with a 0.0005 SOL relayer margin on Solana devnet and no margin on either EVM chain.** The proposal below was approved as written. Any rate here can be changed later by the owner with `setProtocolFee` on each chain without redeploying; the deployment value is only the starting point. All three testnets run with development proving keys and test assets, so the fee is exercised for correctness, not for income.

### 5.1 The decision (October 4, 2026)

| Chain | `protocolFeeBps` | Relayer margin | Where the value is set |
| --- | --- | --- | --- |
| **Base Sepolia** | **50** | **0** | `PROTOCOL_FEE_BPS=50` in the deploy environment for `Deploy.s.sol`; `POOL_RELAY_MIN_FEE_BASE_SEPOLIA=0` |
| **Ethereum Sepolia** | **50** | **0** | `PROTOCOL_FEE_BPS=50` in the deploy environment for `Deploy.s.sol`; `POOL_RELAY_MIN_FEE_SEPOLIA=0` |
| **Solana devnet** | **50** | **0.0005 SOL** | fee bps argument of `initialize`; `POOL_RELAY_MIN_FEE_SOLANA_DEVNET=500000` (lamports) |

The three `POOL_RELAY_MIN_FEE_*` values were set as environment values on October 4, 2026. The two EVM zeros are the same as leaving the variable unset; they are set explicitly so the decision is visible next to the Solana one.

What the margin does to the Solana quote, read back from the relayer with the margin in place: the quote is **1,805,480 lamports** (0.0018 SOL, about $0.22 at SOL $121) per relayed unshield, made of one signature (5,000), two nullifier accounts' rent (650,240 each on devnet today) and the 500,000 margin. Without the margin it would be 1,305,480, which is the relayer's cost exactly and leaves nothing for the free private sends. Note that devnet's rent-exemption figure (650,240) is lower than the 890,880 used in section 4's Solana table, so the live devnet quote is smaller than the table's; the protocol-fee columns are unaffected.

With 50 bps and this margin, at $1M in and $1M out a month with $500 typical size, the calculator gives $10,000 a month in protocol fees, $121 a month of relayer margin, and $5.28 for a user who shields and unshields once (1.06% of the amount). Reproduce with `node scripts/earnings-calculator.mjs --chain solana --price-usd 121 --margin 0.0005 --models ours` from `lib/pool-client`.

The deploy inputs carrying these values are `packages/darkswap-pool/scripts/.env.deploy.example` (`PROTOCOL_FEE_BPS=50`, copied to `.env.deploy` by the Deployer), the devnet setup script's default fee (`--fee-bps`, 50), the fee rows of `docs/pool-testnet-setup-manual.md`, and the table in `packages/darkswap-pool/REPLIT_HANDOFF.md` (section 5, Config). Nothing under `evm/src`, `evm/script` or `solana/` was changed: `Deploy.s.sol` already defaults to 50 and reads `PROTOCOL_FEE_BPS`, and the Solana rate is an argument to `initialize`.

### 5.2 The proposal this came from

| Chain | Proposed `protocolFeeBps` | Proposed relayer margin | Reasoning |
| --- | --- | --- | --- |
| **Base Sepolia** | **50** | 0 | Matches the 50/50 shape already in the README, the Nullmask filing, and the fixtures (`e2e-evm-result.json` records `protocolFeeBps: 50`). Gas is cheap enough that the relayer's built-in 1.2x headroom covers it. Test what mainnet would run. |
| **Ethereum Sepolia** | **50** | 0 | Same rate as Base so the two EVM deployments are compared on gas alone. The relayer's 1.2x headroom over 1.5M gas is positive at any gas price, so no margin is needed to stay solvent. |
| **Solana devnet** | **50** | small, about 0.0005 SOL | Same rate, so cross-chain numbers are comparable. The Solana quote has no built-in headroom, and free private sends cost the relayer rent each time, so a margin is needed for the relayer to break even once sends are tested. Set via `POOL_RELAY_MIN_FEE_SOLANA_DEVNET` in lamports (500,000). |

Also:

- **Try 25 and 100 on one testnet during acceptance.** The owner can call `setProtocolFee` on a testnet to confirm the rate change takes effect without a redeploy, the UI shows the new fee before signing, and the fee never exceeds the cap. That is the whole value of the testnet for this question; the income figures above are what change when the mainnet rate is chosen.
- **Mainnet rate is a separate decision.** Once the testnet pools have a month of usage, export it (section 4.4) and rerun the table on observed numbers instead of the scenarios above; nothing here is a mainnet revenue estimate. The two reference points are Railgun at 25/25 (lower cost, half the income) and Nullmask at 50/50 (our current shape). Going above 50 puts a round trip above 1% of the amount, which no pool reviewed here charges on shield and unshield.
- **Proceeds:** swept fees are converted to ZEC and $DARK and added to the ZEC-DARK pool (`BRIEF_FEE_RECIPIENT.md`; decided 2026-10-05, replacing buy and burn). Not a holder payout, not lending.
- **Addresses:** no fee recipient, relayer or burn address is shown anywhere until a launch needs it. The testnet recipients can be any fresh key.
- **Copy:** every mention of these fees in the UI stays testnet-tagged, and none of it uses anonymous, untraceable, guaranteed, APY or staking.

---


## 6. Reconciled with the whitepaper (October 4, 2026)

The plain-language whitepaper page (`artifacts/solana-privacy-swap/src/pages/whitepaper-content.tsx` and its PDF under `docs/whitepaper/`) used to describe an earlier draft of the pool: a 0.25% fee on exits only, and "fees paid into the pool lift the value of every remaining share". Neither matched the reviewed contracts in section 1. The page and the PDF were revised on October 4, 2026 to state the decision in section 5: one rate of 0.5% (50 bps) on shield **and** unshield, charged on top on the way in and out of the payout on the way out, no fee on private sends, a 1% contract cap, and protocol fees kept apart from note balances and swept to the one fee recipient fixed at deployment. Depositors do not earn from fees.

What the fee recipient does with the swept fees was settled on October 5, 2026: they are added to ZEC-DARK liquidity (`BRIEF_FEE_RECIPIENT.md`), replacing the earlier buy-and-burn decision. Whitepaper v0.3 states this. The rate itself is no longer in dispute. This document and the contracts remain the reference; if the rate changes with `setProtocolFee`, section 5, the whitepaper page and its PDF have to move together.

## 7. Not recommended, and why

- **Lending deposits out.** Adds counterparty risk to every depositor, breaks the "admin cannot move funds, withdrawals always work" property the review established, and would need the entire pool re-reviewed. No competitor reviewed here does it. Out of scope and not proposed.
- **A fee on private sends.** Impossible as the circuit stands and undesirable: the fee amount would leak the asset.
- **Raising the cap.** The cap is the user's protection against a later owner. A 3% pool fee would mean changing reviewed contract code, and the comparable 3% figures elsewhere come from DEX pair trading fees on a token, not from a privacy pool.
- **Paying shielded holders from inside the pool.** DARKPOOL does this with a vault its program owns. It is a different design, and $DARK is not an asset in these pools.
