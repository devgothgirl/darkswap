# DarkSwap shielded pools

Our own shielded pool, on two chains, from one circuit:

- `evm/src/DarkPool.sol`: ETH and listed ERC-20 tokens. Same code for Ethereum and Base.
- `solana/pool`: SOL and listed SPL tokens, a native Solana program.

Both take public deposits (shield), private sends and withdrawals (unshield)
with a relayer fee. The same proof format, tree and wallet code serve both.
Both charge a protocol fee on shield and unshield, never on a private send;
it accrues in the pool and anyone can sweep it to a fixed fee recipient.

**Status, Oct 3, 2026:** both pools run end to end on local chains with real
proofs. They are not deployed to any public network, not audited, and the
proving keys are dev-only. Do not put real funds in them.

| Check | Result |
| --- | --- |
| Circuit tests (valid transactions, 13 attacks) | 18 pass |
| Wallet tests (addresses, encryption, scanning, planning) | 6 pass |
| EVM: hashing, tree, verifier (12) and pool rules (32) | 44 pass |
| Rust: hashing, tree, verifier (14) and Solana program helpers (3) | 17 pass |
| EVM end to end on anvil, real proofs, fee sweep | 9 of 9 steps pass |
| Solana end to end on a local validator, real proofs, attacks, fee sweep | 13 of 13 steps pass |

Two separate reviews attacked the code, one on the circuit and one on both
pools. Neither found a way to steal, mint, double-spend or redirect a payout.
The pool review found two ways to freeze funds. Both are fixed, and each fix
has a test (see "Review findings").

## What it costs

| Action | EVM gas | Solana compute units | Solana tx size |
| --- | --- | --- | --- |
| Shield (public deposit) | about 1.16M to 1.22M | about 36,000 | 514 to 613 bytes |
| Private send | about 1.32M | about 161,000 | 972 bytes |
| Unshield with relayer fee | about 1.37M to 1.38M | about 169,000 to 172,000 | 1,072 to 1,170 of 1,232 bytes |

- **Proving:** 2 to 5 seconds per transaction, depending on the machine (Node, measured on a 2-core server).
- **EVM:** at 0.13 gwei and ETH at $2,670 (Oct 2), a 1.38M-gas unshield is about $0.48 on Ethereum mainnet, and much less on Base.
- **Solana:** each spend also creates two nullifier accounts, about 0.0018 SOL of rent, which the relayer pays and should recover in its fee.
- **Relayer fees:** these must cover the relayer's costs. In the EVM test, a 0.001 ETH fee did not cover 1.38M gas at anvil's default gas price.
- **Sweeping fees:** about 60,000 gas on EVM; one small instruction on Solana.

## Protocol fee and $DARK

