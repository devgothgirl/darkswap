# Replit handoff: DarkSwap shielded pools

Target Repl: **Dark Swap – Privacy Swap** (`artifacts/api-server`, `artifacts/solana-privacy-swap`, `lib/*`).
Drop this folder into the Repl as `packages/darkswap-pool/` (keep it whole; its tests must keep passing with `npm test`).

## Paste this into Replit Agent

```
You are integrating a finished shielded-pool codebase into the DarkSwap app. The folder packages/darkswap-pool/ contains the circuit, the EVM pool contract, the Solana pool program, a wallet module and two end-to-end scripts that already pass. Read packages/darkswap-pool/REPLIT_HANDOFF.md first and follow it exactly.

Your job is the application layer only:
1. packages/darkswap-pool/scripts/{lib,wallet,evm,solana}.mjs become a browser-safe client package (@darkswap/pool-client). Keep every function's behaviour; the test files are the spec.
2. Add a relayer and an indexer to artifacts/api-server (routes listed in the handoff).
3. Build the terminal UI in artifacts/solana-privacy-swap: Activate, Shield, Send, Unshield, Receive, Activity, Fees. Flows must match scripts/e2e-evm.mjs and scripts/e2e-solana.mjs step by step.
4. Everything is labelled TESTNET until told otherwise.

Do not modify circuits/, evm/src/, evm/script/, solana/, keys-dev/ or fixtures/. Do not change fee math, hashing, key derivation, address format or note encryption. Do not log IP addresses or wallet addresses on the relayer. Never use the words anonymous, untraceable or guaranteed in copy. If something in the handoff is impossible in the Repl, stop and say so instead of working around it.
```

## What exists (do not rebuild)

| Piece | Where | Proof |
| --- | --- | --- |
| Note circuit (Groth16, 2 in / 2 out, depth 26) | `circuits/`, keys in `keys-dev/` | 18 tests, independent review |
| EVM pool for Ethereum and Base | `evm/src/DarkPool.sol` | 44 Solidity tests, `scripts/e2e-evm.mjs` |
| Solana pool program | `solana/pool/` | 17 Rust tests, `scripts/e2e-solana.mjs` |
| Wallet: keys, `dark1` addresses, note encryption, scanning, planning | `scripts/wallet.mjs`, `scripts/lib.mjs` | `scripts/wallet.test.mjs` |
| Chain adapters: events/instructions, tree sync, proving | `scripts/evm.mjs`, `scripts/solana.mjs` | the two e2e scripts |
| Protocol fee on shield and unshield, swept to a fixed recipient | both pools | both e2e scripts |

Read `README.md` for the design, costs and review findings. The e2e scripts are the authoritative description of every user flow: they shield, send privately, unshield with a relayer fee, replay-attack, tamper, pause, sweep fees, and check the books.

## What Replit builds

### 1. Client package `@darkswap/pool-client`

Move `scripts/lib.mjs`, `wallet.mjs`, `evm.mjs`, `solana.mjs` into a package that runs in the browser and in Node.

- Replace `node:crypto` `randomBytes` with `crypto.getRandomValues` (available in Node 22 and browsers). Replace `Buffer` with `Uint8Array` helpers or ship the `buffer` polyfill; `hexToBytes`/`toHex` from viem are fine on the EVM side.
- The prover: `snarkjs.groth16.fullProve` with `keys-dev/transaction2.wasm` (3 MB) and `keys-dev/transaction2.zkey` (10 MB) served as static assets and cached in the browser (Cache Storage). Prove in a Web Worker; 2 to 5 seconds on a laptop.
- Keep the Node entry points working so `npm test` and both e2e scripts still pass against the package.
- Key activation: `new Keys(secret)` where `secret = sha256(wallet signature over the fixed message)`. Message text, exactly: `DarkSwap shielded balance v1\nThis signature is your spending key. Only sign it on darkswap.app or darkswap.world.` Chain id and wallet address are NOT part of the message (the same wallet must open the same balance on any device). Also accept 24 BIP-39 words that encode the 32-byte secret.
- Lock: drop the secret from memory on Lock and after 30 minutes idle. Never persist the secret unencrypted; if persisted, encrypt with a passphrase.

### 2. Indexer in `artifacts/api-server`

Browsers must not scan a chain from genesis on every load. The server keeps the public record and the browser verifies it.

