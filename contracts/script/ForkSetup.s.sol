// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPool, IPoolAddressesProvider, IAaveOracle, ReserveDataLegacy} from "../src/interfaces/IAave.sol";
import {Rules} from "../src/Bucket.sol";
import {BucketFactory} from "../src/BucketFactory.sol";

/// LOCAL ANVIL FORK OF MONAD MAINNET ONLY. Builds the crash demo against the REAL Aave V3 market:
/// one bucket and one identical plain Aave position, both at health ~1.50, then writes fork-demo.json.
/// Run script/fork-fund.sh first (gives the anvil accounts WETH), then:
///   forge script script/ForkSetup.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --slow
/// Uses anvil's public dev accounts #1 (bucket owner) and #2 (plain position). Never use them on a real chain.
contract ForkSetup is Script {
    IPool constant POOL = IPool(0x69a5F9AD4f96ebf0a0C792dD42a01cC5C0102fef);
    address constant WETH = 0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242;
    address constant USDC = 0x754704Bc059F8C67012fEd69BC8A327a5aafb603;
    address constant WMON = 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A;
    address constant VAULT = 0xf57E9898575fab80b0f2aCDe5443276BeC8C542D; // SharpByte USDC (Morpho V2)
    // anvil's public test mnemonic: accounts #1 and #2 hold no real funds anywhere.
    string constant ANVIL_MNEMONIC = "test test test test test test test test test test test junk";

    function run() external {
        require(block.chainid == 143, "expects a fork of Monad mainnet");
        uint256 BUCKET_OWNER_PK = vm.deriveKey(ANVIL_MNEMONIC, 1);
        uint256 PLAIN_PK = vm.deriveKey(ANVIL_MNEMONIC, 2);
        uint256 coll = vm.envOr("DEMO_WETH", uint256(2 ether));
        uint256 borrowAmt = _borrowForHealth(coll, 1.5e18);
        uint256 buffer = borrowAmt / 100;
        address owner = vm.addr(BUCKET_OWNER_PK);
        address plain = vm.addr(PLAIN_PK);

        vm.startBroadcast(BUCKET_OWNER_PK);
        BucketFactory factory = new BucketFactory(POOL, WMON, USDC, owner);
        factory.setVaultAllowed(VAULT, true);
        IERC20(WETH).approve(address(factory), coll);
        address bucket = factory.createAndOpen(
            WETH, VAULT, coll, borrowAmt, buffer, Rules({deadline: 0, minHealth: 1.15e18, tipBps: 10})
        );
        vm.stopBroadcast();

        // The same position without a bucket: supply WETH, borrow the same USDC, hold it.
        vm.startBroadcast(PLAIN_PK);
        IERC20(WETH).approve(address(POOL), coll);
        POOL.supply(WETH, coll, plain, 0);
        POOL.borrow(USDC, borrowAmt, 2, 0, plain);
        vm.stopBroadcast();

        string memory o = "demo";
        vm.serializeAddress(o, "factory", address(factory));
        vm.serializeAddress(o, "bucket", bucket);
        vm.serializeAddress(o, "bucketOwner", owner);
        vm.serializeAddress(o, "plainPosition", plain);
        vm.serializeAddress(o, "collateral", WETH);
        vm.serializeAddress(o, "vault", VAULT);
        vm.serializeAddress(o, "pool", address(POOL));
        vm.serializeUint(o, "collateralAmount", coll);
        string memory json = vm.serializeUint(o, "borrowed", borrowAmt);
        vm.writeJson(json, "./fork-demo.json");

        console.log("factory", address(factory));
        console.log("bucket", bucket);
        console.log("plainPosition", plain);
        console.log("borrowed USDC (6dp)", borrowAmt);
    }

    /// USDC that puts `coll` WETH at the target health factor, from Aave's live threshold and prices.
    function _borrowForHealth(uint256 coll, uint256 targetHf) internal view returns (uint256) {
        IAaveOracle oracle = IAaveOracle(IPoolAddressesProvider(POOL.ADDRESSES_PROVIDER()).getPriceOracle());
        ReserveDataLegacy memory r = POOL.getReserveData(WETH);
        uint256 lt = (r.configuration >> 16) & 0xFFFF;
        uint256 ltv = r.configuration & 0xFFFF;
        uint256 collUsd8 = (coll * oracle.getAssetPrice(WETH)) / 1e18;
        uint256 debtUsd8 = (collUsd8 * lt * 1e18) / 10_000 / targetHf;
        require(debtUsd8 * 10_000 <= collUsd8 * ltv, "target health below the LTV limit");
        return (debtUsd8 * 1e6) / oracle.getAssetPrice(USDC);
    }
}
