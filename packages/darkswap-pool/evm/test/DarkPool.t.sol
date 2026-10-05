// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {PoseidonT5} from "poseidon-solidity/PoseidonT5.sol";
import {DarkPool, IGroth16Verifier, ISanctionsList} from "../src/DarkPool.sol";
import {MerkleTree} from "../src/MerkleTree.sol";
import {Fixtures} from "./Fixtures.sol";

/// Accepts any proof until `expect` is called; then accepts only those exact
/// public signals. Lets tests check what the pool asks the verifier.
contract SpyVerifier is IGroth16Verifier {
    uint256[8] public expected;
    bool public strict;

    function expect(uint256[8] calldata pub) external {
        expected = pub;
        strict = true;
    }

    function verifyProof(uint256[2] calldata, uint256[2][2] calldata, uint256[2] calldata, uint256[8] calldata pub)
        external
        view
        returns (bool)
    {
        if (!strict) return true;
        for (uint256 i = 0; i < 8; i++) {
            if (pub[i] != expected[i]) return false;
        }
        return true;
    }
}

contract Token is ERC20 {
    constructor() ERC20("Test", "TST") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// Takes 1% of every transfer, like USDT can.
contract FeeToken is ERC20 {
    constructor() ERC20("Fee", "FEE") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 cut = value / 100;
            super._update(from, address(0xdead), cut);
            value -= cut;
        }
        super._update(from, to, value);
    }
}

contract Sanctions is ISanctionsList {
    mapping(address => bool) public bad;

    function set(address a) external {
        bad[a] = true;
    }

    function isSanctioned(address a) external view returns (bool) {
        return bad[a];
    }
}

/// Tries to re-enter the pool while being paid.
contract Reenterer {
    DarkPool pool;
    bool public tried;
    bool public reentered;

    constructor(DarkPool p) {
        pool = p;
    }

    receive() external payable {
        if (!tried) {
            tried = true;
            try pool.shield{value: 0}(pool.ETH(), 0, 1, 1, "") {
                reentered = true;
            } catch {}
        }
    }
}