- `GET /pool/:chain/state` → `{ nextIndex, root, commitments: [{commitment, index, encryptedOutput}], spentNullifiers: [...], assets: [...], feeBps, feeRecipient, protocolFees }`
  - EVM: from `NewCommitment`, `NewNullifier`, `AssetListed`, `ProtocolFeeCharged`, `ProtocolFeesCollected` events (ABI in `evm.mjs`), from `deployBlock` in `deployments/<chainId>.json`.
  - Solana: exactly as `sync()` in `solana.mjs` does it, from instruction data, never from logs (logs can be cut off; the e2e test proves it).
  - Support `?since=<index>` so clients fetch only new leaves.
- The browser rebuilds the tree from the commitments and checks the root against the chain (`root()` on EVM, the pool account on Solana) before proving. If they differ, show an error and refuse to prove.
- Poll or subscribe; keep a cache in the existing database (`lib/db`): tables `pool_commitments(chain, index, commitment, encrypted_output, tx)`, `pool_nullifiers(chain, nullifier, tx)`, `pool_fees(chain, token, kind, amount, tx)`.

### 3. Relayer in `artifacts/api-server`

- `POST /pool/:chain/relay` body: the exact `transact` arguments (`proof`, `ext` on EVM; the instruction bytes and account list on Solana).
- Before sending: simulate; check `ext.relayer` (EVM) / the relayer account (Solana) is the server's relayer key; check the fee covers gas plus the configured margin (`POOL_RELAY_MIN_FEE_<CHAIN>`); on Solana check the fee also covers the two nullifier accounts' rent (about 0.0018 SOL); reject anything else with a plain error. Private sends carry no fee: relay them free up to a rate limit, as darkpool.ag does.
- Rate limit in memory only. Do not store IPs, user agents or wallet addresses. Log only tx hashes and errors.
- Return the tx hash / signature and let the client confirm on its own.
- Secrets: `POOL_RELAYER_PRIVATE_KEY_EVM`, `POOL_RELAYER_KEYPAIR_SOLANA`, `RPC_URL_<CHAIN>`. Same server-side policy as `NEAR_INTENTS_API_KEY`.

### 4. Terminal UI in `artifacts/solana-privacy-swap`

Tabs, in order: **Activate, Shield, Send, Unshield, Receive, Activity, Fees.** Use the existing DarkSwap design system (`artifacts/darkswap-design-system`).

- **Activate:** connect wallet (Phantom/Solflare for Solana; MetaMask/Rabby/Coinbase for EVM) → sign the fixed message → show the `dark1…` address and the "Back up 24 words" prompt. Restore-from-words path. Lock button.
- **Shield:** asset picker from listed assets; amount; show "you pay amount + 0.5% protocol fee" (read `protocolFeeBps` / pool account, never hard-code); the deposit is public; one-time deposit key per deposit (`planShield` with `nextDepositNumber`).
- **Send:** paste a `dark1…` address (checksum errors shown); amount; free, relayed; asset hidden. Coin selection is at most two notes; if more are needed, offer "merge notes" (a send to yourself).
- **Unshield:** destination address; amount; shows protocol fee and relayer fee separately and the net the recipient receives; on Solana call `checkSolRecipient` first; token recipients on Solana need an existing token account (create it first, separate transaction).
- **Receive:** the `dark1…` address with a QR, and a plain explanation of what stays public.
- **Activity:** this wallet's notes (unspent, spent), with tx links. Nothing about other users.
- **Fees:** per chain and asset: protocol fee rate, fees accrued and not yet swept, fees swept, fee recipient address, a "Sweep now" button (anyone can call it) and the link to the fee recipient. This is the public record for $DARK holders.
- A "What stays public" page copied in spirit from `darkpool.ag/docs#privacy`: deposits, unshields, amounts and destinations are public; which wallet made a private send, who holds what, and links between deposits and later actions are not.

### 5. Config

- EVM addresses come from `deployments/<chainId>.json` written by `forge script script/Deploy.s.sol:Deploy` (fields: `pool`, `verifier`, `token`, `owner`, `feeRecipient`, `protocolFeeBps`, `deployBlock`). Load them, do not hard-code.
- Solana: `POOL_PROGRAM_ID_<CLUSTER>`; PDAs derive from it (`pdas()` in `solana.mjs`).
- Chains at launch: Sepolia, Base Sepolia, Solana devnet. Matthew deploys; the files and ids arrive from him.

