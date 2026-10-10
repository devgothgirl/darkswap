# Dependency remediation status

The pool toolkit and app share the root `pnpm-lock.yaml`. Install from the
repository root with `pnpm install --frozen-lockfile`; separate npm installs
bypass the workspace overrides and patches.

## JavaScript findings

| Package / advisory | Treatment |
| --- | --- |
| bigint-buffer / GHSA-3gc7-fjrx-p6mg | Removed from resolution. The Solana token toolkit uses a native BigInt implementation with explicit type, width and overflow checks instead of the vulnerable native addon. |
| ws / GHSA-96hv-2xvq-fx4p and GHSA-58qx-3vcg-4xpx | Existing workspace security floor keeps 8.x at 8.21.0 or later. |
| uuid / GHSA-w5hq-g745-h8pq | Existing security floor keeps CommonJS consumers at 11.1.1 or later. |
| stream-json / GHSA-528h-pc64-c93x | Existing Jayson 5 override removes the vulnerable parser instead of forcing an incompatible major version into CommonJS consumers. |
| underscore / GHSA-qpx9-hpmf-5gmw | Upgraded to 1.13.8 through a workspace security floor. |
| elliptic / GHSA-848j-6mx2-7j84 | Removed with circomlibjs's unused ethers signing graph. The patch imports the original ethers byte, UTF-8 and Keccak utilities directly; circuit algorithms and keys are unchanged. Both ESM and CommonJS entry points are patched. |
| braces / GHSA-vfj7-8cjw-p6xm | Removed: the preview plugin uses tinyglobby instead of fast-glob, removing micromatch and braces from the dependency graph. The obsolete local braces patch is no longer needed. |
| source-map-js / GHSA-68fv-2mgg-jv7q | Workspace security floor resolves 1.2.2, which validates indexed source-map offsets. |
| postcss-selector-parser / GHSA-rj75-hqrm-r3gf | Workspace security floor resolves 7.1.6. The latest typography plugin still pins version 6; regression tests verify its used parser APIs remain compatible. |

Dependency changes in patched manifests must also be represented by pnpm
overrides/package extensions: pnpm resolves dependencies before applying patches.

Run `pnpm run test:dependency-security` for malicious-input regressions and
consumer compatibility checks. Run `pnpm --filter @darkswap/pool-client test`
and the pool toolkit's circuit, wallet, deployer-kit and EVM tests for crypto
and contract integration.

## Rust findings

The owner approved changes to the previously reviewed Solana dependency files.
The four Solana crates now share one committed workspace `Cargo.lock`; all four
members remain compiled and audited. Their old independent locks were replaced,
not removed to hide dependencies.

| Package / advisory | Treatment |
| --- | --- |
| rand 0.7.3 / GHSA-cq8v-f236-94qc and RUSTSEC-2026-0097 | Removed with the unused secp256k1 dependency path. The remaining random-number generator is a maintained 0.8.x release. |
| borsh 0.10.4 / GHSA-fjx5-qpf4-xjf2 | Removed by replacing the umbrella Solana SDK with the specific modules the pool uses; no legacy Borsh features are enabled. |
| derivative / RUSTSEC-2024-0388 | Removed by updating Poseidon and BN254 dependencies to their Arkworks 0.5 implementations. |
| paste / RUSTSEC-2024-0436 | Replaced with maintained pastey through a manifest-only ark-ff patch, retaining its macro import alias. |
| bincode / RUSTSEC-2025-0141 | Replaced with the official Solana system-interface's wincode serializer. Other SDK modules do not enable their optional bincode features. Golden tests verify the pool's four system instructions retain their exact binary encoding and account metadata. |
| libsecp256k1 / RUSTSEC-2025-0161 | Removed: the pool uses no secp256k1-recovery functionality, so the modular SDK does not pull it in. |

See `packages/darkswap-pool/solana/vendor/README.md` for provenance and the two
manifest-only compatibility patches. All vendored Rust source is byte-identical
to its published upstream archive. Circuits, keys and fixtures are unchanged.

Run `pnpm --filter darkswap-pool run test:solana`: it compiles/tests every
workspace member against the canonical lock with `--locked`, including existing
proof/hash/Merkle parity tests and instruction/address/hash compatibility tests.
No throwaway Rust lockfile or dependency update is used during testing.

## Remaining scanner and deployment limitations

The three reported JavaScript findings are addressed by fixed upstream releases
or removal of the vulnerable dependency path. No advisory is suppressed, and no
package/version is renamed to clear the scanner.

The changed Solana dependency graph still requires an SBF build and validator/
devnet end-to-end verification on a supported Agave toolchain before deployment.
This environment does not have a usable `cargo build-sbf`; passing host tests
does not establish on-chain compute consumption or deployment readiness.