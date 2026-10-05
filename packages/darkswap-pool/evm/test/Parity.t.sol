// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PoseidonT2} from "poseidon-solidity/PoseidonT2.sol";
import {PoseidonT3} from "poseidon-solidity/PoseidonT3.sol";
import {PoseidonT4} from "poseidon-solidity/PoseidonT4.sol";
import {PoseidonT5} from "poseidon-solidity/PoseidonT5.sol";
import {MerkleTree} from "../src/MerkleTree.sol";
import {Groth16Verifier} from "../src/Groth16Verifier.sol";
import {Fixtures} from "./Fixtures.sol";

contract TreeHarness is MerkleTree {
    function insertPair(uint256 left, uint256 right) external returns (uint256) {
        return _insertPair(left, right);
    }
}

/// Phase 1 gate on the EVM side: Solidity computes the same hashes and tree
/// roots as the circuit, and accepts the same proofs.
contract ParityTest is Test {
    TreeHarness tree;
    Groth16Verifier verifier;

    function setUp() public {
        tree = new TreeHarness();
        verifier = new Groth16Verifier();
    }

    function hashN(uint256[] memory inputs) internal pure returns (uint256) {
        if (inputs.length == 1) return PoseidonT2.hash([inputs[0]]);
        if (inputs.length == 2) return PoseidonT3.hash([inputs[0], inputs[1]]);
        if (inputs.length == 3) return PoseidonT4.hash([inputs[0], inputs[1], inputs[2]]);
        if (inputs.length == 4) return PoseidonT5.hash([inputs[0], inputs[1], inputs[2], inputs[3]]);
        revert("arity");
    }

    function test_poseidonMatchesCircuit() public pure {
        for (uint256 i = 0; i < Fixtures.VECTOR_COUNT; i++) {
            (uint256[] memory inputs, uint256 expected) = Fixtures.vector(i);
            assertEq(hashN(inputs), expected, "poseidon vector");
        }
    }

    function test_zeroLeafAndEmptyTree() public view {
        assertEq(tree.ZERO_LEAF(), Fixtures.ZERO_LEAF, "zero leaf");
        uint256[] memory zeros = Fixtures.zeros();
        for (uint256 i = 0; i < zeros.length; i++) {
            assertEq(tree.zeros(i), zeros[i], "zero hash");
        }
        assertEq(tree.root(), Fixtures.EMPTY_ROOT, "empty root");
    }

    function test_treeRootMatchesCircuit() public {
        uint256[] memory leaves = Fixtures.leaves();
        for (uint256 i = 0; i < leaves.length; i += 2) {
            assertEq(tree.insertPair(leaves[i], leaves[i + 1]), i, "leaf index");
        }
        assertEq(tree.nextIndex(), leaves.length);
        assertEq(tree.root(), Fixtures.TREE_ROOT, "root after inserts");
        assertTrue(tree.isKnownRoot(Fixtures.TREE_ROOT));
        assertTrue(tree.isKnownRoot(Fixtures.EMPTY_ROOT), "older roots stay valid");
        assertFalse(tree.isKnownRoot(0));
        assertFalse(tree.isKnownRoot(12345));
    }

    function test_rootWindow() public {
        uint256 first = tree.root();
        tree.insertPair(1, 2);
        uint256 second = tree.root();
        // The first root was current at insert 0. It stays valid while it is
        // one of the last 1000 roots, i.e. up to insert 999.
        vm.store(address(tree), bytes32(uint256(1)), bytes32(uint256(999)));
        assertTrue(tree.isKnownRoot(first), "known while inside the window");
        vm.store(address(tree), bytes32(uint256(1)), bytes32(uint256(1000)));
        assertFalse(tree.isKnownRoot(first), "forgotten after ROOT_WINDOW inserts");
        assertTrue(tree.isKnownRoot(second));
        assertFalse(tree.isKnownRoot(0));
    }

    function test_insertRejectsLeafOutsideField() public {
        vm.expectRevert(MerkleTree.LeafOutOfField.selector);
        tree.insertPair(Fixtures.FIELD, 1);
        vm.expectRevert(MerkleTree.LeafOutOfField.selector);
        tree.insertPair(1, Fixtures.FIELD);
    }

    function test_verifierAcceptsEveryProof() public view {
        for (uint256 i = 0; i < Fixtures.PROOF_COUNT; i++) {
            (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c, uint256[8] memory pub) =
                Fixtures.proof(i);
            assertTrue(verifier.verifyProof(a, b, c, pub), "valid proof");
        }
    }

    function test_proofsUseTheTreeRoot() public pure {
        for (uint256 i = 0; i < Fixtures.PROOF_COUNT; i++) {
            (,,, uint256[8] memory pub) = Fixtures.proof(i);
            assertEq(pub[0], Fixtures.TREE_ROOT, "public signal 0 is the root");
        }
    }

    function test_verifierRejectsChangedPublicSignals() public view {
        for (uint256 i = 0; i < Fixtures.PROOF_COUNT; i++) {
            (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c, uint256[8] memory pub) =
                Fixtures.proof(i);
            for (uint256 s = 0; s < 8; s++) {
                uint256 saved = pub[s];
                pub[s] = addmod(saved, 1, Fixtures.FIELD);
                assertFalse(verifier.verifyProof(a, b, c, pub), "changed signal must fail");
                pub[s] = saved;
            }
        }
    }

    function test_verifierRejectsProofForAnotherTransaction() public view {
        (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c,) = Fixtures.proof(0);
        (,,, uint256[8] memory otherPub) = Fixtures.proof(1);
        assertFalse(verifier.verifyProof(a, b, c, otherPub));
    }

    function test_verifierRejectsSignalOutsideField() public view {
        (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c, uint256[8] memory pub) =
            Fixtures.proof(0);
        // Same value modulo the field, but not canonical: must not be accepted,
        // or one nullifier could be presented under two different numbers.
        pub[4] = pub[4] + Fixtures.FIELD;
        assertFalse(verifier.verifyProof(a, b, c, pub));
    }

    function test_gas_verifyProof() public {
        (uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c, uint256[8] memory pub) =
            Fixtures.proof(0);
        uint256 before = gasleft();
        bool ok = verifier.verifyProof(a, b, c, pub);
        uint256 used = before - gasleft();
        assertTrue(ok);
        emit log_named_uint("verifyProof gas", used);
    }

    function test_gas_treeInsertPair() public {
        uint256 before = gasleft();
        tree.insertPair(42, 43);
        emit log_named_uint("first pair insert gas", before - gasleft());
        before = gasleft();
        tree.insertPair(44, 45);
        emit log_named_uint("second pair insert gas", before - gasleft());
    }
}
