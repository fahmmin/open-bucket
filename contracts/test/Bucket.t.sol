// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {IPool, IPoolAddressesProvider, IAaveOracle} from "../src/interfaces/IAave.sol";
import {Bucket, Rules} from "../src/Bucket.sol";
import {BucketFactory} from "../src/BucketFactory.sol";

/// Runs on a fork of Monad mainnet against the REAL Aave V3 market and a real Morpho USDC vault.
/// Addresses are verified in docs/onchain-facts.md. Run: forge test --match-contract BucketForkTest --fork-url https://rpc.monad.xyz
/// (Foundry picks Monad's EVM from --fork-url; without it these tests skip.)
contract BucketForkTest is Test {
    IPool constant POOL = IPool(0x69a5F9AD4f96ebf0a0C792dD42a01cC5C0102fef);
    IERC20 constant WETH = IERC20(0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242);
    IERC20 constant USDC = IERC20(0x754704Bc059F8C67012fEd69BC8A327a5aafb603);
    address constant A_WETH = 0x4377b53aAA8b8e3fF7AA2843832CAF004f5Cb8b6; // holds Aave's WETH liquidity
    IERC4626 constant VAULT = IERC4626(0xf57E9898575fab80b0f2aCDe5443276BeC8C542D); // SharpByte USDC (Morpho V2)
    address constant WMON = 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A;

    IAaveOracle oracle;
    BucketFactory factory;
    address owner = makeAddr("owner");
    address keeper = makeAddr("keeper");
    uint256 constant COLL = 2 ether; // 2 WETH

    function setUp() public {
        if (block.chainid != 143 || address(POOL).code.length == 0) vm.skip(true);
        oracle = IAaveOracle(IPoolAddressesProvider(POOL.ADDRESSES_PROVIDER()).getPriceOracle());
        factory = new BucketFactory(POOL, WMON, address(USDC), address(this));
        factory.setVaultAllowed(address(VAULT), true);
        vm.prank(A_WETH); // fund the owner from Aave's own WETH balance (fork only)
        WETH.transfer(owner, 10 ether);
    }

    /// USDC that puts COLL at the target health factor, using Aave's live threshold and prices.
    function _borrowForHealth(uint256 targetHf) internal view returns (uint256) {
        uint256 lt = (POOL.getReserveData(address(WETH)).configuration >> 16) & 0xFFFF;
        uint256 collUsd8 = (COLL * oracle.getAssetPrice(address(WETH))) / 1e18;
        uint256 debtUsd8 = (collUsd8 * lt * 1e18) / 10_000 / targetHf;
        return (debtUsd8 * 1e6) / oracle.getAssetPrice(address(USDC));
    }

    function _open(Rules memory r, uint256 borrowAmt) internal returns (Bucket b) {
        vm.startPrank(owner);
        WETH.approve(address(factory), COLL);
        b = Bucket(factory.createAndOpen(address(WETH), address(VAULT), COLL, borrowAmt, borrowAmt / 100, r));
        vm.stopPrank();
    }

    function _rules(uint64 deadline, uint64 minHealth) internal pure returns (Rules memory) {
        return Rules({deadline: deadline, minHealth: minHealth, tipBps: 10});
    }

    /// Mocks the WETH price at `pctOfStart`% of the real price at the fork block (never compounds).
    function _dropPriceTo(uint256 pctOfStart) internal {
        vm.clearMockedCalls();
        uint256 price = oracle.getAssetPrice(address(WETH));
        vm.mockCall(
            address(oracle),
            abi.encodeWithSelector(IAaveOracle.getAssetPrice.selector, address(WETH)),
            abi.encode((price * pctOfStart) / 100)
        );
    }

    function test_Fork_OpenOnRealAave() public {
        uint256 borrowAmt = _borrowForHealth(1.5e18);
        Bucket b = _open(_rules(0, 1.15e18), borrowAmt);
        (uint256 coll, uint256 shares, uint256 assets, uint256 idle, uint256 debt, uint256 hf) = b.position();
        assertApproxEqAbs(coll, COLL, 2, "WETH supplied on Aave");
        assertGt(shares, 0, "Morpho vault shares");
        assertApproxEqRel(assets, borrowAmt - borrowAmt / 100, 0.001e18, "vault holds the borrowed USDC");
        assertEq(idle, borrowAmt / 100, "buffer");
        assertApproxEqAbs(debt, borrowAmt, 2, "USDC debt on Aave");
        assertApproxEqRel(hf, 1.5e18, 0.002e18, "health ~1.50");
    }

    function test_Fork_OwnerExitClosesEverything() public {
        Bucket b = _open(_rules(0, 0), _borrowForHealth(1.5e18));
        vm.warp(block.timestamp + 1 hours);
        vm.roll(block.number + 12_000);
        vm.prank(owner);
        b.exit();
        (uint256 coll,,,, uint256 debt,) = b.position();
        assertEq(debt, 0, "Aave debt repaid");
        assertEq(coll, 0, "collateral withdrawn");
        assertGe(WETH.balanceOf(owner), 10 ether - 1, "owner has all WETH back");
    }

    function test_Fork_HealthExitBeforeLiquidation() public {
        Bucket b = _open(_rules(0, 1.15e18), _borrowForHealth(1.5e18));
        _dropPriceTo(80); // health 1.50 -> 1.20: no rule yet
        (bool ok,) = b.canExit();
        assertFalse(ok);
        vm.prank(keeper);
        vm.expectRevert(Bucket.NoRuleTriggered.selector);
        b.exit();

        _dropPriceTo(75); // health ~1.125: below the 1.15 floor, above liquidation
        (,,,,, uint256 hf) = b.position();
        assertLt(hf, 1.15e18);
        assertGt(hf, 1e18);
        (bool ok2, uint8 reason) = b.canExit();
        assertTrue(ok2);
        assertEq(reason, 2);

        uint256 ownerBefore = WETH.balanceOf(owner);
        vm.prank(keeper);
        b.exit();
        uint256 tip = WETH.balanceOf(keeper);
        uint256 toOwner = WETH.balanceOf(owner) - ownerBefore;
        assertEq(tip, ((tip + toOwner) * 10) / 10_000, "keeper got exactly the 0.1% tip");
        assertEq(USDC.balanceOf(keeper), 0);
        // Exiting in the same block as opening hits the Morpho vault's rounding: a few wei of debt may stay
        // on Aave, backed by a dust sliver of collateral. Everything else reached the owner.
        (uint256 leftColl,,,, uint256 debt,) = b.position();
        assertLe(debt, b.MAX_DUST(), "at most rounding dust left");
        assertLt(leftColl, 1e12, "collateral left is dust");
        assertApproxEqAbs(tip + toOwner + leftColl, COLL, 2, "all collateral accounted for");
    }

    function test_Fork_DeadlineExit() public {
        Bucket b = _open(_rules(uint64(block.timestamp + 120), 0), _borrowForHealth(2e18));
        vm.prank(keeper);
        vm.expectRevert(Bucket.NoRuleTriggered.selector);
        b.exit();
        vm.warp(block.timestamp + 120);
        vm.roll(block.number + 400);
        vm.prank(keeper);
        b.exit();
        assertTrue(b.closed());
        assertGt(WETH.balanceOf(owner), WETH.balanceOf(keeper));
    }
}
