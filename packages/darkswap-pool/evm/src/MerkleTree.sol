// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {PoseidonT3} from "poseidon-solidity/PoseidonT3.sol";

/// @notice Append-only Poseidon Merkle tree, depth 26. Leaves are always
/// inserted in pairs (one transaction = one pair = one new root), which
/// halves the hashing and makes a root stay valid for ROOT_WINDOW
/// transactions. It produces exactly the roots the circuit proves against.
contract MerkleTree {
    uint256 public constant FIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 public constant LEVELS = 26;
    /// A proof may use any of the last ROOT_WINDOW roots.
    uint256 public constant ROOT_WINDOW = 1000;
    /// keccak256("darkswap.zero") % FIELD. No note commitment is known to equal it.
    uint256 public constant ZERO_LEAF = uint256(keccak256("darkswap.zero")) % FIELD;

    /// Number of leaves inserted so far (always even).
    uint256 public nextIndex;
    /// Number of pair inserts so far.
    uint256 public insertCount;
    uint256 public root;
    uint256[LEVELS + 1] public zeros;
    uint256[LEVELS] public filledSubtrees;
    /// root => insertCount + 1 at the moment it became the current root.
    mapping(uint256 => uint256) public rootSeq;

    error TreeFull();
    error LeafOutOfField();

    constructor() {
        uint256 zero = ZERO_LEAF;
        for (uint256 i = 0; i < LEVELS; i++) {
            zeros[i] = zero;
            filledSubtrees[i] = zero;
            zero = PoseidonT3.hash([zero, zero]);
        }
        zeros[LEVELS] = zero;
        root = zero;
        rootSeq[zero] = 1;
    }

    /// @notice True if `candidate` is the current root or one of the
    /// ROOT_WINDOW - 1 before it.
    function isKnownRoot(uint256 candidate) public view returns (bool) {
        uint256 seq = rootSeq[candidate];
        if (seq == 0) return false;
        return insertCount + 1 - seq < ROOT_WINDOW;
    }

    /// @dev Inserts two leaves at positions nextIndex and nextIndex + 1.
    /// Returns the index of the first.
    function _insertPair(uint256 left, uint256 right) internal returns (uint256 index) {
        if (left >= FIELD || right >= FIELD) revert LeafOutOfField();
        index = nextIndex;
        if (index + 2 > 2 ** LEVELS) revert TreeFull();

        uint256 node = PoseidonT3.hash([left, right]);
        uint256 position = index >> 1;
        for (uint256 i = 1; i < LEVELS; i++) {
            if (position & 1 == 0) {
                filledSubtrees[i] = node;
                node = PoseidonT3.hash([node, zeros[i]]);
            } else {
                node = PoseidonT3.hash([filledSubtrees[i], node]);
            }
            position >>= 1;
        }

        nextIndex = index + 2;
        uint256 count = insertCount + 1;
        insertCount = count;
        root = node;
        rootSeq[node] = count + 1;
    }
}
