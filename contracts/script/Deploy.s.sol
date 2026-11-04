// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IPool} from "../src/interfaces/IAave.sol";
import {BucketFactory} from "../src/BucketFactory.sol";

/// Deploys the factory and allowlists the vaults in VAULTS (comma-separated).
/// Mainnet: run it yourself with your own burner account, e.g.
///   forge script script/Deploy.s.sol --rpc-url monad --account burner --broadcast
contract Deploy is Script {
    function run() external returns (BucketFactory factory) {
        IPool pool = IPool(vm.envAddress("AAVE_POOL"));
        address wmon = vm.envAddress("WMON");
        address usdc = vm.envAddress("USDC");
        address[] memory vaults = vm.envAddress("VAULTS", ",");

        vm.startBroadcast();
        factory = new BucketFactory(pool, wmon, usdc, msg.sender);
        for (uint256 i; i < vaults.length; i++) factory.setVaultAllowed(vaults[i], true);
        vm.stopBroadcast();

        console.log("BucketFactory", address(factory));
    }
}
