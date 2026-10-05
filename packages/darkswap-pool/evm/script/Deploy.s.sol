// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {DarkPool} from "../src/DarkPool.sol";
import {Groth16Verifier} from "../src/Groth16Verifier.sol";

/// A token for local and test networks only.
contract TestToken is ERC20 {
    constructor(address to) ERC20("DarkSwap Test USD", "tUSD") {
        _mint(to, 1_000_000_000e6);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

/// Deploys the verifier and the pool, lists ETH (and a test token when
/// TEST_TOKEN=true), and writes deployments/<chainid>.json.
///
/// Env:
///   OWNER            pool owner (use a multisig on mainnet). Default: the deployer.
///   SANCTIONS_LIST   Chainalysis oracle address, or 0 for none. Default: 0.
///   GUARDIAN_DAYS    days during which deposits can be paused. Default: 30.
///   ETH_MIN_DEPOSIT  smallest deposit in wei. Default: 0.001 ether.
///   ETH_MAX_DEPOSIT  wei per deposit. Default: 1 ether.
///   ETH_CAP          wei the pool may hold. Default: 10 ether.
///   TEST_TOKEN       deploy and list a test token. Default: false.
///   FEE_RECIPIENT    where swept protocol fees go (fixed forever). Default: the owner.
///   PROTOCOL_FEE_BPS protocol fee on shields and unshields, max 100. Default: 50.
contract Deploy is Script {
    function run() external {
        address deployer = msg.sender;
        address owner = vm.envOr("OWNER", deployer);
        address sanctions = vm.envOr("SANCTIONS_LIST", address(0));
        uint256 guardianDays = vm.envOr("GUARDIAN_DAYS", uint256(30));
        uint128 ethMin = uint128(vm.envOr("ETH_MIN_DEPOSIT", uint256(0.001 ether)));
        uint128 ethMax = uint128(vm.envOr("ETH_MAX_DEPOSIT", uint256(1 ether)));
        uint128 ethCap = uint128(vm.envOr("ETH_CAP", uint256(10 ether)));
        bool testToken = vm.envOr("TEST_TOKEN", false);
        address feeRecipient = vm.envOr("FEE_RECIPIENT", owner);
        uint16 feeBps = uint16(vm.envOr("PROTOCOL_FEE_BPS", uint256(50)));

        vm.startBroadcast();
        Groth16Verifier verifier = new Groth16Verifier();
        // The deployer owns the pool long enough to list assets, then hands over.
        DarkPool pool = new DarkPool(
            address(verifier), sanctions, block.timestamp + guardianDays * 1 days, deployer, feeRecipient, feeBps
        );
        pool.listAsset(pool.ETH(), ethMin, ethMax, ethCap);
        address token = address(0);
        if (testToken) {
            token = address(new TestToken(deployer));
            pool.listAsset(token, 1e6, 100_000e6, 1_000_000e6);
        }
        if (owner != deployer) pool.transferOwnership(owner); // owner must call acceptOwnership
        vm.stopBroadcast();

        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeUint(key, "deployBlock", block.number);
        vm.serializeAddress(key, "verifier", address(verifier));
        vm.serializeAddress(key, "token", token);
        vm.serializeAddress(key, "owner", owner);
        vm.serializeAddress(key, "feeRecipient", feeRecipient);
        vm.serializeUint(key, "protocolFeeBps", feeBps);
        string memory json = vm.serializeAddress(key, "pool", address(pool));
        string memory path = string.concat("../deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
        console.log("pool", address(pool));
        console.log("verifier", address(verifier));
        console.log("written", path);
    }
}
