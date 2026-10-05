// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {PoseidonT5} from "poseidon-solidity/PoseidonT5.sol";
import {MerkleTree} from "./MerkleTree.sol";

interface IGroth16Verifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[8] calldata publicSignals
    ) external view returns (bool);
}

/// Chainalysis sanctions oracle interface.
interface ISanctionsList {
    function isSanctioned(address addr) external view returns (bool);
}

/// @title DarkPool
/// @notice Shielded pool for ETH and listed ERC-20 tokens.
///
/// Notes live in a Poseidon Merkle tree. `shield` puts value in with no
/// proof (the deposit is public). `transact` spends up to two notes with a
/// zero-knowledge proof and creates two new ones; it can also pay value out
/// (unshield) and pay a relayer. Whoever submits a `transact` learns nothing
/// they could change: recipient, relayer, fee and token are all bound into
/// the proof through `extDataHash`.
///
/// Protocol fee: a share of every shield and every unshield (never of a
/// private send) accrues in the pool, outside the notes' books, and anyone
/// can sweep it to `feeRecipient`. The recipient is fixed at deployment.
/// What happens to the money there (buying and burning $DARK, paying
/// holders) is that contract's policy, and is public. The fee rate can be
/// changed by the owner, never above MAX_PROTOCOL_FEE_BPS.
///
/// If the tree ever fills, deposits stop but withdrawals keep working.
///
/// What the owner can do: list tokens, set deposit limits, turn deposits on
/// or off per token, and pause all deposits until `guardianExpiry`.
/// What the owner can NOT do: move funds, pause or block withdrawals, change
/// the verifier, or upgrade this contract. There is no upgrade path.
contract DarkPool is MerkleTree, ReentrancyGuard, Ownable2Step {
    using SafeERC20 for IERC20;

    /// Stand-in address for native ETH.
    address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    /// Bound on external amounts and fees. Far below 2^248, so the circuit's
    /// balance equation can never wrap around the field.
    uint256 public constant MAX_AMOUNT = 2 ** 128;

    IGroth16Verifier public immutable verifier;
    /// Optional (address(0) = no check). Screens depositors.
    ISanctionsList public immutable sanctionsList;
    /// After this time deposits can no longer be paused by the owner.
    uint256 public immutable guardianExpiry;
    /// Where swept protocol fees go. Fixed for the life of the pool.
    address public immutable feeRecipient;
    /// Hard ceiling on the protocol fee: 1%.
    uint16 public constant MAX_PROTOCOL_FEE_BPS = 100;
    /// Current protocol fee on shields and unshields, in basis points.
    uint16 public protocolFeeBps;

    struct Asset {
        bool listed; // once listed, withdrawals always work
        bool depositsEnabled;
        uint128 minDeposit; // per deposit; makes filling the tree costly
        uint128 maxDeposit; // per deposit
        uint128 depositCap; // most the pool may hold of this asset
        uint128 balance; // what the pool holds for notes, by its own accounting
    }

    struct Proof {
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
        uint256 root;
        uint256[2] inputNullifiers;
        uint256[2] outputCommitments;
    }

    /// Everything the proof binds besides the notes. Hashed into extDataHash.
    struct ExtData {
        address recipient;
        int256 extAmount; // + value enters, - value leaves (before fee)
        address relayer;
        uint256 fee;
        address token; // address(0) only for a pure private transfer
        bytes encryptedOutput1;
        bytes encryptedOutput2;
    }

    bool public depositsPaused;
    mapping(address => Asset) public assets;
    mapping(uint256 => bool) public nullifierSpent;
    /// Protocol fees accrued and not yet swept, per token. Not part of any
    /// asset's balance, so they are never paid out as a note.
    mapping(address => uint256) public protocolFees;

    event NewCommitment(uint256 commitment, uint256 index, bytes encryptedOutput);
    event NewNullifier(uint256 nullifier);
    event Shielded(uint256 index, address token, uint256 amount, uint256 publicKey, uint256 blinding);
    event AssetListed(address token, uint128 minDeposit, uint128 maxDeposit, uint128 depositCap);
    event AssetUpdated(address token, bool depositsEnabled, uint128 minDeposit, uint128 maxDeposit, uint128 depositCap);
    event DepositsPaused(bool paused);
    /// kind: 0 = shield, 1 = unshield, 2 = deposit through a proof.
    event ProtocolFeeCharged(uint8 kind, address token, uint256 amount);
    event ProtocolFeesCollected(address token, uint256 amount, address to);
    event ProtocolFeeSet(uint16 bps);
    /// The tree is full: this transaction's outputs were not stored. Only
    /// withdrawals that leave nothing behind make sense from here on.
    event OutputsDiscarded(uint256 commitment0, uint256 commitment1);

    error DepositsAreOff();
    error AssetNotListed();
    error AmountOutOfRange();
    error OverDepositLimit();
    error UnderDepositMinimum();
    error OverDepositCap();
    error InsufficientPoolBalance();
    error UnknownRoot();
    error NullifierAlreadySpent();
    error DuplicateNullifier();
    error InputOutOfField();
    error InvalidProof();
    error BadEthValue();
    error BadTransferAmount();
    error BadExtData();
    error Sanctioned();
    error EthTransferFailed();
    error PauseWindowOver();
    error NoDirectEth();
    error FeeTooHigh();
    error NothingToCollect();

    constructor(
        address verifier_,
        address sanctionsList_,
        uint256 guardianExpiry_,
        address owner_,
        address feeRecipient_,
        uint16 protocolFeeBps_
    ) Ownable(owner_) {
        if (feeRecipient_ == address(0)) revert BadExtData();
        if (protocolFeeBps_ > MAX_PROTOCOL_FEE_BPS) revert FeeTooHigh();
        verifier = IGroth16Verifier(verifier_);
        sanctionsList = ISanctionsList(sanctionsList_);
        guardianExpiry = guardianExpiry_;
        feeRecipient = feeRecipient_;
        protocolFeeBps = protocolFeeBps_;
        emit ProtocolFeeSet(protocolFeeBps_);
    }

    /// Plain ETH sent to the pool would be credited to nobody.
    receive() external payable {
        revert NoDirectEth();
    }

    // ------------------------------------------------------------- shield

    /// @notice Creates a note worth `amount` of `token` for (publicKey,
    /// blinding). The depositor pays `amount` plus the protocol fee
    /// (`feeOn(amount)`). The deposit, its amount and these two values are
    /// public; spending the note later is not linked to it.
    function shield(
        address token,
        uint256 amount,
        uint256 publicKey,
        uint256 blinding,
        bytes calldata encryptedOutput
    ) external payable nonReentrant returns (uint256 index) {
        if (publicKey >= FIELD || blinding >= FIELD) revert InputOutOfField();
        Asset storage asset = _depositAsset(token);
        _screen(msg.sender);

        if (amount == 0 || amount >= MAX_AMOUNT) revert AmountOutOfRange();
        uint256 fee = feeOn(amount);
        // Tokens that take a fee on transfer are refused: the note must be
        // for exactly the amount the depositor's wallet encrypted.
        _pull(token, amount + fee, true);
        _credit(asset, amount);
        _chargeFee(0, token, fee);

        uint256 commitment = PoseidonT5.hash([amount, assetIdOf(token), publicKey, blinding]);
        index = _insertPair(commitment, ZERO_LEAF);
        emit NewCommitment(commitment, index, encryptedOutput);
        emit Shielded(index, token, amount, publicKey, blinding);
    }

    // ----------------------------------------------------------- transact

    function transact(Proof calldata proof, ExtData calldata ext) external payable nonReentrant {
        if (ext.extAmount <= -int256(MAX_AMOUNT) || ext.extAmount >= int256(MAX_AMOUNT)) revert AmountOutOfRange();
        if (ext.fee >= MAX_AMOUNT) revert AmountOutOfRange();
        if (!isKnownRoot(proof.root)) revert UnknownRoot();

        uint256 n0 = proof.inputNullifiers[0];
        uint256 n1 = proof.inputNullifiers[1];
        if (n0 >= FIELD || n1 >= FIELD) revert InputOutOfField();
        if (n0 == n1) revert DuplicateNullifier();
        if (nullifierSpent[n0] || nullifierSpent[n1]) revert NullifierAlreadySpent();

        (uint256 publicAmount, uint256 publicAssetId) = _publicValues(ext);

        uint256[8] memory pub = [
            proof.root,
            publicAmount,
            extDataHash(ext),
            publicAssetId,
            n0,
            n1,
            proof.outputCommitments[0],
            proof.outputCommitments[1]
        ];
        if (!verifier.verifyProof(proof.a, proof.b, proof.c, pub)) revert InvalidProof();

        // effects
        nullifierSpent[n0] = true;
        nullifierSpent[n1] = true;
        emit NewNullifier(n0);
        emit NewNullifier(n1);
        if (nextIndex + 2 > 2 ** LEVELS) {
            // A full tree must never block withdrawals. The outputs cannot be
            // stored, so they are dropped; wallets only unshield whole notes now.
            emit OutputsDiscarded(proof.outputCommitments[0], proof.outputCommitments[1]);
        } else {
            uint256 index = _insertPair(proof.outputCommitments[0], proof.outputCommitments[1]);
            emit NewCommitment(proof.outputCommitments[0], index, ext.encryptedOutput1);
            emit NewCommitment(proof.outputCommitments[1], index + 1, ext.encryptedOutput2);
        }

        // value in and out
        if (publicAssetId == 0) {
            if (msg.value != 0) revert BadEthValue();
            return;
        }
        Asset storage asset = assets[ext.token];
        if (ext.extAmount > 0) {
            if (!asset.depositsEnabled || depositsPaused) revert DepositsAreOff();
            _screen(msg.sender);
            uint256 amount = uint256(ext.extAmount);
            uint256 fee = feeOn(amount);
            _pull(ext.token, amount + fee, true);
            _credit(asset, amount);
            _chargeFee(2, ext.token, fee);
        } else if (msg.value != 0) {
            revert BadEthValue();
        }
        if (ext.extAmount < 0) {
            if (ext.recipient == address(0)) revert BadExtData();
            uint256 payout = uint256(-ext.extAmount);
            uint256 fee = feeOn(payout);
            // The fee comes out of the payout: the notes gave up `payout`,
            // the recipient receives `payout - fee`.
            if (payout > asset.balance) revert InsufficientPoolBalance();
            asset.balance -= uint128(fee);
            _chargeFee(1, ext.token, fee);
            _pay(asset, ext.token, ext.recipient, payout - fee);
        }
        if (ext.fee > 0) {
            if (ext.relayer == address(0)) revert BadExtData();
            _pay(asset, ext.token, ext.relayer, ext.fee);
        }
    }

    // ---------------------------------------------------------- protocol fee

    /// @notice Sends every accrued fee of `token` to the fee recipient.
    /// Anyone may call this.
    function collectFees(address token) external nonReentrant {
        uint256 amount = protocolFees[token];
        if (amount == 0) revert NothingToCollect();
        protocolFees[token] = 0;
        if (token == ETH) {
            (bool ok,) = feeRecipient.call{value: amount}("");
            if (!ok) revert EthTransferFailed();
        } else {
            IERC20(token).safeTransfer(feeRecipient, amount);
        }
        emit ProtocolFeesCollected(token, amount, feeRecipient);
    }

    /// @notice The protocol fee on `amount`, rounded up.
    function feeOn(uint256 amount) public view returns (uint256) {
        return (amount * protocolFeeBps + 9_999) / 10_000;
    }

    function setProtocolFee(uint16 bps) external onlyOwner {
        if (bps > MAX_PROTOCOL_FEE_BPS) revert FeeTooHigh();
        protocolFeeBps = bps;
        emit ProtocolFeeSet(bps);
    }

    // -------------------------------------------------------------- views

    /// Asset id inside notes: the token address as a number (ETH uses the
    /// stand-in address). Never 0, since 0 marks a pure private transfer.
    function assetIdOf(address token) public pure returns (uint256) {
        return uint256(uint160(token));
    }

    function extDataHash(ExtData calldata ext) public view returns (uint256) {
        return uint256(keccak256(abi.encode(ext, block.chainid, address(this)))) % FIELD;
    }

    // -------------------------------------------------------------- admin

    function listAsset(address token, uint128 minDeposit, uint128 maxDeposit, uint128 depositCap) external onlyOwner {
        if (token == address(0)) revert BadExtData();
        Asset storage asset = assets[token];
        if (asset.listed) revert BadExtData();
        asset.listed = true;
        asset.depositsEnabled = true;
        asset.minDeposit = minDeposit;
        asset.maxDeposit = maxDeposit;
        asset.depositCap = depositCap;
        emit AssetListed(token, minDeposit, maxDeposit, depositCap);
    }

    function updateAsset(
        address token,
        bool depositsEnabled,
        uint128 minDeposit,
        uint128 maxDeposit,
        uint128 depositCap
    ) external onlyOwner {
        Asset storage asset = assets[token];
        if (!asset.listed) revert AssetNotListed();
        asset.depositsEnabled = depositsEnabled;
        asset.minDeposit = minDeposit;
        asset.maxDeposit = maxDeposit;
        asset.depositCap = depositCap;
        emit AssetUpdated(token, depositsEnabled, minDeposit, maxDeposit, depositCap);
    }

    /// Pausing works only until guardianExpiry. Unpausing always works.
    /// Withdrawals can never be paused.
    function setDepositsPaused(bool paused) external onlyOwner {
        if (paused && block.timestamp >= guardianExpiry) revert PauseWindowOver();
        depositsPaused = paused;
        emit DepositsPaused(paused);
    }

    // ----------------------------------------------------------- internal

    function _publicValues(ExtData calldata ext) internal view returns (uint256 publicAmount, uint256 publicAssetId) {
        if (ext.extAmount == 0 && ext.fee == 0) {
            // Pure private transfer: no value crosses the pool boundary and
            // the asset stays hidden.
            if (ext.token != address(0)) revert BadExtData();
            return (0, 0);
        }
        if (!assets[ext.token].listed) revert AssetNotListed();
        int256 net = ext.extAmount - int256(ext.fee);
        // With net == 0 the circuit would not tie the notes to this token.
        if (net == 0) revert BadExtData();
        publicAmount = net >= 0 ? uint256(net) : FIELD - uint256(-net);
        publicAssetId = assetIdOf(ext.token);
    }

    function _depositAsset(address token) internal view returns (Asset storage asset) {
        asset = assets[token];
        if (!asset.listed) revert AssetNotListed();
        if (!asset.depositsEnabled || depositsPaused) revert DepositsAreOff();
    }

    function _credit(Asset storage asset, uint256 amount) internal {
        if (amount < asset.minDeposit) revert UnderDepositMinimum();
        if (amount > asset.maxDeposit) revert OverDepositLimit();
        uint256 next = uint256(asset.balance) + amount;
        if (next > asset.depositCap) revert OverDepositCap();
        asset.balance = uint128(next);
    }

    /// Takes `amount` from msg.sender. Returns what actually arrived.
    /// With `exact`, anything other than `amount` arriving reverts.
    function _pull(address token, uint256 amount, bool exact) internal returns (uint256 received) {
        if (token == ETH) {
            if (msg.value != amount) revert BadEthValue();
            return amount;
        }
        if (msg.value != 0) revert BadEthValue();
        uint256 before = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        received = IERC20(token).balanceOf(address(this)) - before;
        if (exact && received != amount) revert BadTransferAmount();
    }

    /// Pays from this asset's own balance. One asset can never pay out
    /// another asset's funds, even if a proof were somehow forged.
    function _pay(Asset storage asset, address token, address to, uint256 amount) internal {
        if (amount > asset.balance) revert InsufficientPoolBalance();
        asset.balance -= uint128(amount);
        if (token == ETH) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert EthTransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    function _chargeFee(uint8 kind, address token, uint256 fee) internal {
        if (fee == 0) return;
        protocolFees[token] += fee;
        emit ProtocolFeeCharged(kind, token, fee);
    }

    function _screen(address who) internal view {
        if (address(sanctionsList) != address(0) && sanctionsList.isSanctioned(who)) revert Sanctioned();
    }
}
