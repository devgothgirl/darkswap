# DarkSwap shielded pool: testnet set-up manual (TESTNET)

This manual takes the shielded pool from "nothing deployed" to "published on darkswap.app, tagged testnet". It is written for people who have not used Foundry or the Solana tools before. Every command says which machine it runs on and what success looks like.

Everything in this manual is **testnet**: test networks, test coins with no value, and development proving keys. The site shows the banner "Testnet. Development proving keys. Do not deposit real funds." the whole time.

**Two roles.**

- **Deployer**: anyone with a laptop. Deploys the pool to the three test networks and sends two small files and one block of text back. Needs about half a day the first time, mostly waiting on installs and faucets.
- **Replit owner**: the person who owns the Replit project. Adds the files and the secrets, checks, publishes. Needs about one hour, plus the acceptance walkthrough.

**Three rules that keep everyone safe.**

1. A private key goes into exactly one place: the Replit **Secrets** form (owner) or the local settings file on the Deployer's own laptop. Never into chat, email, tickets, screenshots or this manual.
2. Four different wallets, four different jobs: the **deployer** wallet (throwaway, pays for the deployment), the **owner** wallet (long term, controls the pool), the **fee recipient** (long term, receives swept fees), and the **relayer** wallets (throwaway, pay gas for users). Never reuse one for another job.
3. The **fee recipient is fixed forever** in each pool. It cannot be changed later. It must be the **same address on Sepolia and Base Sepolia**. Decide it before deploying.

Words used in this manual: a **testnet** is a copy of a blockchain for testing, with coins that have no value. A **faucet** is a website that gives out testnet coins for free. An **RPC URL** is the web address a program uses to talk to a blockchain. A **private key** is the secret that controls a wallet; whoever has it owns the wallet. A **program ID** is the address of a program on Solana. A **relayer** is our server wallet that submits users' shielded transactions so the user's own wallet never appears on chain.

---

## Part 0. One-page checklist

Print this page. Tick as you go. Each line points to the part with the details.

**Deployer**

- [ ] Tools installed: Git, Node 22+, Foundry, Rust, Agave Solana CLI (Part 1)
- [ ] Repository cloned, `pnpm install --frozen-lockfile` at the repository root, `forge-std` cloned (Part 1)
- [ ] Two throwaway wallets made: EVM deployer key, Solana upgrade-authority keypair (Part 1)
- [ ] Owner address and fee recipient address received from the Replit owner, in writing (Part 1)
- [ ] Deployer wallet funded: 0.1 Sepolia ETH, 0.05 Base Sepolia ETH; authority wallet funded: about 5 devnet SOL (Part 1)
- [ ] Sepolia deployed: `deployments/11155111.json` exists (Part 2)
- [ ] Base Sepolia deployed: `deployments/84532.json` exists (Part 3)
- [ ] Solana devnet deployed and set up: program ID, SOL listed, handoff block printed (Part 4)
- [ ] `npm run check:deployment` shows no FIX lines for the three chains (Part 4)
- [ ] Two JSON files and the Solana handoff block sent to the Replit owner; local settings file deleted (Part 5)

**Replit owner**

- [ ] Owner wallet has called `acceptOwnership()` on both EVM pools (Part 6)
- [ ] Two JSON files placed in `packages/darkswap-pool/deployments/` (Part 6)
- [ ] Relayer wallets created, their addresses noted (Part 6)
- [ ] Secrets added: `POOL_PROGRAM_ID_DEVNET`, `RPC_URL_SEPOLIA`, `RPC_URL_BASE_SEPOLIA`, `POOL_RELAYER_PRIVATE_KEY_EVM`, `POOL_RELAYER_KEYPAIR_SOLANA` (Part 6)
- [ ] Relayer wallets funded: 0.1 ETH on each EVM testnet, 1 devnet SOL (Part 6)
- [ ] `npm run check:deployment` in the Replit shell: all PASS (Part 7)
- [ ] `/api/pool/chains` shows `live: true` three times; `/pool` lists the three chains without "soon" (Part 7)
- [ ] Acceptance walkthrough done on each chain (Part 8)
- [ ] Pre-publish items: analytics off, token rates set, schema change approved (Part 9)
- [ ] Published (Part 10)

---

## Part 1. What you need (Deployer)

### 1.1 Tools

Install these once on the Deployer laptop (macOS or Linux; on Windows use WSL).

| Tool | Why | Install |
|---|---|---|
| Git | to download the code | https://git-scm.com/downloads |
| Node.js 22 or newer | runs the helper scripts | https://nodejs.org (choose the LTS version) |
| Foundry (`forge`, `cast`) | deploys the EVM contracts | in a terminal: `curl -L https://foundry.paradigm.xyz \| bash` then open a new terminal and run `foundryup` |
| Rust | builds the Solana program | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Agave Solana CLI (version 2 or newer; the old 1.18 does not work) | builds and deploys the Solana program | `sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"` then follow the PATH hint it prints |

Check them. **Deployer laptop:**

```bash
node --version      # v22 or higher
forge --version     # any version prints
cast --version
cargo --version
solana --version    # solana-cli 2.x or higher
```

