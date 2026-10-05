# EVM privacy infrastructure and shielded Zcash — feasibility and decision

**Evidence checked: October 2, 2026.** This assesses the owner's direction: *"model our infrastructure to EVM so we can use shielded ZEC on EVM,"* prompted by [nullmask.io](https://nullmask.io). No funds were moved, no contract was called with a signer, no live DarkSwap route was changed. All on-chain findings below come from unauthenticated `eth_call` / `eth_getCode` reads against public RPCs.

**Decision: do not build a shielded-ZEC-on-EVM route. The capability does not exist to integrate today.** An EVM privacy pool is real and purchasable; shielded ZEC through it is not. These are separate capabilities and only the first ships today. Keep the existing Solana and NEAR routes as-is. Any EVM work must be additive, must not claim ZEC, and must not migrate $DARK.

---

## 1. The distinction that decides this

Three different things are routinely conflated. They have different trust models and different delivery dates.

| | What it is | Status for DarkSwap |
| --- | --- | --- |
| **(a) EVM pool shielding** | Hiding sender/recipient/amount for an allowlisted ERC-20 inside a note pool on an EVM chain. The asset never leaves the EVM chain. | **Available.** This is what Nullmask actually does. |
| **(b) Native Zcash settlement** | Value delivered to a real Zcash shielded address, settled by Orchard/Sapling on the Zcash chain. | **Not available via EVM.** Requires a provider that settles on Zcash. |
| **(c) Shielded ZEC on EVM** | A ZEC-representing token, shielded in an EVM pool. The owner's stated goal. | **Not available.** Blocked at two independent layers — see §3. |

Moving infrastructure to EVM delivers (a). It does not deliver (b), and it does not by itself deliver (c).

---

## 2. What is verified to work

Nullmask's protocol is real and deployed. This part of the research holds up.

| Claim | Verification method | Result |
| --- | --- | --- |
| Contracts are deployed | `eth_getCode` at the documented proxy addresses [S1] | Bytecode present: Ethereum 987 bytes, Base 934, Arbitrum 934, BSC 934 |
| Architecture as documented | First-party docs [S2][S3] | Own EVM note pool (encrypted UTXOs), Noir/Barretenberg proofs, separate transfer/withdrawal/swap verifiers, RPC proxy and relayer |
| Token gating is real and readable | `tokenWhitelist(address)` public view on the mainnet proxy | Returns the documented `TokenType` enum: `0 NOT_ALLOWED`, `1 NATIVE_TOKEN`, `2 ERC20`, `3 ERC20_FEE_ON_TRANSFER` [S4] |
| Known-good controls | Same view | Ethereum: native ETH → `1`, WETH → `2`, USDC → `2`. Base: native ETH → `1`, WETH → `2` |

So the pool works, and its allowlist is publicly queryable. That last point is what makes the next section conclusive rather than speculative.

---

## 3. Why shielded ZEC on EVM is blocked

### 3.1 No ZEC asset is allowlisted — verified, not inferred

Because `tokenWhitelist(address)` is publicly readable, this is a measured fact rather than an absence of published evidence.

| Chain | Asset queried | On-chain `TokenType` | Meaning |
| --- | --- | --- | --- |
| Ethereum | Wrapped ZEC `0x4A64515E…66E10` | `0` | `NOT_ALLOWED` — deposits and swaps rejected |
| Base | ZCash (Universal) `0x83f31af7…f6ed2` | `0` | `NOT_ALLOWED` — deposits and swaps rejected |

Both returned `0` while WETH and USDC returned `2` on the same call, so this is a genuine rejection, not a broken query. **Every ZEC-representing asset tested is explicitly rejected by the live contract.** There is no ZEC to shield.

### 3.2 The ZEC withdrawal route is roadmap, not product

Nullmask's own roadmap lists *"Unshield Directly to ZEC Wallets"* as a future item — "withdraw assets from NullMask directly into a Zcash wallet" — under an explicit note that "roadmap dates are current targets and may change based on development, testing, audits and security requirements" [S5]. It is a stated intention, not a shipped exit route.

### 3.3 The wrapped ZEC assets themselves are not viable

Even if the allowlist opened tomorrow, the underlying assets do not support a product.

| | Ethereum WZEC | Base uZEC |
| --- | --- | --- |
| On-chain name / symbol | `Wrapped ZEC` / `WZEC` | `ZCash (Universal)` / `uZEC` |
| Total supply (read on-chain) | **429.97** | **77.18** |
| Decimals | 18 | 18 |
| Origin | RenVM era; RenVM shut down in 2023 | Universal Assets wrapper |

Two problems. First, supply is negligible — a few hundred tokens total across both. That is not a market; routing user value through it would create severe slippage and exit risk. Second, both use **18 decimals while native ZEC uses 8**, confirming these are re-wrapped representations rather than faithful units. Neither is native Zcash. Each is an IOU carrying its own issuer, custody, and redemption risk on top of every risk the pool already has.

