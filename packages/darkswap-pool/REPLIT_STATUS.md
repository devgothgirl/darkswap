# DarkSwap shielded pool: status from Replit

Date: 2026-10-03. Reply to: `REPLIT_HANDOFF.md` (same folder).
Scope delivered: the application layer only (client package, indexer, relayer, terminal UI, config). Nothing is published to darkswap.app yet.

## Summary

The application layer is built and tested against a local chain. No testnet is live yet: we are waiting on Matthew's deployments and on the relayer keys and RPC links. Once the deployment files, the program ID and the secrets are in place, each chain turns on with no code changes. Solana could not be tested end to end inside Replit (see Blockers).

## What was built

| Handoff section | Where it lives | State |
|---|---|---|
| 1. Client package | `lib/pool-client` (`@darkswap/pool-client`), browser and Node entry points. The package's `scripts/*.mjs` now re-export from it. | Done |
| 1. Prover | `prover.worker.js`: snarkjs runs in a Web Worker. Keys are served from the web app at `/pool-keys/` and kept in Cache Storage. snarkjs is not in the main bundle. | Done |
| 1. Activation / lock | Fixed message, `sha256(signature)`, restore from 24 words. The secret is kept in memory only (never persisted). It is dropped on Lock and after 30 minutes idle. | Done |
| 2. Indexer | `artifacts/api-server/src/lib/pool/` + `GET /api/pool/:chain/state?since=` and `GET /api/pool/chains`. Syncs on demand (suits autoscale). EVM reads events from `deployBlock`. Solana uses instruction data, as `sync()` does. Tables: `pool_commitments`, `pool_nullifiers`, `pool_fees` (`lib/db/src/schema/shielded-pool.ts`). | Done; Solana path untested on a real cluster |
| 2. Root check | Before proving, the browser rebuilds the tree and checks the root through a public RPC (`root()`/`isKnownRoot` on EVM, the pool account on Solana). If they differ, it refuses to prove. | Done |
| 3. Relayer | `GET/POST /api/pool/:chain/relay` (the GET quote includes `tokenFees` per accepted token). Simulates first, checks that the relayer address is the server's own, and checks the fee covers gas + `POOL_RELAY_MIN_FEE_<CHAIN>` (+ nullifier rent on Solana). Private sends are relayed free, with an in-memory rate limit. It logs only tx hashes and error classes, never IPs, user agents or addresses. | Done; Solana path untested on a real cluster |
| 4. Terminal UI | `artifacts/solana-privacy-swap/src/pool/`. Routes `/pool`, `/pool/:tab`, `/pool/what-stays-public`. Tabs in the specified order. Testnet banner with the exact text. Built on the DarkSwap design system. | Done |
| 5. Config | EVM from `packages/darkswap-pool/deployments/<chainId>.json`. Solana from `POOL_PROGRAM_ID_DEVNET`. Chains: Sepolia, Base Sepolia, Solana devnet (plus a local anvil chain in development only). | Done |

Protected folders (`circuits/`, `evm/src/`, `evm/script/`, `solana/`, `keys-dev/`, `fixtures/`) are unchanged. Fee math, hashing, key derivation, `dark1` addresses and note encryption are unchanged.

## Verified

- `npm test` in the package: 18 + 6 + 44 + 17 pass. The client package's tests pass (5/5).
- `e2e-evm.mjs` passes against anvil.
- `lib/pool-client/scripts/relay-e2e.mjs` passes against anvil and the real API server. It covers relayed send, relayed unshield, refusal of a below-minimum fee, and refusal of a replay (`NullifierAlreadySpent`).
- Browser test against anvil, with no wallet:
  - restore from 24 words → the notes appear;
  - private send (proved in the browser, relayed) confirmed;
  - unshield through the relayer, with the fee breakdown, confirmed;
  - the Fees tab figures appear;
  - Receive with QR;
  - What stays public;
  - Lock.
