# Manifest-only compatibility patches

These directories contain upstream source, unchanged. Their manifests make two
narrow dependency substitutions that are unavailable in a published compatible
parent release:

| Crate | Upstream archive SHA-256 | Manifest change |
| --- | --- | --- |
| ark-ff 0.5.0 | `a177aba0ed1e0fbb62aa9f6d0502e9b46dad8c2eab04c14258a1212d2557ea70` | Replace unmaintained `paste` with maintained `pastey` 0.2.3, using the existing `paste` import alias. |
| groth16-solana 0.2.0 | `3a6d1ffb18dbf5cfc60b11bd7da88474c672870247c1e5b498619bcb6ba3d8f5` | Replace `solana-bn254` 2.x (Arkworks 0.4 / derivative) with 3.2.1 (Arkworks 0.5). |

Upstream archives:

- https://static.crates.io/crates/ark-ff/ark-ff-0.5.0.crate
- https://static.crates.io/crates/groth16-solana/groth16-solana-0.2.0.crate

The upstream README and license files are retained. `groth16-solana`'s upstream
manifest declares MIT while its included LICENSE and README say Apache-2.0;
those upstream documents have not been rewritten.

The workspace-level `[patch.crates-io]` declarations apply these changes to every
Solana crate. Do not restore nested independent Cargo lockfiles or add patches
to a leaf manifest (Cargo ignores leaf patches in a workspace).

No verification algorithms, arithmetic, syscall invocation code, proof formats,
circuits, verifying keys, proving keys or fixtures were changed. Rust parity
tests verify the existing proofs, invalid proofs, field bounds, Poseidon hashes
and Merkle roots. Pool golden tests also verify SystemInstruction wire bytes,
account metadata, program addresses and external-data hashing.

The workspace lockfile targets the installed Rust 1.88 compiler. Some newer
Solana minor releases forward to higher-MSRV major implementations, even when
the wrapper's own manifest does not declare that requirement. Review the whole
resolved graph when updating; never rewrite the lockfile during tests.

Host tests do not replace an SBF build or a validator/devnet run. Perform those
checks with a supported Agave toolchain before deploying the migrated program.