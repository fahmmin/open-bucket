// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPool} from "../src/interfaces/IAave.sol";
import {BucketFactory} from "../src/BucketFactory.sol";
import {TestPool} from "../src/testnet/TestPool.sol";
import {TestOracle} from "../src/testnet/TestOracle.sol";
import {TestUSDC, TestWETH} from "../src/testnet/TestTokens.sol";
import {TestVault} from "../src/testnet/TestVault.sol";

/// MONAD TESTNET ONLY. Aave is not deployed on Monad testnet, so this deploys the Aave-compatible test pool,
/// test tokens, a plain ERC-4626 test vault and the real BucketFactory, then writes deployments/testnet.json.
/// Reserve parameters mirror Aave V3 Monad's WETH (LTV 80.5%, threshold 84%, bonus 5.5%, verified 4 Nov 2026).
///   PRICE_WETH=<8-dec USD from Aave's mainnet oracle> forge script script/DeployTestnet.s.sol \
///     --rpc-url https://testnet-rpc.monad.xyz --broadcast
contract DeployTestnet is Script {
    function run() external {
        require(block.chainid == 10143, "Monad testnet only");
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        uint256 wethPrice = vm.envUint("PRICE_WETH");

        vm.startBroadcast(pk);
        TestOracle oracle = new TestOracle(deployer);
        TestPool pool = new TestPool(oracle, deployer);
        TestUSDC usdc = new TestUSDC(deployer);
        TestWETH weth = new TestWETH();
        pool.listReserve(address(weth), 8050, 8400, 550, 0);
        pool.listReserve(address(usdc), 7500, 7800, 750, 0);
        oracle.setAssetPrice(address(weth), wethPrice);
        oracle.setAssetPrice(address(usdc), 1e8);
        usdc.mint(address(pool), 50_000_000e6); // lending liquidity
        usdc.mint(deployer, 100_000e6); // for the demo liquidator
        TestVault vault = new TestVault(IERC20(address(usdc)));
        // wmon = 0: the native-MON path is off on testnet; collateral is test WETH.
        BucketFactory factory = new BucketFactory(IPool(address(pool)), address(0), address(usdc), deployer);
        factory.setVaultAllowed(address(vault), true);
        vm.stopBroadcast();

        string memory o = "testnet";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeUint(o, "deployBlock", block.number);
        vm.serializeAddress(o, "deployer", deployer);
        vm.serializeAddress(o, "oracle", address(oracle));
        vm.serializeAddress(o, "pool", address(pool));
        vm.serializeAddress(o, "usdc", address(usdc));
        vm.serializeAddress(o, "weth", address(weth));
        vm.serializeAddress(o, "vault", address(vault));
        string memory json = vm.serializeAddress(o, "factory", address(factory));
        vm.writeJson(json, "./deployments/testnet.json");

        console.log("TestOracle   ", address(oracle));
        console.log("TestPool     ", address(pool));
        console.log("TestUSDC     ", address(usdc));
        console.log("TestWETH     ", address(weth));
        console.log("TestVault    ", address(vault));
        console.log("BucketFactory", address(factory));
    }
}