- The production-mode server starts and finds the deployment folder.
- **Fee rate and relayer margin (2026-10-04).** Confirmed on a local chain, because no testnet is deployed yet (see Blockers):
  - `/api/pool/:chain/state` takes `feeBps` from the chain, not from the deployment file: with the file left at 50, `setProtocolFee(100)` on the pool made the endpoint report 100 within one sync, and setting it back made it report 50 again.
  - The fee the pool actually kept matched the endpoint's `charged` figure exactly after a shield and a relayed unshield (50 bps of each, rounded up).
  - `/api/pool/:chain/relay` quoted `1,500,000 gas x gasPrice x 1.2` with nothing added while no margin was set, and exactly that plus the margin once one was. So the EVM "no margin" decision and the Solana margin use the same, working code path.
  - Solana's quote arithmetic was checked against live devnet without deploying: rent for a 0-byte account is 650,240 lamports today, so the relayer quotes 5,000 + 2 x 650,240 + 500,000 = **1,805,480 lamports (0.00180548 SOL)**, the figure in `REPLIT_HANDOFF.md` section 5.
  - `relay-e2e.mjs` still passes end to end: a below-quote fee is refused with the amount needed, the quoted fee is accepted, and a replay is refused.
  - `npm run check:deployment` now measures the live rate and the margin against the agreed values instead of only printing them, so the confirmation on the real chains is a single command (`npm run test:kit` covers the new checks).

## Not yet verified

- Anything involving a wallet extension in the UI: Activate by signature, Shield (including ERC-20 approve and Solana token-account creation), Sweep. The script-level tests cover shielding, but the UI buttons have not been driven with a real wallet.
- The full acceptance run on Sepolia, Base Sepolia and Solana devnet (two browser profiles; fees; sweep).
- **The agreed fee values on the three testnets themselves.** The rate and the margin are confirmed on a local chain and the check that compares them is in place, but no pool exists on Sepolia, Base Sepolia or Solana devnet, so nothing has been read off those chains. `npm run check:deployment` prints `WAIT not deployed yet` for all three. Run it the moment the deployments land: that is the confirmation, and it fails loudly if a pool charges anything other than 50 bps.
- A relayed unshield on **Solana devnet** specifically (refused below the quote, accepted at it). The equivalent is passing on a local EVM chain, and the devnet quote arithmetic is confirmed, but the Solana relayer code has never run against a cluster.
- `e2e-solana.mjs` and every Solana path.

## Blockers

1. **Deployments (Matthew):**
   - `deployments/11155111.json` and `deployments/84532.json`, from `Deploy.s.sol` with `OWNER`, `FEE_RECIPIENT` (fixed forever; same address on both chains), `PROTOCOL_FEE_BPS`, deposit limits and `GUARDIAN_DAYS`.
   - The Solana devnet program ID, after `initialize` and `list_asset` (SOL).
2. **Secrets (owner, through the Replit secrets form):**
   - `POOL_RELAYER_PRIVATE_KEY_EVM` (a new key used only for relaying; one key covers both EVM chains);
   - `POOL_RELAYER_KEYPAIR_SOLANA` (JSON array of 64 numbers);
   - `RPC_URL_SEPOLIA`, `RPC_URL_BASE_SEPOLIA`;
   - optional `RPC_URL_SOLANA_DEVNET`.
   The relayer wallets need testnet ETH on both EVM chains and devnet SOL.
3. **Solana tooling in Replit:** `solana-cli` is 1.18 (Agave 4.x is needed), and `cargo build-sbf` cannot install platform-tools. `e2e-solana.mjs` must run on Matthew's machine. Devnet will be the first real test of the Solana UI and server code.

## Deviations and limits to review

- **Token unshields (both routes, added 2026-10-03).**
  - *Through the relayer:* the fee is paid in the withdrawn token. The server converts its native-coin cost at an operator-set rate, `POOL_RELAY_TOKEN_RATES_<CHAIN>` = JSON `{ "<token or mint>": "<whole tokens per 1 native coin>" }`. Tokens without a rate are not accepted by the relayer. There is no automatic price feed (testnet tokens have no market price); mainnet needs a live price source. On Solana the relayer's own token account for each accepted mint must exist; the quote leaves out tokens where it does not.
  - *From the user's own wallet:* no relayer and no relayer fee; the wallet pays gas and is shown on chain as the sender. The UI explains this and lists it on "What stays public". It is the only route for tokens the relayer does not accept, and the fallback if the relayer is down.
  - Verified on anvil: `lib/pool-client/scripts/relay-token-e2e.mjs` (token fee quoted at the rate, low token fee refused, relayed token unshield pays the relayer in the token, self-submitted token unshield with change found). Not verified: the Solana token routes, and the wallet route in the browser with a real extension.