contract DarkPoolTest is Test {
    DarkPool pool;
    SpyVerifier verifier;
    Token token;
    FeeToken feeToken;
    Sanctions sanctions;
    address ETH;
    address owner = address(0xA11);
    address alice = address(0xA1);
    address relayer = address(0xBEEF);
    address feeRecipient = address(0xFEE);
    uint16 constant FEE_BPS = 50; // 0.5%
    uint256 constant FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

    function setUp() public {
        verifier = new SpyVerifier();
        sanctions = new Sanctions();
        pool = new DarkPool(address(verifier), address(sanctions), block.timestamp + 30 days, owner, feeRecipient, FEE_BPS);
        ETH = pool.ETH();
        token = new Token();
        feeToken = new FeeToken();
        vm.startPrank(owner);
        pool.listAsset(ETH, 0.001 ether, 10 ether, 100 ether);
        pool.listAsset(address(token), 1e18, 1_000e18, 10_000e18);
        pool.listAsset(address(feeToken), 1e18, 1_000e18, 10_000e18);
        vm.stopPrank();
        vm.deal(alice, 1_000 ether);
        token.mint(alice, 100_000e18);
        feeToken.mint(alice, 100_000e18);
        vm.prank(alice);
        token.approve(address(pool), type(uint256).max);
        vm.prank(alice);
        feeToken.approve(address(pool), type(uint256).max);
    }

    // ------------------------------------------------------------ helpers

    function proofWith(uint256 root, uint256 n0, uint256 n1) internal pure returns (DarkPool.Proof memory p) {
        p.root = root;
        p.inputNullifiers = [n0, n1];
        p.outputCommitments = [uint256(111), uint256(222)];
    }

    function ext(address recipient, int256 extAmount, uint256 fee, address tok)
        internal
        view
        returns (DarkPool.ExtData memory e)
    {
        e.recipient = recipient;
        e.extAmount = extAmount;
        e.relayer = relayer;
        e.fee = fee;
        e.token = tok;
        e.encryptedOutput1 = hex"01";
        e.encryptedOutput2 = hex"02";
    }

    function fee(uint256 amount) internal pure returns (uint256) {
        return (amount * FEE_BPS + 9_999) / 10_000;
    }

    function shieldEth(uint256 amount) internal returns (uint256) {
        vm.prank(alice);
        return pool.shield{value: amount + fee(amount)}(ETH, amount, 7, 8, hex"aa");
    }

    function balanceOf(address tok) internal view returns (uint128 b) {
        (,,,,, b) = pool.assets(tok);
    }

    // ------------------------------------------------------------- shield

    function test_shieldEthCreatesTheExpectedNote() public {
        uint256 index = shieldEth(1 ether);
        assertEq(index, 0);
        uint256 commitment = PoseidonT5.hash([uint256(1 ether), uint256(uint160(ETH)), uint256(7), uint256(8)]);
        uint256 expectedRoot = _rootOfFirstPair(commitment, pool.ZERO_LEAF());
        assertEq(pool.root(), expectedRoot, "root after shield");
        assertEq(pool.nextIndex(), 2);
        assertEq(balanceOf(ETH), 1 ether, "note books exclude the fee");
        assertEq(pool.protocolFees(ETH), 0.005 ether, "0.5% fee accrued");
        assertEq(address(pool).balance, 1.005 ether);
    }

    function test_shieldRefusesFeeOnTransferToken() public {
        vm.prank(alice);
        vm.expectRevert(DarkPool.BadTransferAmount.selector);
        pool.shield(address(feeToken), 100e18, 7, 8, "");
    }

    function test_shieldBelowMinimumRefused() public {
        vm.prank(alice);
        vm.expectRevert(DarkPool.UnderDepositMinimum.selector);
        pool.shield{value: 2 wei}(ETH, 1 wei, 7, 8, "");
    }

    function test_fullTreeStillWithdraws() public {
        shieldEth(5 ether);
        uint256 root = pool.root();
        // pretend the tree is full (slot 0 is nextIndex)
        vm.store(address(pool), bytes32(uint256(0)), bytes32(uint256(2 ** 26)));
        vm.prank(alice);
        vm.expectRevert(MerkleTree.TreeFull.selector);
        pool.shield{value: 1.005 ether}(ETH, 1 ether, 7, 8, "");
        address bob = address(0xB0B);
        pool.transact(proofWith(root, 91, 92), ext(bob, -5 ether, 0, ETH));
        assertEq(bob.balance, 4.975 ether, "withdrawal works on a full tree");
        assertTrue(pool.isKnownRoot(root), "the last root stays valid");
        assertTrue(pool.nullifierSpent(91));
    }

    function test_zeroNetWithTokenRefused() public {
        // extAmount == fee: publicAmount would be 0 and the circuit would not
        // tie the notes to the token, so the pool refuses.
        shieldEth(1 ether);
        DarkPool.ExtData memory e = ext(address(0xB0B), 1 ether, 1 ether, ETH);
        DarkPool.Proof memory p = proofWith(pool.root(), 93, 94);
        vm.expectRevert(DarkPool.BadExtData.selector);
        pool.transact{value: 1 ether}(p, e);
    }

    function test_listingTwiceRefused() public {
        vm.prank(owner);
        vm.expectRevert(DarkPool.BadExtData.selector);
        pool.listAsset(ETH, 1, 1, 1);
    }

    function test_shieldRejects() public {
        vm.startPrank(alice);
        vm.expectRevert(DarkPool.BadEthValue.selector);
        pool.shield{value: 1 ether}(ETH, 2 ether, 7, 8, "");
        vm.expectRevert(DarkPool.BadEthValue.selector);
        pool.shield{value: 1 ether}(ETH, 1 ether, 7, 8, ""); // forgot the fee
        vm.expectRevert(DarkPool.BadEthValue.selector);
        pool.shield{value: 1}(address(token), 10, 7, 8, "");
        vm.expectRevert(DarkPool.AssetNotListed.selector);
        pool.shield(address(0x1234), 10, 7, 8, "");
        vm.expectRevert(DarkPool.InputOutOfField.selector);
        pool.shield{value: 2}(ETH, 1, FIELD, 8, "");
        vm.expectRevert(DarkPool.InputOutOfField.selector);
        pool.shield{value: 2}(ETH, 1, 7, FIELD, "");
        vm.expectRevert(DarkPool.AmountOutOfRange.selector);
        pool.shield{value: 0}(ETH, 0, 7, 8, "");
        vm.expectRevert(DarkPool.OverDepositLimit.selector);
        pool.shield{value: 11.055 ether}(ETH, 11 ether, 7, 8, "");
        vm.stopPrank();
    }

    function test_depositCap() public {
        for (uint256 i = 0; i < 10; i++) shieldEth(10 ether);
        vm.prank(alice);
        vm.expectRevert(DarkPool.OverDepositCap.selector);
        pool.shield{value: 0.001005 ether}(ETH, 0.001 ether, 7, 8, "");
    }

    function test_sanctionedDepositorRejected() public {
        sanctions.set(alice);
        vm.prank(alice);
        vm.expectRevert(DarkPool.Sanctioned.selector);
        pool.shield{value: 1.005 ether}(ETH, 1 ether, 7, 8, "");
    }

    function test_directEthRejected() public {
        vm.prank(alice);
        (bool ok,) = address(pool).call{value: 1 ether}("");
        assertFalse(ok);
    }

    // ----------------------------------------------------------- transact

    function test_unshieldPaysRecipientAndRelayer() public {
        shieldEth(5 ether);
        address bob = address(0xB0B);
        DarkPool.ExtData memory e = ext(bob, -2 ether, 0.01 ether, ETH);
        DarkPool.Proof memory p = proofWith(pool.root(), 11, 12);

        uint256[8] memory pub = [
            p.root,
            FIELD - 2.01 ether, // publicAmount = extAmount - fee, in the field
            pool.extDataHash(e),
            uint256(uint160(ETH)),
            11,
            12,
            111,
            222
        ];
        verifier.expect(pub);
        pool.transact(p, e);

        assertEq(bob.balance, 1.99 ether, "payout minus the 0.5% fee");
        assertEq(relayer.balance, 0.01 ether, "relayer fee untouched");
        assertEq(balanceOf(ETH), 5 ether - 2.01 ether, "the notes gave up the full 2.01");
        assertEq(pool.protocolFees(ETH), 0.025 ether + 0.01 ether, "shield fee + unshield fee");
        assertTrue(pool.nullifierSpent(11));
        assertTrue(pool.nullifierSpent(12));
        assertEq(pool.nextIndex(), 4);
    }

    function test_privateTransferHidesAsset() public {
        shieldEth(1 ether);
        DarkPool.ExtData memory e = ext(address(0), 0, 0, address(0));
        DarkPool.Proof memory p = proofWith(pool.root(), 21, 22);
        uint256[8] memory pub = [p.root, 0, pool.extDataHash(e), 0, 21, 22, 111, 222];
        verifier.expect(pub);
        pool.transact(p, e);
        assertEq(balanceOf(ETH), 1 ether, "no value moved");
    }

    function test_transferMustNotNameAToken() public {
        shieldEth(1 ether);
        DarkPool.ExtData memory e = ext(address(0), 0, 0, ETH);
        DarkPool.Proof memory p = proofWith(pool.root(), 21, 22);
        vm.expectRevert(DarkPool.BadExtData.selector);
        pool.transact(p, e);
    }

    function test_depositThroughProof() public {
        DarkPool.ExtData memory e = ext(address(0), 3 ether, 0, ETH);
        DarkPool.Proof memory p = proofWith(pool.root(), 31, 32);
        uint256[8] memory pub = [p.root, 3 ether, pool.extDataHash(e), uint256(uint160(ETH)), 31, 32, 111, 222];
        verifier.expect(pub);
        vm.prank(alice);
        vm.expectRevert(DarkPool.BadEthValue.selector);
        pool.transact{value: 3 ether}(p, e); // forgot the fee
        vm.prank(alice);
        pool.transact{value: 3.015 ether}(p, e);
        assertEq(balanceOf(ETH), 3 ether);
        assertEq(pool.protocolFees(ETH), 0.015 ether);
    }

    function test_depositThroughProofRefusesFeeOnTransferToken() public {
        DarkPool.ExtData memory e = ext(address(0), 100e18, 0, address(feeToken));
        DarkPool.Proof memory p = proofWith(pool.root(), 31, 32);
        vm.prank(alice);
        vm.expectRevert(DarkPool.BadTransferAmount.selector);
        pool.transact(p, e);
    }

    function test_doubleSpendRejected() public {
        shieldEth(5 ether);
        DarkPool.ExtData memory e = ext(address(0xB0B), -1 ether, 0, ETH);
        pool.transact(proofWith(pool.root(), 41, 42), e);
        uint256 root = pool.root();
        vm.expectRevert(DarkPool.NullifierAlreadySpent.selector);
        pool.transact(proofWith(root, 41, 43), e);
        vm.expectRevert(DarkPool.NullifierAlreadySpent.selector);
        pool.transact(proofWith(root, 44, 42), e);
    }

    function test_rejectsBadInputs() public {
        shieldEth(5 ether);
        uint256 root = pool.root();
        DarkPool.ExtData memory e = ext(address(0xB0B), -1 ether, 0, ETH);

        vm.expectRevert(DarkPool.UnknownRoot.selector);
        pool.transact(proofWith(12345, 1, 2), e);
        vm.expectRevert(DarkPool.DuplicateNullifier.selector);
        pool.transact(proofWith(root, 1, 1), e);
        vm.expectRevert(DarkPool.InputOutOfField.selector);
        pool.transact(proofWith(root, FIELD, 2), e);

        DarkPool.Proof memory p = proofWith(root, 1, 2);
        p.outputCommitments[0] = FIELD;
        vm.expectRevert(MerkleTree.LeafOutOfField.selector);
        pool.transact(p, e);

        e.extAmount = -int256(2 ** 128);
        vm.expectRevert(DarkPool.AmountOutOfRange.selector);
        pool.transact(proofWith(root, 1, 2), e);
        e.extAmount = -1 ether;
        e.fee = 2 ** 128;
        vm.expectRevert(DarkPool.AmountOutOfRange.selector);
        pool.transact(proofWith(root, 1, 2), e);

        e.fee = 0;
        e.recipient = address(0);
        vm.expectRevert(DarkPool.BadExtData.selector);
        pool.transact(proofWith(root, 1, 2), e);

        e.recipient = address(0xB0B);
        vm.expectRevert(DarkPool.BadEthValue.selector);
        pool.transact{value: 1}(proofWith(root, 1, 2), e);

        e.token = address(0x1234);
        vm.expectRevert(DarkPool.AssetNotListed.selector);
        pool.transact(proofWith(root, 1, 2), e);
    }

    function test_invalidProofRejected() public {
        shieldEth(1 ether);
        DarkPool.ExtData memory e = ext(address(0xB0B), -1 ether, 0, ETH);
        DarkPool.Proof memory p = proofWith(pool.root(), 1, 2);
        uint256[8] memory pub = [p.root, FIELD - 1 ether, pool.extDataHash(e), uint256(uint160(ETH)), 1, 2, 111, 222];
        verifier.expect(pub);
        // change the recipient after "proving": extDataHash no longer matches
        e.recipient = address(0xBAD);
        vm.expectRevert(DarkPool.InvalidProof.selector);
        pool.transact(p, e);
    }

    function test_oneAssetCannotPayOutAnother() public {
        // The pool holds 50 ETH but only 10 TST. Even with a proof that
        // "verifies", it cannot pay 11 TST.
        for (uint256 i = 0; i < 5; i++) shieldEth(10 ether);
        vm.prank(alice);
        pool.shield(address(token), 10e18, 7, 8, "");
        DarkPool.ExtData memory e = ext(address(0xB0B), -11e18, 0, address(token));
        uint256 root = pool.root();
        vm.expectRevert(DarkPool.InsufficientPoolBalance.selector);
        pool.transact(proofWith(root, 1, 2), e);
    }

    function test_extDataHashBindsChainAndPool() public {
        DarkPool.ExtData memory e = ext(address(0xB0B), -1 ether, 0, ETH);
        uint256 here = pool.extDataHash(e);
        DarkPool other = new DarkPool(address(verifier), address(0), block.timestamp, owner, feeRecipient, FEE_BPS);
        assertTrue(other.extDataHash(e) != here, "another pool, another hash");
        vm.chainId(999);
        assertTrue(pool.extDataHash(e) != here, "another chain, another hash");
        assertLt(here, FIELD);
    }

    function test_reentrancyBlocked() public {
        shieldEth(5 ether);
        Reenterer r = new Reenterer(pool);
        DarkPool.ExtData memory e = ext(address(r), -1 ether, 0, ETH);
        pool.transact(proofWith(pool.root(), 51, 52), e);
        assertTrue(r.tried());
        assertFalse(r.reentered());
        assertEq(address(r).balance, 0.995 ether);
    }

    // ------------------------------------------------------ protocol fee

    function test_feeRounding() public view {
        assertEq(pool.feeOn(10_000), 50);
        assertEq(pool.feeOn(1), 1, "rounds up");
        assertEq(pool.feeOn(199), 1);
        assertEq(pool.feeOn(201), 2);
    }

    function test_privateSendPaysNoFee() public {
        shieldEth(1 ether);
        uint256 before = pool.protocolFees(ETH);
        pool.transact(proofWith(pool.root(), 21, 22), ext(address(0), 0, 0, address(0)));
        assertEq(pool.protocolFees(ETH), before, "no fee on a private send");
    }

    function test_anyoneCanCollectFeesToTheFixedRecipient() public {
        shieldEth(2 ether);
        vm.prank(alice);
        pool.shield(address(token), 100e18, 7, 8, "");
        vm.prank(address(0x1234)); // a stranger
        pool.collectFees(ETH);
        assertEq(feeRecipient.balance, 0.01 ether);
        assertEq(pool.protocolFees(ETH), 0);
        pool.collectFees(address(token));
        assertEq(token.balanceOf(feeRecipient), 0.5e18);
        vm.expectRevert(DarkPool.NothingToCollect.selector);
        pool.collectFees(ETH);
        // the notes' money is untouched
        assertEq(balanceOf(ETH), 2 ether);
        assertEq(address(pool).balance, 2 ether);
    }

    function test_feesNeverMixWithNoteBooks() public {
        shieldEth(1 ether);
        // The pool holds 1.005 ETH: 1 for notes, 0.005 of fees. A proof for
        // 1.001 ETH out must fail even though the pool's balance covers it.
        DarkPool.ExtData memory e = ext(address(0xB0B), -1.001 ether, 0, ETH);
        uint256 root = pool.root();
        vm.expectRevert(DarkPool.InsufficientPoolBalance.selector);
        pool.transact(proofWith(root, 1, 2), e);
    }

    function test_feeCapAndOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        pool.setProtocolFee(10);
        vm.prank(owner);
        vm.expectRevert(DarkPool.FeeTooHigh.selector);
        pool.setProtocolFee(101);
        vm.prank(owner);
        pool.setProtocolFee(0);
        assertEq(pool.feeOn(1 ether), 0);
        vm.prank(alice);
        pool.shield{value: 1 ether}(ETH, 1 ether, 7, 8, ""); // no fee any more
        assertEq(pool.protocolFees(ETH), 0);
        vm.expectRevert(DarkPool.FeeTooHigh.selector);
        new DarkPool(address(verifier), address(0), block.timestamp, owner, feeRecipient, 101);
        vm.expectRevert(DarkPool.BadExtData.selector);
        new DarkPool(address(verifier), address(0), block.timestamp, owner, address(0), 10);
    }

    function test_invariant_poolBalanceEqualsBooksPlusFees() public {
        shieldEth(3 ether);
        shieldEth(1 ether);
        pool.transact(proofWith(pool.root(), 31, 32), ext(address(0xB0B), -1.5 ether, 0.01 ether, ETH));
        pool.transact(proofWith(pool.root(), 33, 34), ext(address(0), 0, 0, address(0)));
        assertEq(address(pool).balance, uint256(balanceOf(ETH)) + pool.protocolFees(ETH));
        pool.collectFees(ETH);
        assertEq(address(pool).balance, uint256(balanceOf(ETH)));
    }

    // -------------------------------------------------------------- admin

    function test_onlyOwnerAdmin() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        pool.listAsset(address(0x1234), 1, 1, 1);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        pool.setDepositsPaused(true);
    }

    function test_pausingStopsDepositsNotWithdrawals() public {
        shieldEth(5 ether);
        vm.prank(owner);
        pool.setDepositsPaused(true);
        vm.prank(alice);
        vm.expectRevert(DarkPool.DepositsAreOff.selector);
        pool.shield{value: 1.005 ether}(ETH, 1 ether, 7, 8, "");
        // withdrawals still work
        pool.transact(proofWith(pool.root(), 61, 62), ext(address(0xB0B), -1 ether, 0, ETH));
        assertEq(address(0xB0B).balance, 0.995 ether);
    }

    function test_pauseExpires() public {
        vm.warp(block.timestamp + 31 days);
        vm.prank(owner);
        vm.expectRevert(DarkPool.PauseWindowOver.selector);
        pool.setDepositsPaused(true);
    }

    function test_disabledAssetStillWithdraws() public {
        shieldEth(5 ether);
        vm.prank(owner);
        pool.updateAsset(ETH, false, 0, 0, 0);
        vm.prank(alice);
        vm.expectRevert(DarkPool.DepositsAreOff.selector);
        pool.shield{value: 1.005 ether}(ETH, 1 ether, 7, 8, "");
        pool.transact(proofWith(pool.root(), 71, 72), ext(address(0xB0B), -5 ether, 0, ETH));
        assertEq(address(0xB0B).balance, 4.975 ether);
    }

    function test_gas_shieldAndTransact() public {
        shieldEth(1 ether);
        uint256 g = gasleft();
        shieldEth(1 ether);
        emit log_named_uint("shield gas (mock verifier)", g - gasleft());
        DarkPool.ExtData memory e = ext(address(0xB0B), -1 ether, 0.01 ether, ETH);
        DarkPool.Proof memory p = proofWith(pool.root(), 81, 82);
        g = gasleft();
        pool.transact(p, e);
        emit log_named_uint("unshield gas, excluding proof check", g - gasleft());
    }

    // ------------------------------------------------------------ helpers

    function _rootOfFirstPair(uint256 left, uint256 right) internal view returns (uint256 node) {
        node = _h(left, right);
        for (uint256 i = 1; i < 26; i++) {
            node = _h(node, pool.zeros(i));
        }
    }

    function _h(uint256 a, uint256 b) internal pure returns (uint256) {
        return poseidonT3([a, b]);
    }

    function poseidonT3(uint256[2] memory x) internal pure returns (uint256) {
        return PoseidonT3Wrapper.hash(x);
    }
}

import {PoseidonT3} from "poseidon-solidity/PoseidonT3.sol";

library PoseidonT3Wrapper {
    function hash(uint256[2] memory x) internal pure returns (uint256) {
        return PoseidonT3.hash(x);
    }
}