This is the same shape as Nullmask's, read from its own DefiLlama filings
([fees](https://github.com/DefiLlama/dimension-adapters/pull/9855),
[TVL](https://github.com/DefiLlama/DefiLlama-Adapters/pull/21369)): 0.5% on
shield and 0.5% on unshield, collected by the pool, excluded from TVL until
swept to a fee wallet, with relayer gas compensation kept separate.

| Rule | Value |
| --- | --- |
| Fee on shield | `protocolFeeBps` of the note amount, paid by the depositor on top |
| Fee on unshield | `protocolFeeBps` of the payout, taken from the payout; the relayer fee is separate |
| Fee on a private send | none (a fee would also reveal the asset) |
| Rate | set at deployment, changeable by the owner, hard cap 1% (`MAX_PROTOCOL_FEE_BPS`) |
| Where it sits | `protocolFees[token]` (EVM) / the asset account's `fees` (Solana), never in a note's books |
| Who sweeps it | anyone, with `collectFees(token)` / instruction 8 |
| Where it goes | `feeRecipient`, fixed at deployment on both chains |
| Rounding | up, so no deposit or withdrawal pays zero |

What the fee recipient does with the money is the holder policy, and it is
not in the pool. The pool only guarantees that the fee leaves to that one
published address. The owner's decision (2026-10-05, replacing an earlier
buy-and-burn choice): swept fees are converted to ZEC and $DARK and added as
liquidity to the ZEC-DARK pool on Meteora (Solana). Design in
`BRIEF_FEE_RECIPIENT.md`.

EVM fees arrive in ETH and tokens and the ZEC-DARK pool is on Solana, so EVM
fees need a bridge step first (Nullmask uses deBridge for a similar hop).

## The keys in `keys-dev/` are not safe for real funds

One machine made them. Whoever ran that setup could forge proofs and drain
both pools. Before mainnet, replace them with keys from a ceremony with
outside contributors, built on a public phase-1 file. Then re-export both
verifiers (`npm run build:circuit` shows how).

## Design

```
note        = (amount, assetId, publicKey, blinding)
commitment  = Poseidon(amount, assetId, publicKey, blinding)
publicKey   = Poseidon(privateKey)
nullifier   = Poseidon(commitment, pathIndex, Poseidon(privateKey, commitment, pathIndex))
```

A transaction spends up to two notes and creates two. The proof shows that
the inputs are in the tree, that the prover owns them, that value balances,
and that one asset is used. A pure private send hides the asset as well as
the amount.

Public inputs, in this order on both chains: `root`, `publicAmount`,
`extDataHash`, `publicAssetId`, two nullifiers, two output commitments.

| | EVM | Solana |
| --- | --- | --- |
| Asset id | token address (ETH: `0xEeee…EEeE`) | Poseidon of the mint's two 16-byte halves (SOL: the system program id) |
| `extDataHash` | keccak256(abi.encode(ext, chainId, pool)) mod p | sha256(tag, program id, recipient, relayer, mint, amounts, both encrypted outputs), cut to 253 bits |
| Spent notes | mapping | one account per nullifier (exists = spent) |
| Roots a proof may use | the last 1,000 | the last 256 |
| Deposit through a proof | yes | no (use shield) |

Shared by both: a depth-26 Poseidon tree with pair inserts (one transaction,
one new root), per-asset books (one asset can never pay out another's
funds), minimum and maximum deposits and a cap per asset, and a deposit pause
that expires.

**Admin powers.** The admin can list assets, set limits, turn deposits off,
and pause deposits until a set date. It cannot move funds, pause
withdrawals, or change the verifying key.

**Upgrades.** The EVM pool has no upgrade path. The Solana program has an
upgrade authority, as every Solana program does. Only that authority can
initialize the pool, so nobody can front-run the deployment. Before mainnet,
put it behind a multisig with a delay, or remove it.

**Wallet** (`scripts/wallet.mjs`):

- Every key comes from one 32-byte secret.
- A shielded address is `dark1…`: the public key, the encryption key and a checksum.
- Notes are encrypted to their recipient with x25519 and ChaCha20-Poly1305.
- Each public deposit uses a fresh one-time key, so deposits from one wallet cannot be linked. Scanning finds them with a 64-key gap limit.

## Run it

Needs Node 22, circom 2.2.2, Foundry, Rust, and the Agave Solana tools (4.x).

```
# From the repository root (do not run npm install in this package):
pnpm install --frozen-lockfile
cd packages/darkswap-pool
git clone --depth 1 https://github.com/foundry-rs/forge-std evm/lib/forge-std
npm test                     # circuit, wallet, EVM and Rust tests

# EVM end to end
anvil &
(cd evm && TEST_TOKEN=true forge script script/Deploy.s.sol:Deploy --rpc-url http://127.0.0.1:8545 \
    --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --broadcast)
node scripts/e2e-evm.mjs

# Solana end to end
(cd solana/pool && cargo build-sbf --sbf-out-dir "$PWD/target/deploy" -- --locked) && \
  (cd solana/test-logspam && cargo build-sbf --sbf-out-dir "$PWD/target/deploy" -- --locked)
solana-keygen new --no-bip39-passphrase -s -o .keys/upgrade-authority.json
PROGRAM=$(solana-keygen pubkey solana/pool/target/deploy/darkswap_pool-keypair.json)
SPAM=$(solana-keygen pubkey solana/test-logspam/target/deploy/logspam-keypair.json)
solana-test-validator --upgradeable-program $PROGRAM solana/pool/target/deploy/darkswap_pool.so \
    $(solana-keygen pubkey .keys/upgrade-authority.json) \
    --bpf-program $SPAM solana/test-logspam/target/deploy/logspam.so &
node scripts/e2e-solana.mjs $PROGRAM .keys/upgrade-authority.json $SPAM
```

**Testnets.** The EVM deploy script works unchanged with a Sepolia or Base
Sepolia RPC URL and a funded key: set `OWNER`, `ETH_MIN_DEPOSIT`,
`ETH_MAX_DEPOSIT`, `ETH_CAP` and `GUARDIAN_DAYS`. For Solana devnet, deploy
with `solana program deploy`, then send `initialize` and `list_asset` as
`scripts/e2e-solana.mjs` does. One-command wrappers: `npm run deploy:evm`
(reads `scripts/.env.deploy`, see `.env.deploy.example`; Sepolia and Base
Sepolia only, local anvil needs `ALLOW_LOCAL_ANVIL=1`), `npm run setup:devnet`
and `npm run check:deployment`; use the root frozen pnpm install for all workspace
dependencies. `npm run test:kit` checks them against mock chains. The plain-language manual is
`docs/pool-testnet-setup-manual.md` at the workspace root.

## Review findings and what was done

| Finding (review) | Severity | Status |
| --- | --- | --- |
| A full tree blocked every withdrawal, and an attacker could fill it | High | Fixed: on a full tree, deposits stop, withdrawals still work (outputs are dropped, so wallets unshield whole notes), and the last root stays valid. A minimum deposit and the deposit cap make filling costly. Tested on EVM and in Rust |
| One Solana transaction could cut off the pool's logs and break wallet sync for everyone | High | Fixed: sync rebuilds the tree from instruction data, which cannot be cut off. The end-to-end test runs the attack |
| Pending proofs could be expired by spamming tiny deposits (root griefing) | Medium | Reduced: minimum deposit per asset. A re-prove takes seconds. A larger Solana history is a follow-up |
| EVM moved tokens when `extAmount == fee` (public amount 0) | Low | Fixed: refused |
| Fee-on-transfer tokens made deposit notes invisible to the wallet | Low | Fixed: shield refuses them on both chains |
| Deposits past the 64th one-time key were not found | Low | Fixed: gap-limit scanning, and the next deposit number comes from chain history |
| A small SOL payout to a new address fails on rent | Note | Client check added (`checkSolRecipient`) |
| An unshield whose token recipient account does not exist needs a second transaction to create it | Note | Open: the client must create it first |
| A token whose issuer can freeze accounts (USDC blacklist, SPL freeze authority) can stop withdrawals of that token | Note | Listing policy |
| The Solana `extDataHash` does not name the cluster | Note | Open: replay needs the same root on another cluster |

Circuit review requirements (see `scripts/circuit.test.mjs` and the pools):
both pools compute `publicAmount` themselves, bound amounts far below 2^248,
derive the asset id from the token that moves, reject inputs outside the
field, check roots, bind every external field into `extDataHash`, and never
key anything on proof bytes.

## Not done yet

1. **Testnet deployments.** Public networks are blocked from the machine
   that built this. Run the deploy from a machine with an RPC URL and a funded key.
2. **Dark Inbox funding from Solana.** `shield` is ready for it, but the Dark Inbox contracts were written for an earlier pool interface. The inbox must pass the owner's `publicKey` and `blinding` to `shield`. It must also derive its own address from them, so the keeper cannot redirect the deposit.
3. **The terminal UI.** The wallet keys still come from a random secret here, not from a wallet signature or 24 words.
4. **Viewing keys.**
4b. **The fee recipient contract** that adds swept fees to ZEC-DARK liquidity, and the bridge step for EVM fees.
5. **The recovery page.**
6. **In-pool swaps.** The circuit moves one asset per transaction.
7. **Two circuit decisions to make before the ceremony:** domain tags for the two 3-input hashes, and a tree id in the nullifier so a second tree can be opened.
8. **Setup ceremony.**
9. **Independent audit.**
10. **Legal opinion.**

## Layout

```
circuits/                  the circuit (transaction.circom is the core)
evm/src/DarkPool.sol       EVM pool
evm/src/MerkleTree.sol     EVM tree (pair inserts, 1,000-root window)
evm/src/Groth16Verifier.sol  generated by snarkjs from keys-dev (GPL-3.0 header)
evm/script/Deploy.s.sol    deploys verifier + pool, lists assets, writes deployments/<chainId>.json
evm/test/                  Parity.t.sol (hashing, verifier), DarkPool.t.sol (pool rules)
solana/pool/               Solana pool program
solana/verifier-parity/    shared Rust: poseidon, in-place tree, Groth16 verify
solana/pool-probe/         phase-1 compute-unit probe
solana/test-logspam/       TEST ONLY: program used to attack log-based sync
scripts/lib.mjs            notes, tree, circuit input builder
scripts/wallet.mjs         keys, addresses, encryption, scanning, planning
scripts/evm.mjs            EVM adapter        scripts/solana.mjs   Solana adapter
scripts/e2e-*.mjs          end-to-end runs    scripts/*.test.mjs   unit tests
keys-dev/                  DEV-ONLY proving key, verification key, wasm
fixtures/                  test vectors, proofs, end-to-end results
```

## Licences of what this builds on

| Part | Licence |
| --- | --- |
| circomlib (circuit templates), snarkjs and its generated verifier | GPL-3.0 |
| OpenZeppelin Contracts, poseidon-solidity, groth16-solana | MIT |
| solana-poseidon, light-poseidon, solana-program, @solana/web3.js | Apache-2.0 |

GPL-3.0 on the circuit and the EVM verifier is a decision for the team
before the code is published.