- **Fee policy and addresses (owner decision, 2026-10-03).**
  - Swept fees are for **buying and burning $DARK**. The Fees tab says "Planned use: Buy and burn $DARK". The fee recipient contract that does this (including the bridge step from EVM to Solana) is still to be written; the brief is `BRIEF_FEE_RECIPIENT.md`.
  - **cbZEC is not listed** in the Base pool.
  - **No addresses shown until needed.** This departs from the handoff's Fees tab spec: the tab no longer shows or links the fee recipient, and `/api/pool/:chain/state` no longer returns it. The Solana sweep reads it from the pool account instead. The pool contract and relayer addresses are still served to the browser because transactions need them, but they are not displayed. All of these remain readable on chain by anyone.
- **Analytics script.** Replit adds its analytics script to the published site. Pool pages switch it off (`umami.disabled`), but the browser still downloads it. Fully meeting rule 3 means turning off analytics in Publishing settings, which applies to the whole site.
- **Fonts:** now bundled with the site (no Google Fonts request on any page). Done 2026-10-03.
- **Root check RPC.** The browser's root check goes to public RPCs (publicnode, sepolia.base.org, api.devnet.solana.com), which can be overridden with `POOL_PUBLIC_RPC_<CHAIN>`. Those providers see a root read and the user's IP.
- **Navigation:** the main menu now links to `/pool`, tagged TESTNET. Done 2026-10-03.
- **Nothing published.** darkswap.app still runs the older build, which also lacks earlier unpublished work (Dark Pool popup, airdrop figures). Publishing creates the three pool tables in production; the owner approves the schema change in the Publish screen.

## Suggested next steps (in order)

The step-by-step version of this list, for a Deployer and the Replit owner with no prior tool knowledge, is `docs/pool-testnet-setup-manual.md` (workspace root). It comes with `npm run deploy:evm`, `npm run setup:devnet` and `npm run check:deployment` in this package (added 2026-10-04).

1. Matthew deploys the three testnets, runs `e2e-solana.mjs` against devnet or a local validator, and sends the two JSON files and the program ID.
2. Add the secrets and fund the relayers. The chains turn live automatically in the Replit preview.
3. Run the handoff's acceptance flow on each chain with real wallets (two profiles, fees, sweep, restore from words). Fix what Solana turns up.
   - Fee rates: decided by the owner on 2026-10-04 — **50 bps on all three testnets**, a 0.0005 SOL relayer margin on Solana devnet (`POOL_RELAY_MIN_FEE_SOLANA_DEVNET=500000`, set) and no EVM margin. Deploy with `PROTOCOL_FEE_BPS=50`; the inputs are tabulated in `REPLIT_HANDOFF.md` (section 5, Config) and the reasoning in `docs/pool-earnings-models.md` section 5. Projections come from `lib/pool-client/scripts/earnings-calculator.mjs` (offline).
   - **Confirm it on the chains before anyone deposits:** `npm run check:deployment` reads the rate off each pool and the margin out of the environment and reports anything that is not the agreed value, naming the `setProtocolFee` / `set_fee` call that corrects it. A wrong rate never needs a redeploy. The agreed values live in one table at the top of `scripts/check-deployment.mjs`; changing the decision means changing that table and the handoff's together. Part 7 of `docs/pool-testnet-setup-manual.md` has the tick boxes, including comparing the Solana relay quote against `/api/pool/solana-devnet/relay`.
   - Trying `setProtocolFee` at 25 and 100 on one testnet during acceptance is still worth doing; the check will report both as a gap until it is set back to 50, which is the behaviour you want to see.
4. Owner approved resolving all open items (2026-10-03): fonts bundled, menu link added, both token-unshield routes built, public RPC defaults kept. Analytics must be turned off by the owner in Publishing settings. Set `POOL_RELAY_TOKEN_RATES_<CHAIN>` for any test token the relayer should accept.
5. Publish (owner clicks Publish).
6. Next briefs listed in the handoff as out of scope: Dark Inbox funding (Solana → EVM pool), viewing keys, recovery page, in-pool swaps, the $DARK fee-recipient policy contract, mainnet (needs production proving keys and an audit).

## Notes for other agents

- Read `replit.md` → "Shielded pool (testnet)" for paths, secrets and the local test recipe.
- Never edit the protected package folders. Never run `build-circuit.sh` (it regenerates the proving keys).
- `e2e-*.mjs` rewrite `fixtures/e2e-*-result.json`; restore them with `git checkout` afterwards.
- Pool UI: call `initPoseidon()` before any key or tree work. Keep the `Buffer` shim imported first. Avoid Radix portal components (the theme is scoped to the pool root).
- Copy rules still apply: tag everything testnet; never use anonymous, untraceable, guaranteed, APY or staking.
