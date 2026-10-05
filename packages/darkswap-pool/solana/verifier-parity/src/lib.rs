//! DarkSwap phase 1, Solana side.
//!
//! The same three pieces the on-chain pool program will use:
//!   * `poseidon`  - Solana's Poseidon syscall (BN254, circom parameters)
//!   * `merkle`    - the append-only note tree
//!   * `verify_transaction` - Groth16 check of one join-split proof
//!
//! Off-chain (in `cargo test`) the syscalls fall back to the same arithmetic
//! in pure Rust, so these tests exercise the code path the program will run.

pub mod merkle;
pub mod verifying_key;

use groth16_solana::groth16::Groth16Verifier;
use solana_poseidon::{hashv, Endianness, Parameters};
use verifying_key::{NR_PUBLIC_INPUTS, VERIFYING_KEY};

pub type Field = [u8; 32];

/// Order of the public inputs, fixed by the circuit.
pub const PUBLIC_INPUT_NAMES: [&str; NR_PUBLIC_INPUTS] = [
    "root",
    "publicAmount",
    "extDataHash",
    "publicAssetId",
    "inputNullifier[0]",
    "inputNullifier[1]",
    "outputCommitment[0]",
    "outputCommitment[1]",
];

/// BN254 base-field modulus, big-endian. Used to negate a G1 point.
const BASE_FIELD_MODULUS: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x97, 0x81, 0x6a, 0x91, 0x68, 0x71, 0xca, 0x8d, 0x3c, 0x20, 0x8c, 0x16, 0xd8, 0x7c, 0xfd, 0x47,
];

/// BN254 scalar-field modulus, big-endian. Notes, nullifiers and roots live here.
pub const SCALAR_FIELD_MODULUS: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91, 0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x01,
];

/// True if `value` is a canonical field element (below the scalar modulus).
pub fn is_field_element(value: &Field) -> bool {
    less_than(value, &SCALAR_FIELD_MODULUS)
}

#[derive(Debug, PartialEq, Eq)]
pub enum VerifyError {
    /// A coordinate of proof point A is not below the base-field modulus.
    MalformedProof,
    /// The proof does not verify for these public inputs.
    InvalidProof,
}

/// Poseidon over BN254 with circom parameters; inputs and output are 32-byte
/// big-endian field elements. Returns None if an input is not in the field.
pub fn poseidon(inputs: &[&Field]) -> Option<Field> {
    let slices: Vec<&[u8]> = inputs.iter().map(|x| &x[..]).collect();
    hashv(Parameters::Bn254X5, Endianness::BigEndian, &slices)
        .ok()
        .map(|h| h.to_bytes())
}

/// big-endian a < b
fn less_than(a: &[u8; 32], b: &[u8; 32]) -> bool {
    a.iter().zip(b.iter()).find(|(x, y)| x != y).map_or(false, |(x, y)| x < y)
}

/// Returns -A for a G1 point given as x || y (big-endian).
/// Groth16 verifiers on Solana take the proof's A point negated; doing it
/// here means clients send the proof exactly as snarkjs produced it.
pub fn negate_g1(point: &[u8; 64]) -> Result<[u8; 64], VerifyError> {
    let mut x = [0u8; 32];
    let mut y = [0u8; 32];
    x.copy_from_slice(&point[..32]);
    y.copy_from_slice(&point[32..]);
    if !less_than(&x, &BASE_FIELD_MODULUS) || !less_than(&y, &BASE_FIELD_MODULUS) {
        return Err(VerifyError::MalformedProof);
    }
    let mut out = *point;
    if y != [0u8; 32] {
        let mut borrow = 0i16;
        for i in (0..32).rev() {
            let mut d = BASE_FIELD_MODULUS[i] as i16 - y[i] as i16 - borrow;
            if d < 0 {
                d += 256;
                borrow = 1;
            } else {
                borrow = 0;
            }
            out[32 + i] = d as u8;
        }
    }
    Ok(out)
}

/// Verifies one join-split proof against the embedded verifying key.
///
/// `proof_a`, `proof_c`: G1 as x || y. `proof_b`: G2 as x.c1 || x.c0 || y.c1 || y.c0.
/// All coordinates and public inputs are 32-byte big-endian. Public inputs
/// that are not canonical field elements are rejected.
pub fn verify_transaction(
    proof_a: &[u8; 64],
    proof_b: &[u8; 128],
    proof_c: &[u8; 64],
    public_inputs: &[Field; NR_PUBLIC_INPUTS],
) -> Result<(), VerifyError> {
    let neg_a = negate_g1(proof_a)?;
    let mut verifier = Groth16Verifier::new(&neg_a, proof_b, proof_c, public_inputs, &VERIFYING_KEY)
        .map_err(|_| VerifyError::InvalidProof)?;
    verifier.verify().map_err(|_| VerifyError::InvalidProof)
}
