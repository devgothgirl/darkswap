//! Append-only Poseidon Merkle tree, depth 26. Leaves go in pairs (one
//! transaction = one pair = one new root), as in `evm/src/MerkleTree.sol`.
//!
//! The tree lives in a byte slice so a Solana program can keep it inside an
//! account and update it in place (a Solana stack frame is only 4 KB).
//!
//! Layout (little-endian integers):
//!   0..8     next_index         u64   leaves inserted (always even)
//!   8..16    insert_count       u64   pair inserts
//!   16..20   current_root_slot  u32   slot in `roots` holding the current root
//!   20..24   padding
//!   24..     filled_subtrees    26 x 32
//!   ..       zeros              27 x 32
//!   ..       roots              ROOT_HISTORY x 32 (ring buffer)

use crate::{is_field_element, poseidon, Field};

pub const LEVELS: usize = 26;
/// A proof may use any of the last ROOT_HISTORY roots.
pub const ROOT_HISTORY: usize = 256;

const NEXT_INDEX: usize = 0;
const INSERT_COUNT: usize = 8;
const CURRENT_SLOT: usize = 16;
const FILLED: usize = 24;
const ZEROS: usize = FILLED + LEVELS * 32;
const ROOTS: usize = ZEROS + (LEVELS + 1) * 32;
pub const TREE_STATE_LEN: usize = ROOTS + ROOT_HISTORY * 32;

/// keccak256("darkswap.zero") mod the BN254 scalar field, big-endian.
pub const ZERO_LEAF: Field = [
    0x19, 0x74, 0xe4, 0x6e, 0xaf, 0x13, 0xb1, 0x2b, 0x63, 0x44, 0x05, 0xdd, 0x20, 0x04, 0x7c, 0xb9,
    0x0e, 0x6b, 0x5e, 0xae, 0xf4, 0x82, 0xaa, 0x2e, 0x2c, 0x53, 0x14, 0xd1, 0x96, 0xd3, 0x2d, 0x9b,
];

#[derive(Debug, PartialEq, Eq)]
pub enum TreeError {
    Full,
    LeafOutOfField,
    BadLength,
}

pub struct Tree<'a> {
    data: &'a mut [u8],
}

fn get32(data: &[u8], at: usize) -> Field {
    let mut out = [0u8; 32];
    out.copy_from_slice(&data[at..at + 32]);
    out
}

impl<'a> Tree<'a> {
    pub fn new(data: &'a mut [u8]) -> Result<Self, TreeError> {
        if data.len() != TREE_STATE_LEN {
            return Err(TreeError::BadLength);
        }
        Ok(Self { data })
    }

    /// Fills in the empty tree. Call once, on a zeroed buffer.
    pub fn initialize(&mut self) {
        let mut zero = ZERO_LEAF;
        for i in 0..LEVELS {
            self.put(ZEROS + i * 32, &zero);
            self.put(FILLED + i * 32, &zero);
            zero = poseidon(&[&zero, &zero]).expect("zero hashes are in the field");
        }
        self.put(ZEROS + LEVELS * 32, &zero);
        self.put(ROOTS, &zero);
        self.set_u64(NEXT_INDEX, 0);
        self.set_u64(INSERT_COUNT, 0);
        self.data[CURRENT_SLOT..CURRENT_SLOT + 4].copy_from_slice(&0u32.to_le_bytes());
    }

    pub fn next_index(&self) -> u64 {
        self.u64_at(NEXT_INDEX)
    }

    /// True when no further pair fits.
    pub fn is_full(&self) -> bool {
        self.next_index() + 2 > 1u64 << LEVELS
    }

    pub fn insert_count(&self) -> u64 {
        self.u64_at(INSERT_COUNT)
    }

    pub fn zero(&self, level: usize) -> Field {
        get32(self.data, ZEROS + level * 32)
    }

    pub fn root(&self) -> Field {
        get32(self.data, ROOTS + self.current_slot() * 32)
    }

    /// True if `candidate` is the current root or one of the
    /// ROOT_HISTORY - 1 before it.
    pub fn is_known_root(&self, candidate: &Field) -> bool {
        if *candidate == [0u8; 32] {
            return false;
        }
        self.data[ROOTS..].chunks_exact(32).any(|r| r == candidate)
    }

    /// Inserts two leaves at next_index and next_index + 1. Returns the
    /// index of the first. Nothing changes if it fails.
    pub fn insert_pair(&mut self, left: &Field, right: &Field) -> Result<u64, TreeError> {
        if !is_field_element(left) || !is_field_element(right) {
            return Err(TreeError::LeafOutOfField);
        }
        let index = self.next_index();
        if index + 2 > 1u64 << LEVELS {
            return Err(TreeError::Full);
        }
        let mut node = poseidon(&[left, right]).ok_or(TreeError::LeafOutOfField)?;
        let mut position = index >> 1;
        for i in 1..LEVELS {
            if position & 1 == 0 {
                self.put(FILLED + i * 32, &node);
                let zero = self.zero(i);
                node = poseidon(&[&node, &zero]).ok_or(TreeError::LeafOutOfField)?;
            } else {
                let filled = get32(self.data, FILLED + i * 32);
                node = poseidon(&[&filled, &node]).ok_or(TreeError::LeafOutOfField)?;
            }
            position >>= 1;
        }
        let slot = (self.current_slot() + 1) % ROOT_HISTORY;
        self.put(ROOTS + slot * 32, &node);
        self.data[CURRENT_SLOT..CURRENT_SLOT + 4].copy_from_slice(&(slot as u32).to_le_bytes());
        self.set_u64(NEXT_INDEX, index + 2);
        let count = self.insert_count() + 1;
        self.set_u64(INSERT_COUNT, count);
        Ok(index)
    }

    fn current_slot(&self) -> usize {
        let mut b = [0u8; 4];
        b.copy_from_slice(&self.data[CURRENT_SLOT..CURRENT_SLOT + 4]);
        u32::from_le_bytes(b) as usize % ROOT_HISTORY
    }

    fn put(&mut self, at: usize, value: &Field) {
        self.data[at..at + 32].copy_from_slice(value);
    }

    fn u64_at(&self, at: usize) -> u64 {
        let mut b = [0u8; 8];
        b.copy_from_slice(&self.data[at..at + 8]);
        u64::from_le_bytes(b)
    }

    fn set_u64(&mut self, at: usize, value: u64) {
        self.data[at..at + 8].copy_from_slice(&value.to_le_bytes());
    }
}