---

## 4. Risks that apply even to a ZEC-free EVM integration

These matter if we ever pursue the EVM pool for its own sake.

- **The proxy can observe users.** Nullmask's own threat model states a compromised proxy **can** "observe transaction details (sender, recipient, amount) in remote deployment mode" [S6]. Routing DarkSwap users through a remote proxy would reintroduce exactly the visibility our private routes exist to avoid. Only self-hosting the proxy avoids this, which is real infrastructure we would own and operate.
- **Contracts are upgradeable.** Deployment is an ERC1967 proxy behind an `AdminUpgradeController` [S1]. The logic behind the address we would integrate against can change without our involvement.
- **Allowlist control is external.** `setTokenWhitelist` is callable by the whitelist manager or upgrade controller admin [S4]. Asset support can be granted or revoked unilaterally.
- **No independent audit was found** covering the deployed contracts or the Noir circuits. The roadmap references audits as a future gate. Absence of a found audit is not proof none exists, but we located none, and we should not integrate on the assumption that one does.

---

## 5. Options considered

| Option | Delivers the goal? | Assessment |
| --- | --- | --- |
| Integrate Nullmask for shielded ZEC | **No** | Blocked outright by §3.1. Not implementable at any effort level. |
| Allowlist-wait: build now, enable ZEC when listed | **No** | Depends on a third party's unscheduled roadmap item *and* on wrapped assets that are unusably thin (§3.3). Builds a route we cannot turn on. |
| Additive EVM privacy adapter, no ZEC claim | Partially — (a) only | Technically viable. Delivers EVM privacy, not Zcash. Requires self-hosted proxy to avoid §4, and inherits upgrade/audit risk. Real but substantial work for a benefit unrelated to the stated ZEC goal. |
| **Pursue native Zcash settlement separately** | **Yes — the real goal** | Correct path for (b). Belongs with providers that settle on Zcash, not with EVM pools. Independent of any EVM decision. |

---

## 6. Recommendation

1. **Drop shielded-ZEC-on-EVM.** It is blocked by a live contract check, not by our effort or budget. No amount of integration work changes a `NOT_ALLOWED` allowlist entry against assets with ~430 and ~77 total supply.
2. **Decouple the two goals.** If the real objective is *Zcash for our users*, that is a native-settlement question and EVM is the wrong layer. If the real objective is *reach more chains*, that is an EVM question and ZEC should not be attached to it.
3. **Do not treat an EVM move as privacy progress by itself.** Our existing private routes already work. An EVM pool fronted by a third-party proxy that can observe sender, recipient, and amount would be a step backwards unless we self-host.
4. **Re-check cheaply, on a trigger.** The `tokenWhitelist(address)` read in §3.1 is a free unauthenticated call. Re-run it before reconsidering; do not re-litigate from documentation or announcements.

## 7. Required before any funded EVM integration

Each must be satisfied and recorded, in this order. Earlier failures make later items moot.

| # | Gate | Current state |
| --- | --- | --- |
| 1 | A ZEC asset returns a non-zero `TokenType` on a chain we would use | **Failing** — returns `0` on Ethereum and Base |
| 2 | That asset has real supply, liquidity, and a documented redemption path to native ZEC | **Failing** — ~430 and ~77 total supply; 18 vs 8 decimals |
| 3 | Independent audit covering deployed contracts and circuits, with scope and date | **Not established** — none found |
| 4 | Self-hosted RPC proxy, or an accepted and disclosed visibility tradeoff | **Not started** |
| 5 | Documented upgrade authority and allowlist-change notification | **Not established** |
| 6 | Owner approval and user-facing copy review | Not reached |

## 8. Claim limits

Until the gates above pass, DarkSwap must not state or imply that it offers shielded ZEC, Zcash privacy, or Zcash settlement through any EVM route; that an EVM privacy pool provides Zcash-equivalent privacy; or that a wrapped ZEC token is Zcash. Per existing policy, name providers only in Docs, and never imply an anonymity guarantee.

---

## Sources

- [S1] Nullmask deployment addresses — https://docs.nullmask.io/smart-contract-reference/addresses
- [S2] System overview — https://docs.nullmask.io/architecture/architecture
- [S3] Supported networks — https://docs.nullmask.io/architecture/supported-networks
- [S4] Token whitelist — https://docs.nullmask.io/smart-contract-reference/token-whitelist
- [S5] Project roadmap — https://docs.nullmask.io/project-roadmap
- [S6] Security and threat model — https://docs.nullmask.io/security/security

On-chain reads were performed against public RPC endpoints for Ethereum, Base, Arbitrum, and BSC on October 2, 2026. All are reproducible without credentials.
