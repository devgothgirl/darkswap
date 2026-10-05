#!/usr/bin/env bash
# Test every Solana crate against the canonical audited workspace lockfile.
# Never update dependencies implicitly or fall back to an unaudited copy.
set -euo pipefail
cd "$(dirname "$0")/.."

cargo test --manifest-path solana/Cargo.toml --workspace --release --locked