#### Fee values to deploy with (owner decision, 2026-10-04)

The owner approved the proposal in `docs/pool-earnings-models.md` section 5: **50 bps on all three testnets**, a **0.0005 SOL** relayer margin on Solana devnet, and **no margin** on either EVM chain. The rate is changeable afterwards with `setProtocolFee` (EVM) / `set_fee` (Solana) without redeploying.

| Input | Value | Where it goes |
| --- | --- | --- |
| `PROTOCOL_FEE_BPS` | `50` | `scripts/.env.deploy` on the Deployer's laptop (the committed `.env.deploy.example` already carries 50), read by `Deploy.s.sol` on both EVM chains. It is also the script's default, so an unset variable gives the same deployment. The written `deployments/<chainId>.json` must come back with `"protocolFeeBps": 50`. |
| Solana `initialize` fee bps | `50` | `npm run setup:devnet` on devnet; 50 is its default, so `--fee-bps` is only needed to change it. |
| `POOL_RELAY_MIN_FEE_SOLANA_DEVNET` | `500000` (lamports) | Replit environment. Set 2026-10-04. |
| `POOL_RELAY_MIN_FEE_SEPOLIA`, `POOL_RELAY_MIN_FEE_BASE_SEPOLIA` | `0` | Replit environment. Set 2026-10-04; the same as leaving them unset, written out so the decision is visible. |

The relayer quote on Solana devnet with that margin is 1,805,480 lamports (0.0018 SOL) per relayed unshield: one signature, two nullifier accounts' rent, plus the margin. No fee recipient, relayer or burn address is shown in any user-facing copy.

## Interfaces you will need

- **Public inputs, in order:** `root, publicAmount, extDataHash, publicAssetId, inputNullifier[0], inputNullifier[1], outputCommitment[0], outputCommitment[1]`.
- **Fee math:** `fee = ceil(amount * bps / 10000)`; `protocolFeeOn()` in `wallet.mjs`. Shield: depositor pays `amount + fee`, note is `amount`. Unshield: recipient receives `|extAmount| - fee`; relayer fee is separate and comes from the notes too.
- **EVM:** full ABI in `evm.mjs` (`poolAbi`). `extDataHash` must be computed with `extDataHash(ext, chainId, pool)` from `evm.mjs`; it is checked on-chain.
- **Solana:** instruction tags 0 initialize, 1 list_asset, 2 update_asset, 3 set_paused, 4 set_admin, 5 shield, 6 transact, 7 set_fee, 8 collect_fees; encoders in `solana.mjs`. Pool account: fee bps at byte 52, fee recipient at 56..88, tree from 88. Asset account: `balance` at 96, `minDeposit` at 104, `fees` at 112.
- **Transaction size on Solana:** an unshield is 972 to 1,170 bytes of the 1,232 legacy limit. Do not add instructions to those transactions; put compute-budget first (already done in the scripts).

## Rules

1. Never touch `circuits/`, `evm/src/`, `evm/script/`, `solana/`, `keys-dev/`, `fixtures/`. Changing any of them changes what was reviewed.
2. `keys-dev/` are development keys. The UI must show a banner: "Testnet. Development proving keys. Do not deposit real funds."
3. No analytics or third-party scripts on pool pages. No wallet SDK that phones home on page load.
4. Copy rules: tag everything `testnet` or `live`; no `anonymous`, `untraceable`, `guaranteed`, `APY`, `staking`.
5. Keep the existing NEAR Intents and Houdini routes untouched; the pool is a new section.

## Acceptance

- `npm test` in `packages/darkswap-pool` still passes (18 + 6 + 44 + 17).
- `node scripts/e2e-evm.mjs` and `node scripts/e2e-solana.mjs` still pass against local chains when run from the package (see README for the commands).
- In the UI against the testnets: activate → shield 0.01 ETH → send half to a second browser profile's `dark1` address → the second profile unshields it to a fresh address through the relayer → Fees tab shows the two fees and a sweep works. Same on Solana devnet.
- A fresh profile that restores from the 24 words sees the same notes.
- The relayer refuses a request whose fee is below its minimum, and a replayed request (`NullifierAlreadySpent`).

## Not in this handoff

Dark Inbox funding from Solana into the EVM pool, viewing keys, the recovery page, in-pool swaps, the fee recipient's $DARK policy contract, mainnet. Each comes as its own brief.