Success: each line prints a version. If one prints "command not found", open a new terminal window and try again; if it still fails, redo that install.

### 1.2 The code

**Deployer laptop:**

```bash
git clone <repository URL the Replit owner gives you> darkswap
cd darkswap
corepack enable
pnpm install --frozen-lockfile
cd packages/darkswap-pool
git clone --depth 1 https://github.com/foundry-rs/forge-std evm/lib/forge-std
npm run check:deployment
```

One root `pnpm install --frozen-lockfile` installs both the pool toolkit and its shared client using the audited workspace lockfile and security patches. Do not install them separately with npm, which bypasses those patches. Success: the install ends without "ERR", the folder `evm/lib/forge-std/src` exists, and `npm run check:deployment` prints three `WAIT not deployed yet` lines (nothing is deployed yet; that is expected). If it prints `FIX packages are not installed yet`, run the install command it names. All later Deployer commands run from this folder, `packages/darkswap-pool`.

Protected folders: `circuits/`, `evm/src/`, `evm/script/`, `solana/`, `keys-dev/` and `fixtures/` were reviewed as they are. Do not edit anything inside them. The helper scripts never touch them.

### 1.3 Accounts and addresses

Before deploying you need two **addresses** from the Replit owner, in writing (a message is fine; addresses are public):

- the **owner** address: an EVM address the owner controls long term (a hardware wallet or main wallet is ideal). It will control both EVM pools. It must be different from the deployer wallet.
- the **fee recipient** address: an EVM address that receives swept protocol fees. Fixed forever. Same on both EVM chains. The current plan is to point it at a contract that buys and burns $DARK; until that contract exists, use a long-term wallet the owner controls. For Solana you need a second fee recipient: a Solana address the owner controls long term.

Write them down here:

```
OWNER (EVM):                 0x...
FEE RECIPIENT (EVM):         0x...   same on Sepolia and Base Sepolia
FEE RECIPIENT (Solana):      ...
```

### 1.4 Two throwaway wallets (Deployer)

These pay for the deployment and are thrown away afterwards. Make them fresh; never use a wallet that holds real funds.

**Deployer laptop:** an EVM deployer wallet:

```bash
cast wallet new
```

Success: it prints `Address:` and `Private key:`. Keep both in a password manager for the day. The private key goes into one file only (Part 2). The address is public; you will fund it.

**Deployer laptop:** a Solana upgrade-authority keypair (this wallet deploys the program and becomes its admin):

```bash
mkdir -p .keys
solana-keygen new --no-bip39-passphrase -o .keys/upgrade-authority.json
solana config set --url devnet --keypair .keys/upgrade-authority.json
solana address
```

Success: `solana address` prints a Solana address. The `.keys/` folder is ignored by git. Keep the file; the Solana pool's admin is this key until you hand it over (see Part 11).

### 1.5 Faucets and amounts

Fund the two throwaway wallets with test coins. Start this early: faucets are slow and have daily limits.

| Network | Wallet to fund | Amount | Faucets |
|---|---|---|---|
| Sepolia | EVM deployer address | 0.1 ETH (0.05 minimum) | https://cloud.google.com/application/web3/faucet/ethereum/sepolia, https://www.alchemy.com/faucets/ethereum-sepolia, https://sepolia-faucet.pk910.de (mining faucet, no account) |
| Base Sepolia | EVM deployer address (same address) | 0.05 ETH | https://www.alchemy.com/faucets/base-sepolia, https://portal.cdp.coinbase.com/products/faucet, or bridge Sepolia ETH at https://superbridge.app/base-sepolia |
| Solana devnet | Solana upgrade-authority address | about 5 SOL | **Deployer laptop:** `solana airdrop 2` (repeat; devnet allows a few per day), or https://faucet.solana.com |

Check the balances. **Deployer laptop:**

```bash
cast balance <deployer address> --rpc-url https://ethereum-sepolia-rpc.publicnode.com --ether
cast balance <deployer address> --rpc-url https://sepolia.base.org --ether
solana balance
```

Success: at least 0.05, 0.05 and about 5.

Why 5 SOL: deploying a Solana program costs rent of about twice the program file's size, which is a few SOL on devnet. The pool set-up itself needs under 0.1 SOL.

### 1.6 RPC URLs

For the deployment the public endpoints are enough:

- Sepolia: `https://ethereum-sepolia-rpc.publicnode.com`
- Base Sepolia: `https://sepolia.base.org`
- Solana devnet: `https://api.devnet.solana.com`

The Replit server later needs its own EVM endpoints (Part 6). A free account at https://www.alchemy.com or https://www.infura.io gives Sepolia and Base Sepolia URLs.

---

## Part 2. Deploy Sepolia (Deployer)

Sepolia is the Ethereum test network. Its chain ID is 11155111.

**Deployer laptop:** create the settings file from the committed example.

```bash
cp scripts/.env.deploy.example scripts/.env.deploy
```

Open `scripts/.env.deploy` in a text editor and fill in:

| Line | Put |
|---|---|
| `RPC_URL=` | `https://ethereum-sepolia-rpc.publicnode.com` |
| `DEPLOYER_PRIVATE_KEY=` | the private key from `cast wallet new` (starts with `0x`, 66 characters) |
| `OWNER=` | the owner address from Part 1.3 |
| `FEE_RECIPIENT=` | the EVM fee recipient address from Part 1.3 |
| `PROTOCOL_FEE_BPS=50` | leave as is: the owner decided 50 bps (0.5%) for all three testnets on 2026-10-04. Maximum 100 |
| `GUARDIAN_DAYS=30` | leave as is |
| `ETH_MIN_DEPOSIT`, `ETH_MAX_DEPOSIT`, `ETH_CAP` | leave as is (0.001 ETH, 1 ETH, 10 ETH) |
| `TEST_TOKEN=true` | leave as `true`: it also deploys a test token (tUSD) to test token flows |
| `SANCTIONS_LIST=` | leave empty on testnet |

This file is ignored by git and holds a private key. Delete it in Part 5.

**Deployer laptop:** run the deployment.

```bash
npm run deploy:evm
```

What it does: checks the settings, the tools, the network and the deployer balance; refuses an empty owner or fee recipient, or one that equals the deployer; refuses any network other than Sepolia and Base Sepolia (a mainnet URL is rejected before anything is sent); refuses to overwrite an existing deployment file; then runs the reviewed Foundry script `evm/script/Deploy.s.sol` unchanged and prints the result.

Success looks like:

```
  PASS  settings read from scripts/.env.deploy
  PASS  owner, fee recipient and limits look well-formed
  PASS  forge found ...
  PASS  RPC reachable: Sepolia (chain id 11155111)
  PASS  deployer balance 0.1 ETH (at least 0.05 ETH needed)
  ...
ONCHAIN EXECUTION COMPLETE & SUCCESSFUL.
==============================================================
 Done. Send this file to the Replit owner:
   .../packages/darkswap-pool/deployments/11155111.json
==============================================================
{ "chainId": 11155111, "pool": "0x...", "feeRecipient": "0x...", ... }
```

If a line says `FIX`, do what it says and run the command again. Nothing is deployed until every check passes.

Takes 1 to 5 minutes. The deployment uses about 18 million gas (five transactions).

Keep the printed `acceptOwnership` line: the Replit owner needs it in Part 6.

---

## Part 3. Deploy Base Sepolia (Deployer)

Base Sepolia is the test network of Base. Its chain ID is 84532. Same steps, one line changed.

**Deployer laptop:** in `scripts/.env.deploy`, change only:

```
RPC_URL=https://sepolia.base.org
```

Keep `OWNER` and `FEE_RECIPIENT` exactly as in Part 2 (the fee recipient must be the same on both chains). Then:

```bash
npm run deploy:evm
```

Success: the same PASS list, ending with `deployments/84532.json` printed. Open both files and confirm `feeRecipient` is identical in `11155111.json` and `84532.json`.

---

## Part 4. Deploy Solana devnet (Deployer)

Devnet is Solana's test network. These steps cannot run inside Replit (its Solana tools are too old), which is why the Deployer does them.

### 4.1 Build the program

**Deployer laptop:**

```bash
(cd solana/pool && cargo build-sbf --sbf-out-dir "$PWD/target/deploy" -- --locked)
```

Success: ends with no `error:` and the files `solana/pool/target/deploy/darkswap_pool.so` and `solana/pool/target/deploy/darkswap_pool-keypair.json` exist. The first build downloads the Solana platform tools and can take 10 minutes.

The crates share the committed `solana/Cargo.lock`; `--locked` prevents an
unreviewed dependency update. The explicit output directory preserves the
existing deployment/keypair locations despite the workspace change. Keep any
existing program keypair: do not generate a replacement as part of this
dependency migration. Before deployment, rerun the validator/devnet end-to-end
checks and review the changed dependency graph; host tests alone are not enough.

### 4.2 Deploy it

**Deployer laptop:** (the CLI is already set to devnet and the upgrade-authority keypair from Part 1.4)

```bash
solana program deploy solana/pool/target/deploy/darkswap_pool.so \
  --program-id solana/pool/target/deploy/darkswap_pool-keypair.json
```

Success: prints `Program Id: <address>`. Write it down: it is the **program ID**. The paying wallet becomes the program's upgrade authority, which is the only wallet allowed to initialize the pool.

