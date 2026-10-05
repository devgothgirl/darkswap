//! Phase 1 gate on the Solana side: Solana's Poseidon and Groth16 verifier
//! agree with the circuit on the same fixtures the EVM tests use.

use darkswap_verifier_parity::merkle::{Tree, TreeError, LEVELS, ROOT_HISTORY, TREE_STATE_LEN, ZERO_LEAF};
use darkswap_verifier_parity::{negate_g1, poseidon, verify_transaction, Field, VerifyError};
use serde::Deserialize;

#[derive(Deserialize)]
struct Vector {
    inputs: Vec<String>,
    out: String,
}
#[derive(Deserialize)]
struct TreeFixture {
    leaves: Vec<String>,
    root: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Hashes {
    field: String,
    levels: usize,
    zero_leaf: String,
    zeros: Vec<String>,
    empty_root: String,
    poseidon: Vec<Vector>,
    tree: TreeFixture,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Proof {
    name: String,
    a: Vec<String>,
    b: Vec<String>,
    c: Vec<String>,
    public_signals: Vec<String>,
}
#[derive(Deserialize)]
struct Proofs {
    proofs: Vec<Proof>,
}

fn f(hex_str: &str) -> Field {
    let bytes = hex::decode(hex_str.trim_start_matches("0x")).expect("hex");
    bytes.try_into().expect("32 bytes")
}
fn cat<const N: usize>(parts: &[String]) -> [u8; N] {
    let mut out = [0u8; N];
    for (i, p) in parts.iter().enumerate() {
        out[i * 32..(i + 1) * 32].copy_from_slice(&f(p));
    }
    out
}
fn hashes() -> Hashes {
    serde_json::from_str(include_str!("../../../fixtures/hashes.json")).unwrap()
}
fn proofs() -> Vec<Proof> {
    let p: Proofs = serde_json::from_str(include_str!("../../../fixtures/proofs.json")).unwrap();
    p.proofs
}
fn parts(p: &Proof) -> ([u8; 64], [u8; 128], [u8; 64], [Field; 8]) {
    let mut public = [[0u8; 32]; 8];
    for (i, s) in p.public_signals.iter().enumerate() {
        public[i] = f(s);
    }
    (cat::<64>(&p.a), cat::<128>(&p.b), cat::<64>(&p.c), public)
}
/// big-endian a + 1
fn plus_one(a: &Field) -> Field {
    let mut out = *a;
    for i in (0..32).rev() {
        let (v, carry) = out[i].overflowing_add(1);
        out[i] = v;
        if !carry {
            break;
        }
    }
    out
}

#[test]
fn poseidon_matches_circuit() {
    let h = hashes();
    assert_eq!(h.poseidon.len(), 16);
    for v in &h.poseidon {
        let inputs: Vec<Field> = v.inputs.iter().map(|s| f(s)).collect();
        let refs: Vec<&Field> = inputs.iter().collect();
        assert_eq!(poseidon(&refs).unwrap(), f(&v.out), "arity {}", inputs.len());
    }
}

#[test]
fn poseidon_rejects_input_outside_field() {
    let h = hashes();
    let modulus = f(&h.field);
    assert!(poseidon(&[&modulus]).is_none());
}

fn fresh_tree(buf: &mut Vec<u8>) -> Tree<'_> {
    buf.clear();
    buf.resize(TREE_STATE_LEN, 0);
    let mut t = Tree::new(buf).unwrap();
    t.initialize();
    t
}

#[test]
fn zero_leaf_and_empty_tree() {
    let h = hashes();
    assert_eq!(h.levels, LEVELS);
    assert_eq!(ZERO_LEAF, f(&h.zero_leaf));
    let mut buf = Vec::new();
    let tree = fresh_tree(&mut buf);
    for (i, z) in h.zeros.iter().enumerate() {
        assert_eq!(tree.zero(i), f(z), "zero hash {i}");
    }
    assert_eq!(tree.root(), f(&h.empty_root));
}

#[test]
fn tree_root_matches_circuit() {
    let h = hashes();
    let mut buf = Vec::new();
    let mut tree = fresh_tree(&mut buf);
    for i in (0..h.tree.leaves.len()).step_by(2) {
        let index = tree.insert_pair(&f(&h.tree.leaves[i]), &f(&h.tree.leaves[i + 1])).unwrap();
        assert_eq!(index, i as u64);
    }
    assert_eq!(tree.next_index(), h.tree.leaves.len() as u64);
    assert_eq!(tree.root(), f(&h.tree.root));
    assert!(tree.is_known_root(&f(&h.tree.root)));
    assert!(tree.is_known_root(&f(&h.empty_root)), "older roots stay valid");
    assert!(!tree.is_known_root(&[0u8; 32]));
}

#[test]
fn root_history_forgets_after_256_inserts() {
    let mut buf = Vec::new();
    let mut tree = fresh_tree(&mut buf);
    let first = tree.root();
    for i in 0..(ROOT_HISTORY as u32 - 1) {
        let mut leaf = [0u8; 32];
        leaf[28..].copy_from_slice(&(i + 1).to_be_bytes());
        tree.insert_pair(&leaf, &ZERO_LEAF).unwrap();
    }
    assert!(tree.is_known_root(&first), "still one of the last 256 roots");
    tree.insert_pair(&[7u8; 32], &ZERO_LEAF).unwrap();
    assert!(!tree.is_known_root(&first));
    assert_eq!(tree.insert_count(), ROOT_HISTORY as u64);
}

#[test]
fn insert_rejects_leaf_outside_field() {
    let h = hashes();
    let mut buf = Vec::new();
    let mut tree = fresh_tree(&mut buf);
    let before = buf_snapshot(&tree);
    assert_eq!(tree.insert_pair(&f(&h.field), &ZERO_LEAF), Err(TreeError::LeafOutOfField));
    assert_eq!(tree.insert_pair(&ZERO_LEAF, &f(&h.field)), Err(TreeError::LeafOutOfField));
    assert_eq!(buf_snapshot(&tree), before, "a rejected insert changes nothing");
    assert_eq!(f(&h.field), darkswap_verifier_parity::SCALAR_FIELD_MODULUS);
}

#[test]
fn full_tree_is_detected_and_refuses_inserts() {
    let mut buf = Vec::new();
    {
        let tree = fresh_tree(&mut buf);
        assert!(!tree.is_full());
    }
    // next_index lives in the first 8 bytes
    buf[0..8].copy_from_slice(&((1u64 << LEVELS) - 2).to_le_bytes());
    let mut tree = Tree::new(&mut buf).unwrap();
    assert!(!tree.is_full(), "one pair still fits");
    tree.insert_pair(&[1u8; 32], &ZERO_LEAF).unwrap();
    assert!(tree.is_full());
    let root = tree.root();
    assert_eq!(tree.insert_pair(&[2u8; 32], &ZERO_LEAF), Err(TreeError::Full));
    assert!(tree.is_known_root(&root), "the last root stays valid");
}

#[test]
fn tree_needs_the_right_buffer_size() {
    let mut small = vec![0u8; TREE_STATE_LEN - 1];
    assert!(Tree::new(&mut small).is_err());
}

fn buf_snapshot(t: &Tree) -> (u64, u64, [u8; 32]) {
    (t.next_index(), t.insert_count(), t.root())
}

#[test]
fn verifier_accepts_every_proof() {
    let h = hashes();
    let all = proofs();
    assert_eq!(all.len(), 3);
    for p in &all {
        let (a, b, c, public) = parts(p);
        assert_eq!(public[0], f(&h.tree.root), "{}: public input 0 is the root", p.name);
        assert_eq!(verify_transaction(&a, &b, &c, &public), Ok(()), "{}", p.name);
    }
}

#[test]
fn verifier_rejects_changed_public_inputs() {
    for p in &proofs() {
        let (a, b, c, public) = parts(p);
        for i in 0..8 {
            let mut changed = public;
            changed[i] = plus_one(&public[i]);
            assert_eq!(
                verify_transaction(&a, &b, &c, &changed),
                Err(VerifyError::InvalidProof),
                "{} input {i}",
                p.name
            );
        }
    }
}

#[test]
fn verifier_rejects_proof_for_another_transaction() {
    let all = proofs();
    let (a, b, c, _) = parts(&all[0]);
    let (_, _, _, other_public) = parts(&all[1]);
    assert_eq!(verify_transaction(&a, &b, &c, &other_public), Err(VerifyError::InvalidProof));
}

#[test]
fn verifier_rejects_input_outside_field() {
    let h = hashes();
    let all = proofs();
    let (a, b, c, mut public) = parts(&all[0]);
    // nullifier + field modulus: same value modulo the field, not canonical.
    let modulus = f(&h.field);
    let mut carry = 0u16;
    for i in (0..32).rev() {
        let sum = public[4][i] as u16 + modulus[i] as u16 + carry;
        public[4][i] = sum as u8;
        carry = sum >> 8;
    }
    assert_eq!(carry, 0, "fixture nullifier + modulus must fit 256 bits for this test");
    assert_eq!(verify_transaction(&a, &b, &c, &public), Err(VerifyError::InvalidProof));
}

#[test]
fn verifier_rejects_tampered_proof_points() {
    let all = proofs();
    let (a, b, c, public) = parts(&all[0]);
    let (a2, _, c2, _) = parts(&all[1]);
    assert_eq!(verify_transaction(&a2, &b, &c, &public), Err(VerifyError::InvalidProof));
    assert_eq!(verify_transaction(&a, &b, &c2, &public), Err(VerifyError::InvalidProof));
    // The un-negated check: A must be negated exactly once.
    let neg = negate_g1(&a).unwrap();
    assert_eq!(verify_transaction(&neg, &b, &c, &public), Err(VerifyError::InvalidProof));
    assert_eq!(negate_g1(&neg).unwrap(), a, "negating twice gives the point back");
}

#[test]
fn negate_rejects_coordinates_outside_base_field() {
    let bad = [0xffu8; 64];
    assert_eq!(negate_g1(&bad), Err(VerifyError::MalformedProof));
}