If it stops with "insufficient funds", run `solana airdrop 2` again (or use https://faucet.solana.com) and rerun the same command; it resumes.

### 4.3 Initialize the pool and list SOL (one command)

**Deployer laptop:** first a dry run, which reads the chain and sends nothing:

```bash
npm run setup:devnet -- --program <PROGRAM_ID> --authority .keys/upgrade-authority.json \
  --fee-recipient <SOLANA FEE RECIPIENT from Part 1.3> --test-token --dry-run
```

Success: `DONE program found; the keypair is its upgrade authority`, then `WOULD initialize ...`, `WOULD list SOL ...`, and a preview of the handoff block. No `FIX` lines.

Then the real run (same command without `--dry-run`):

```bash
npm run setup:devnet -- --program <PROGRAM_ID> --authority .keys/upgrade-authority.json \
  --fee-recipient <SOLANA FEE RECIPIENT> --test-token
```

What it does: sends `initialize` (admin = your authority key, fee 0.5%, guardian window 30 days, the fee recipient you gave), lists SOL (minimum deposit 0.01 SOL, maximum 5 SOL, pool cap 50 SOL), creates a 6-decimal test token (tTEST), mints 1,000,000 of it to your authority wallet and lists it. Options: `--fee-bps`, `--guardian-days`, `--sol-min`, `--sol-max`, `--sol-cap` (in SOL), `--test-token <existing mint>`; leave `--test-token` out to list only SOL.

Safe to run again: if the pool is already initialized or SOL is already listed, it prints `DONE already ...` and moves on instead of failing. The test token's keypair is saved to `.keys/test-mint-<program id>.json` before anything is sent, so a second run (or a run that stopped halfway) reuses the same mint instead of creating another. Keep that file with the authority keypair.

Success looks like:

```
==============================================================
 Done. Send this block to the Replit owner:
==============================================================
 Chain            Solana devnet (TESTNET)
 Program ID       ...
 Fee rate         50 bps (0.50%)
 Fee recipient    ... (fixed forever)
 Listed assets
   - SOL    (native)  min 0.01 SOL, max 5 SOL, cap 50 SOL
   - tTEST  <mint>    min 1 tTEST, max 100,000 tTEST, cap 1,000,000 tTEST
 Replit secret    POOL_PROGRAM_ID_DEVNET=...
 Optional secret  POOL_RELAY_TOKEN_RATES_SOLANA_DEVNET={"<mint>":"150"}
==============================================================
```

Copy the whole block.

### 4.4 Check all three chains

**Deployer laptop:**

```bash
POOL_PROGRAM_ID_DEVNET=<PROGRAM_ID> \
RPC_URL_SEPOLIA=https://ethereum-sepolia-rpc.publicnode.com \
RPC_URL_BASE_SEPOLIA=https://sepolia.base.org \
npm run check:deployment
```

Success: every chain shows `PASS pool is live ...`, `PASS charges 50 bps (0.50%), the agreed rate (read from the chain)`, the listed assets, and at the end `fee recipient is the same on sepolia and base-sepolia`. Three lines are expected at this stage and are not errors:

- `FIX ownership has not been accepted` on each EVM chain: the owner does that in Part 6.
- `WAIT POOL_RELAYER_PRIVATE_KEY_EVM is not set here`: relayer keys exist only in Replit.
- `WAIT relayer margin not checked here`: the margin is a Replit server setting, so only the Replit shell can see it (Part 7).

If a pool shows `FIX the pool charges N bps, but the agreed rate is 50 bps`, do not deploy it again: the line names the single `setProtocolFee` / `set_fee` call that corrects it, and the owner makes that call in Part 6.

Anything else marked `FIX` must be sorted before handing over.

### 4.5 Optional confidence test

`scripts/e2e-solana.mjs` is the 13-step end-to-end test of the Solana pool. It airdrops 31 SOL, so it runs against a **local test validator**, not devnet. It is optional. The commands are in `packages/darkswap-pool/README.md`, section "Run it". It rewrites `fixtures/e2e-solana-result.json`; afterwards run `git checkout fixtures/` to restore it.

---

## Part 5. Send the files back (Deployer)

Send the Replit owner, by any normal channel:

1. `packages/darkswap-pool/deployments/11155111.json`
2. `packages/darkswap-pool/deployments/84532.json`
3. the Solana handoff block from Part 4.3 (text)
4. the two `acceptOwnership` lines printed in Parts 2 and 3 (or just the two pool addresses from the JSON files)

None of these contain a secret. They contain public addresses only.

Then clean up. **Deployer laptop:**

```bash
rm scripts/.env.deploy
```

Keep `.keys/upgrade-authority.json` safe (password manager or encrypted disk) until the Replit owner confirms the Solana pool works and tells you what to do with it (Part 11). Do not send it.

---

## Part 6. The Replit side (Replit owner)

### 6.1 Accept ownership of the two EVM pools

The deploy script handed the pools to your owner address, but Ethereum's two-step ownership needs you to accept once per chain. Until then the deployer wallet still controls the pool.

Option A, with a browser wallet (no tools): open the pool address on https://sepolia.etherscan.io (then https://sepolia.basescan.org), go to **Contract** → **Write Contract**, connect the owner wallet, and call `acceptOwnership`. Confirm the transaction. (If the contract tab shows no functions, the contract is not verified yet; use option B.)

Option B, **on any machine with Foundry**, with the owner key present only on that machine:

```bash
cast send <pool address from 11155111.json> 'acceptOwnership()' --rpc-url https://ethereum-sepolia-rpc.publicnode.com --private-key <OWNER key>
cast send <pool address from 84532.json>    'acceptOwnership()' --rpc-url https://sepolia.base.org --private-key <OWNER key>
```

Success: a transaction hash, and the check in Part 7 no longer says "ownership has not been accepted".

### 6.2 Put the two JSON files in place

In the Replit file tree, open `packages/darkswap-pool/deployments/`. Upload the two files there (right-click the folder → **Upload file**), or create `11155111.json` and `84532.json` and paste their contents. Keep the names exactly as the chain IDs.

Success: the folder lists `11155111.json` and `84532.json` (and, in development only, `31337.json` for the local chain).

### 6.3 Create the two relayer wallets

The relayer wallets are throwaway server wallets. They pay gas for users' shielded transactions and get the relayer fee back. One EVM key serves both EVM chains. Create them in the Replit **Shell** (the shell is private to you; clear it afterwards with `clear`).

**Replit shell:**

```bash
cd packages/darkswap-pool
cast wallet new
```

Copy `Private key` straight into the secret `POOL_RELAYER_PRIVATE_KEY_EVM` (step 6.4) and note the `Address`: you fund it.

**Replit shell:**

```bash
node -e 'const {Keypair}=require("@solana/web3.js");const k=Keypair.generate();console.log("address:",k.publicKey.toBase58());console.log(JSON.stringify(Array.from(k.secretKey)))'
```

Copy the second line, the `[12,34,...]` array of 64 numbers, straight into the secret `POOL_RELAYER_KEYPAIR_SOLANA`. Note the address. Then run `clear`.

### 6.4 Add the secrets

Open the **Secrets** tool in Replit (the padlock in the left tool list). Add each row below with **Add new secret**. Secrets are the only place a private key may be pasted.

| Secret name | What it is | How to get it | Who holds it |
|---|---|---|---|
| `POOL_PROGRAM_ID_DEVNET` | The Solana program ID. Turns Solana devnet on. | From the Deployer's handoff block (`Program ID`). Public. | Owner (public) |
| `RPC_URL_SEPOLIA` | Web address the server uses to talk to Sepolia. Turns Sepolia on. | Free account at Alchemy or Infura → create an app for "Ethereum Sepolia" → copy the HTTPS URL. The public `https://ethereum-sepolia-rpc.publicnode.com` also works but is rate limited. | Owner |
| `RPC_URL_BASE_SEPOLIA` | Same, for Base Sepolia. Turns Base Sepolia on. | Same provider, network "Base Sepolia". Public fallback: `https://sepolia.base.org`. | Owner |
| `RPC_URL_SOLANA_DEVNET` | Optional. Private Solana devnet endpoint. | Helius or any Solana RPC provider, network devnet. If missing, the server uses `https://api.devnet.solana.com`. | Owner |
| `POOL_RELAYER_PRIVATE_KEY_EVM` | The EVM relayer wallet's private key (`0x` + 64 hex characters). Used on both EVM chains. | `cast wallet new` in 6.3. | Owner, in Secrets only |
| `POOL_RELAYER_KEYPAIR_SOLANA` | The Solana relayer keypair: a JSON array of 64 numbers. | The `node -e` command in 6.3. | Owner, in Secrets only |
| `POOL_RELAY_TOKEN_RATES_SEPOLIA`, `..._BASE_SEPOLIA`, `..._SOLANA_DEVNET` | Optional. Lets the relayer accept its fee in a test token. JSON: `{"<token address or mint>":"<whole tokens per 1 ETH or SOL>"}`. | Token address: `token` in the JSON file (tUSD) or the mint in the handoff block (tTEST). Any test rate, e.g. `"2500"` for tUSD per ETH, `"150"` for tTEST per SOL. | Owner |
| `POOL_RELAY_MIN_FEE_SEPOLIA`, `..._BASE_SEPOLIA`, `..._SOLANA_DEVNET` | Extra margin on the relayer fee, in wei or lamports. Default 0. | Already set from the owner's decision of 2026-10-04: `500000` lamports (0.0005 SOL) on Solana devnet, `0` on both EVM chains. The Solana margin is needed because that chain's quote equals the relayer's cost exactly, so free private sends would run it at a loss. | Owner |

Do not add the deployer key, the owner key or the upgrade-authority key anywhere in Replit. The server never needs them.

### 6.5 Fund the relayer wallets

| Network | Address | Amount | Faucets |
|---|---|---|---|
| Sepolia | EVM relayer address from 6.3 | 0.1 ETH | same faucets as Part 1.5 |
| Base Sepolia | EVM relayer address (same) | 0.1 ETH | same as Part 1.5 |
| Solana devnet | Solana relayer address from 6.3 | 1 SOL | https://faucet.solana.com, or **Replit shell:** `solana airdrop 1 <address> --url devnet` |

Each relayed unshield costs about 1.4 million gas on EVM and about 0.002 SOL on Solana; the relayer fee pays it back. Top up when the check in Part 7 says the balance is low.

### 6.6 Restart the server

Secrets are read when the server starts. In the **Workflows** panel restart **API Server** (or click Run again). Success: the console shows the server listening, with no line mentioning `pool` and `error`.

---

## Part 7. Verify (Replit owner)

**Replit shell:**

```bash
cd packages/darkswap-pool && npm run check:deployment
```

The script reads the configuration exactly the way the server does (the JSON files, `POOL_PROGRAM_ID_DEVNET`, `RPC_URL_*`), reads each live pool, and checks the relayer balances. Secrets are available to the shell, so nothing needs pasting.

Success: every line is `PASS`, the last block says `fee recipient is the same on sepolia and base-sepolia`, and the final line is `All checks passed`. Any `FIX` line tells you what to change; fix it and run again. A `WAIT` line means a chain is not deployed yet.

This run is what confirms the agreed fee values on the chains themselves. Three lines per chain carry that:

- [ ] `PASS charges 50 bps (0.50%), the agreed rate (read from the chain)` on all three chains. The figure is read from the pool, not from the deployment file, so it stays honest even if someone changed the rate after deploying.
- [ ] `PASS relayer margin 0 wei, the agreed value` on Sepolia and Base Sepolia, and `PASS relayer margin 500000 lamports, the agreed value` on Solana devnet.
- [ ] On Solana devnet, the `relayer quote per relayed unshield: ... lamports` line. Open `/api/pool/solana-devnet/relay` in the preview: its `fee` must be that same number. The two EVM chains quote gas only, with nothing added.

Visual confirmation, two ways:

1. Open the app preview and change the path to `/api/pool/chains`. Success: JSON with three chains, each `"live": true` and `"reason": null`. A chain that is not ready says `"reason": "Not deployed yet."` or `"No RPC configured."`.
2. Open `/pool` in the preview. Success: the **Chain** choice lists Sepolia, Base Sepolia and Solana devnet without the word "soon", the testnet banner is at the top, and the **Fees** tab shows the fee rate for the chosen chain.

---

## Part 8. Acceptance walkthrough with real wallets (Replit owner)

Do this once per chain. You need two browser profiles (for example Chrome "Person 1" and "Person 2"), each with a wallet extension holding a little testnet coin: MetaMask or Rabby for Sepolia and Base Sepolia (0.05 ETH each profile), Phantom or Solflare for devnet (0.5 SOL each profile; Phantom → Settings → Developer settings → Testnet mode). Work in the Replit preview or, after publishing, on the live site.

Profile 1:

- [ ] Open `/pool`, choose the chain. The testnet banner shows.
- [ ] **Activate**: connect the wallet, click **Sign to activate**, sign the message (it starts with "DarkSwap shielded balance v1"). A `dark1…` address appears.
- [ ] Click **Show 24 recovery words** and write them down. Click **Hide words**.
- [ ] **Shield** 0.01 ETH (or 0.05 SOL). The screen shows the amount plus the 0.5% protocol fee. Confirm in the wallet. After "Waiting for the chain…" the balance shows 0.01.
- [ ] **Activity** lists one unspent note with a transaction link that opens on the block explorer.

Profile 2:

- [ ] Activate with the second wallet. Copy its `dark1…` address from **Receive** (a QR code is shown).

Profile 1:

- [ ] **Send** half (0.005) to profile 2's `dark1…` address, click **Send privately**. Steps "Making the proof on this device…", "Handing it to the relayer…", "Waiting for the chain…" pass. No wallet pop-up: the relayer submitted it.
- [ ] A mistyped `dark1…` address is refused with a checksum error (change one letter and try).

Profile 2:

- [ ] After a short wait, **Activity** shows the 0.005 note.
- [ ] **Unshield** 0.005 to a fresh address (make a new account in the wallet, or paste any address you control), route **through the relayer**. The screen shows the protocol fee and the relayer fee separately and the net amount the recipient gets. Confirm. The fresh address receives the net amount (check the explorer).
- [ ] On Solana only: try to unshield less than 0.001 SOL to a brand-new address (one that has never received anything). It is refused before proving, with a message about the rent minimum. Unshielding 0.01 SOL to the same address works.
- [ ] Try again with the same note: the relayer refuses ("already spent" / NullifierAlreadySpent) or the note is gone.

Either profile:

- [ ] **Fees** tab shows accrued fees for the asset: one fee from the shield, one from the unshield, and "Planned use: Buy and burn $DARK".
- [ ] Click **Sweep now**, confirm in the wallet. The accrued figure drops to 0 and the swept figure rises. The fee recipient's balance on the explorer rose by that amount.
- [ ] Click **Lock now**. Reopen `/pool`: it asks to activate again.

Fresh profile (or an incognito window):

- [ ] Choose **Restore** and paste the 24 words from profile 1. The same `dark1…` address and the same notes appear, with no wallet connected.

Relayer refuses a low fee: the UI never sends a low fee, so this is checked from a script. **Replit shell**, with the API running, against the local anvil chain:

```bash
cd lib/pool-client && API=http://localhost:$PORT/api node scripts/relay-e2e.mjs
```

- [ ] Prints `ok - low relayer fee refused` and `ok - replay refused`, then `all relay checks passed`. (Replace `$PORT` with the port the API Server workflow prints when it starts. Needs anvil running with the pool deployed and `RPC_URL_ANVIL` set, as described in `replit.md` → Shielded pool. If anvil was restarted since the last run, see Troubleshooting "stale anvil rows".)

Token flows (optional, if tUSD / tTEST rates were set): shield 10 tUSD (approve first, then shield), unshield 5 through the relayer (fee quoted in tUSD), unshield the rest from your own wallet (no relayer fee; the wallet is the public sender).

Note anything that fails, with the chain, the step and the error text. Solana devnet is the first real run of the Solana server code, so expect to find something there.

---

## Part 9. Before you publish (Replit owner)

- [ ] **Analytics off.** Replit adds an analytics script to published sites. The pool pages switch it off in the page, but the browser still downloads it. To meet the "no third-party scripts on pool pages" rule fully, open **Publishing** → settings and turn analytics off for the site. (This applies to the whole site.)
- [ ] **Token rates.** If testers should be able to pay relayer fees in tUSD or tTEST, set `POOL_RELAY_TOKEN_RATES_<CHAIN>` (6.4). Without a rate the relayer refuses that token and users withdraw it from their own wallet instead.
- [ ] **Secrets in the deployment.** In the Publishing screen, confirm the secrets from 6.4 are listed for the deployment (Replit copies them; check the list).
- [ ] **Schema change.** Publishing creates three new tables in the production database (`pool_commitments`, `pool_nullifiers`, `pool_fees`). The Publish screen asks you to approve the schema change. Read it: it should add tables only, not drop anything. Approve.
- [ ] `npm run check:deployment` still all PASS.
- [ ] Copy rules: the site says testnet everywhere on the pool pages and uses none of the five banned words from `REPLIT_HANDOFF.md`, rule 4 (no privacy promises, no yield words). Nothing in this set-up changes copy, but look once.

---

## Part 10. Publish (Replit owner)

Click **Publish** (top right), choose the existing deployment, approve the schema change when asked, and wait for "Live". Then on the live site:

- [ ] `https://darkswap.app/api/pool/chains` shows three chains with `"live": true`.
- [ ] `https://darkswap.app/pool` loads with the testnet banner and the three chains.
- [ ] Repeat the first five tick boxes of Part 8 on one chain on the live site (activate, shield, send, unshield, fees).

If a chain shows "soon" on the live site but not in the preview, the deployment is missing a secret or the JSON files were not included in the publish. Check the deployment's secrets and the file list, then publish again.

---

## Part 11. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `check:deployment` says "the file says chainId 84532, but this is chain 11155111" | The Base Sepolia file was saved as the Sepolia file (or the other way round). | Rename the files so each name matches its `chainId` field. Never edit the number inside. |
| `/api/pool/chains` says `"reason": "No RPC configured."` | `RPC_URL_SEPOLIA` or `RPC_URL_BASE_SEPOLIA` is missing or empty. | Add the secret (6.4) and restart the API Server. |
| `"reason": "Not deployed yet."` | The JSON file is missing from `packages/darkswap-pool/deployments/`, or `POOL_PROGRAM_ID_DEVNET` is not set. | 6.2 / 6.4, then restart. |
| Unshield says the relayer is unavailable; `check:deployment` says the relayer holds 0 ETH / 0 SOL | Relayer wallet not funded (or drained). | Fund it (6.5). |
| Relayer refuses with "fee too low" in the UI | The quote expired while proving, or gas jumped. | Try again; the UI fetches a fresh quote. Optional margin: `POOL_RELAY_MIN_FEE_<CHAIN>`. |
| `check:deployment` says "ownership has not been accepted" | The owner has not called `acceptOwnership()` yet. | 6.1. |
| `setup:devnet` says "already initialized" with a different fee recipient | The pool was initialized earlier with another recipient. The recipient cannot change. | If the old recipient is wrong, deploy a fresh program (new program keypair: `solana-keygen new -o solana/pool/target/deploy/darkswap_pool-keypair.json`, then Part 4.2 again). |
| `setup:devnet` says "upgrade authority is X, not Y" | You deployed with a different keypair than `--authority`. | Pass the keypair that paid for `solana program deploy` (check `solana config get`). |
| `solana airdrop` says "rate limit" or "airdrop request failed" | Devnet gives only a few SOL per day per address and per IP. | Wait an hour, use https://faucet.solana.com (needs a GitHub login), or ask a colleague to send devnet SOL. |
| `deploy:evm` says "deployer balance is 0.0 ETH" though the faucet said sent | Wrong network, or the faucet is slow. | Check the address on the explorer for that network; wait a few minutes. |
| `deploy:evm` says "forge-std is missing" or "npm packages are missing" | Part 1.2 was skipped. | Run the two commands in 1.2 again. |
| `deploy:evm` says "deployments/<id>.json already exists" | A deployment already ran for this chain. | Do not overwrite a file that has been handed over. If it was a failed attempt, move the file away and run again. |
| `deploy:evm` says "chain id N, which is not Sepolia (11155111) or Base Sepolia (84532)" | `RPC_URL` points at another network, possibly a mainnet. | Use one of the two testnet RPC URLs from Part 1.6. The kit never deploys anywhere else. |
| A helper prints "packages are not installed yet" or Node says "Cannot find package 'viem'" | The workspace install was skipped. | From the repository root run `pnpm install --frozen-lockfile`. |
| `setup:devnet` says "exists but is not a keypair file" about `.keys/test-mint-...json` | The saved test-mint file was edited or truncated. | Move the file away. If the mint was already created, pass it explicitly: `--test-token <mint address from the earlier output>`. |
| Development only: the preview's **Local anvil** chain errors with "rebuilt N leaves, pool has M" or shows notes that no longer exist | Anvil was restarted, so the chain is empty but the database still holds the old rows. | Delete the `anvil` rows from `pool_commitments`, `pool_nullifiers` and `pool_fees` (ask the agent, or use the database tool), then reload. |
| Browser says "root mismatch" / refuses to prove | The server's record and the chain disagree, usually right after a transaction. | Reload after a few seconds. If it persists on a testnet, report it: it is a server bug, not a user error. |
| Phantom does not show devnet balance | Testnet mode is off. | Phantom → Settings → Developer settings → Testnet mode on, network Solana devnet. |

---

## Part 12. Doing this again for another operator

The same kit sets up a separate pool for someone else (another team, another brand) or a fresh pool for ourselves. Each new set-up is a new deployment with its own addresses; old pools keep running untouched.

**What changes per operator**

| Setting | Where | Notes |
|---|---|---|
| Owner | `OWNER` in `.env.deploy`; on Solana, the upgrade-authority keypair (becomes admin) | Can later be changed by the owner (`transferOwnership` on EVM, `set_admin` on Solana). |
| Fee recipient | `FEE_RECIPIENT` in `.env.deploy`; `--fee-recipient` for Solana | Fixed forever per pool. Same on both EVM chains. Decide first. |
| Fee rate | `PROTOCOL_FEE_BPS`; `--fee-bps` | 0 to 100 bps (0% to 1%). The owner can change it later (`setFee` / `set_fee`); the UI reads it live. |
| Deposit limits | `ETH_MIN_DEPOSIT`, `ETH_MAX_DEPOSIT`, `ETH_CAP`; `--sol-min`, `--sol-max`, `--sol-cap` | The owner can change them later (`updateAsset` / `update_asset`). |
| Guardian window | `GUARDIAN_DAYS`; `--guardian-days` | Days during which deposits can be paused. Cannot be extended afterwards. |
| Test token | `TEST_TOKEN`; `--test-token` | Testnet only. |
| Relayer wallets, RPC URLs, token rates | The operator's own Replit secrets | New keys per operator. Never share relayer keys between operators. |
| Deployment files and program ID | New `deployments/<chainId>.json` files and a new `POOL_PROGRAM_ID_DEVNET` | A new operator means a new copy of the app; the files and the ID belong to that copy. |

**What must never change**

- The protected folders: `circuits/`, `evm/src/`, `evm/script/`, `solana/`, `keys-dev/`, `fixtures/`. They are what was reviewed. A change there means a new review.
- Fee math (`fee = ceil(amount × bps / 10000)`), hashing, key derivation, the `dark1` address format and note encryption. Wallets from different pools must keep the same rules.
- The proving keys (`keys-dev/`) and `build-circuit.sh`: never run it, it regenerates the keys and every existing proof setup stops matching. Mainnet needs a proper key ceremony, which is a separate project.
- The copy rules: tag everything testnet (or live, when it is) and keep to the banned-word list in `REPLIT_HANDOFF.md`, rule 4.

**Hand-over of keys when the Deployer is not the operator**

- EVM: nothing to hand over. The owner accepted ownership; the deployer key can be discarded.
- Solana: the upgrade-authority keypair is both the program's upgrade key and the pool admin. For a hand-over, the operator sends a Solana address they control and the Deployer runs, **Deployer laptop:** `solana program set-upgrade-authority <PROGRAM_ID> --new-upgrade-authority <operator address>` and sends `set_admin` from the pool client (instruction tag 4; ask the agent for the one-liner). After that the Deployer deletes `.keys/upgrade-authority.json`.

**Files in this kit**

| File | Runs on | Purpose |
|---|---|---|
| `packages/darkswap-pool/scripts/.env.deploy.example` | copied on the Deployer laptop | Settings template for the EVM deployment |
| `packages/darkswap-pool/scripts/deploy-evm.sh` (`npm run deploy:evm`) | Deployer laptop | One-command EVM testnet deployment with checks |
| `packages/darkswap-pool/scripts/devnet-setup.mjs` (`npm run setup:devnet`) | Deployer laptop | One-command Solana devnet pool set-up, re-runnable, with `--dry-run` |
| `packages/darkswap-pool/scripts/check-deployment.mjs` (`npm run check:deployment`) | Deployer laptop or Replit shell | PASS / FIX check of all three chains and the relayer balances |
| `packages/darkswap-pool/scripts/kit-preflight.mjs` | (used by the two Node helpers) | Turns a missing workspace install into a plain instruction |
| `packages/darkswap-pool/scripts/deployer-kit.test.mjs` (`npm run test:kit`) | any machine | Checks the kit's refusals (mainnet, empty fee recipient, local anvil) and re-run behaviour against local mock chains; no network |
| `packages/darkswap-pool/REPLIT_STATUS.md` | reading | What was built, what is verified, open items |
