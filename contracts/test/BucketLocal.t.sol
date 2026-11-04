// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {IPool} from "../src/interfaces/IAave.sol";
import {Bucket, Rules} from "../src/Bucket.sol";
import {BucketFactory} from "../src/BucketFactory.sol";
import {TestPool} from "../src/testnet/TestPool.sol";
import {TestOracle} from "../src/testnet/TestOracle.sol";
import {TestUSDC, TestWETH, TestWMON} from "../src/testnet/TestTokens.sol";
import {TestVault} from "../src/testnet/TestVault.sol";

/// Fast, RPC-free tests against the testnet stack (the same contracts we deploy on Monad testnet).
/// Reserve parameters mirror Aave V3 Monad's WETH (LTV 80.5%, threshold 84%, bonus 5.5%).
/// The fork suite (Bucket.t.sol) runs the same ideas against the real Aave V3 market.
contract BucketLocalTest is Test {
    TestOracle oracle;
    TestPool pool;
    TestUSDC usdc;
    TestWETH weth;
    TestWMON wmon;
    TestVault vault;
    BucketFactory factory;

    address owner = makeAddr("owner");
    address keeper = makeAddr("keeper");
    address plain = makeAddr("plain");
    address liquidator = makeAddr("liquidator");

    uint256 constant COLL = 1 ether; // 1 WETH
    uint256 constant WETH_PRICE = 2_000e8; // $2,000, test price
    uint256 constant BORROW = 1_120e6; // health = 2000 * 0.84 / 1120 = 1.50
    uint256 constant BUFFER = BORROW / 100;

    function setUp() public {
        oracle = new TestOracle(address(this));
        pool = new TestPool(oracle, address(this));
        usdc = new TestUSDC(address(this));
        weth = new TestWETH();
        wmon = new TestWMON();
        pool.listReserve(address(weth), 8050, 8400, 550, 0);
        pool.listReserve(address(usdc), 7500, 7800, 750, 0);
        pool.listReserve(address(wmon), 6000, 7000, 750, 0);
        oracle.setAssetPrice(address(weth), WETH_PRICE);
        oracle.setAssetPrice(address(usdc), 1e8);
        oracle.setAssetPrice(address(wmon), 0.03e8);
        usdc.mint(address(pool), 10_000_000e6); // lending liquidity

        vault = new TestVault(IERC20(address(usdc)));
        factory = new BucketFactory(IPool(address(pool)), address(wmon), address(usdc), address(this));
        factory.setVaultAllowed(address(vault), true);

        vm.prank(owner);
        weth.faucet();
        vm.prank(plain);
        weth.faucet();
    }

    function _open(Rules memory r) internal returns (Bucket b) {
        vm.startPrank(owner);
        weth.approve(address(factory), COLL);
        b = Bucket(factory.createAndOpen(address(weth), address(vault), COLL, BORROW, BUFFER, r));
        vm.stopPrank();
    }

    function _rules(uint64 deadline, uint64 minHealth) internal pure returns (Rules memory) {
        return Rules({deadline: deadline, minHealth: minHealth, tipBps: 10}); // 0.1% tip
    }

    function _setPricePct(uint256 pctOfStart) internal {
        oracle.setAssetPrice(address(weth), (WETH_PRICE * pctOfStart) / 100);
    }

    function test_OpenRecordsWholePosition() public {
        Bucket b = _open(_rules(0, 1.15e18));
        (uint256 coll, uint256 shares, uint256 assets, uint256 idle, uint256 debt, uint256 hf) = b.position();
        assertEq(coll, COLL);
        assertGt(shares, 0);
        assertEq(assets, BORROW - BUFFER);
        assertEq(idle, BUFFER);
        assertEq(debt, BORROW);
        assertEq(hf, 1.5e18);
        assertTrue(b.opened());
        assertFalse(b.closed());
        assertEq(weth.balanceOf(address(factory)), 0, "nothing left in the factory");
        assertEq(usdc.balanceOf(address(factory)), 0);
    }

    function test_NativeMonPathWraps() public {
        vm.deal(owner, 100_000 ether);
        vm.prank(owner);
        Bucket b = Bucket(
            factory.createAndOpen{value: 100_000 ether}(address(wmon), address(vault), 100_000 ether, 1_000e6, 10e6, _rules(0, 0))
        );
        (uint256 coll,,,, uint256 debt,) = b.position();
        assertEq(coll, 100_000 ether);
        assertEq(debt, 1_000e6);
    }

    function test_OwnerExitReturnsEverything() public {
        Bucket b = _open(_rules(0, 0));
        vm.prank(owner);
        b.exit();
        assertEq(weth.balanceOf(owner), COLL, "all collateral back, no tip");
        assertEq(usdc.balanceOf(owner), 0, "no interest in test pool: vault + buffer exactly repay");
        (uint256 coll,,,, uint256 debt,) = b.position();
        assertEq(coll, 0);
        assertEq(debt, 0);
        assertTrue(b.closed());
    }

    function test_StrangerBlockedWhileNoRuleTrue() public {
        Bucket b = _open(_rules(uint64(block.timestamp + 1 days), 1.15e18));
        vm.prank(keeper);
        vm.expectRevert(Bucket.NoRuleTriggered.selector);
        b.exit();
    }

    function test_DeadlineExitPaysOwnerAndCappedTip() public {
        Bucket b = _open(_rules(uint64(block.timestamp + 60), 0));
        vm.warp(block.timestamp + 60);
        (bool ok, uint8 reason) = b.canExit();
        assertTrue(ok);
        assertEq(reason, 1);
        vm.prank(keeper);
        b.exit();
        assertEq(weth.balanceOf(keeper), 0.001 ether, "0.1% of 1 WETH");
        assertEq(weth.balanceOf(owner), 0.999 ether);
        assertEq(usdc.balanceOf(keeper), 0);
    }

    /// The demo: the same position with and without a bucket while the price falls 4% per step.
    function test_CrashSideBySide() public {
        Bucket b = _open(_rules(0, 1.15e18));
        vm.startPrank(plain);
        weth.approve(address(pool), COLL);
        pool.supply(address(weth), COLL, plain, 0);
        pool.borrow(address(usdc), BORROW, 2, 0, plain);
        vm.stopPrank();

        bool bucketExited;
        for (uint256 pct = 100; pct >= 64; pct -= 4) {
            _setPricePct(pct);
            (bool ok,) = b.canExit();
            if (ok && !bucketExited) {
                (,,,,, uint256 hfAtExit) = b.position();
                assertLt(hfAtExit, 1.15e18);
                assertGt(hfAtExit, 1e18, "agent exits before liquidation is possible");
                vm.prank(keeper);
                b.exit();
                bucketExited = true;
            }
        }
        assertTrue(bucketExited);
        assertEq(weth.balanceOf(owner), 0.999 ether, "bucket owner keeps all WETH minus the tip");

        // The plain position is now below health 1: a liquidator takes the bonus.
        (,,,,, uint256 hfPlain) = pool.getUserAccountData(plain);
        assertLt(hfPlain, 1e18);
        usdc.mint(liquidator, 1_000e6);
        vm.startPrank(liquidator);
        usdc.approve(address(pool), type(uint256).max);
        pool.liquidationCall(address(weth), address(usdc), plain, type(uint256).max, false);
        vm.stopPrank();
        // 560 USDC covered at $1,280/WETH = 0.4375 WETH, plus 5.5% bonus = 0.4615625 WETH seized.
        assertEq(weth.balanceOf(liquidator), 0.4615625 ether);
        // The bonus alone (0.0240625 WETH) is 24x the bucket's 0.001 WETH tip.
        assertEq(weth.balanceOf(liquidator) - 0.4375 ether, 0.0240625 ether);
    }

    function test_HealthRuleFiresOnlyBelowFloor() public {
        Bucket b = _open(_rules(0, 1.15e18));
        _setPricePct(80); // health 1.20
        (bool ok,) = b.canExit();
        assertFalse(ok);
        _setPricePct(76); // health 1.14
        (bool ok2, uint8 reason) = b.canExit();
        assertTrue(ok2);
        assertEq(reason, 2);
    }

    function test_ExitTwiceAndLateRulesRevert() public {
        Bucket b = _open(_rules(0, 0));
        vm.startPrank(owner);
        b.exit();
        vm.expectRevert(Bucket.Closed.selector);
        b.exit();
        vm.expectRevert(Bucket.Closed.selector);
        b.setRules(_rules(0, 0));
        vm.stopPrank();
    }

    function test_ShortfallRevertsAndRollsBack() public {
        Bucket b = _open(_rules(0, 0));
        vm.mockCall(address(vault), abi.encodeWithSelector(IERC4626.redeem.selector), abi.encode(uint256(0)));
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Bucket.Shortfall.selector, BORROW - BUFFER));
        b.exit();
        vm.clearMockedCalls();
        assertFalse(b.closed());
        vm.prank(owner);
        b.exit(); // works once the vault pays out
        assertTrue(b.closed());
    }

    function test_AccessControl() public {
        Bucket b = _open(_rules(0, 0));
        vm.startPrank(keeper);
        vm.expectRevert(Bucket.NotOwner.selector);
        b.setRules(_rules(0, 0));
        vm.expectRevert(Bucket.NotOwner.selector);
        b.rescue(address(usdc));
        vm.expectRevert(Bucket.NotFactory.selector);
        b.open(1, 1, 0);
        vm.expectRevert(BucketFactory.NotAdmin.selector);
        factory.setVaultAllowed(address(vault), false);
        vm.stopPrank();
        vm.prank(owner);
        vm.expectRevert(Bucket.TipTooHigh.selector);
        b.setRules(Rules({deadline: 0, minHealth: 0, tipBps: 51}));
    }

    function test_FactoryRejectsBadInputs() public {
        vm.deal(owner, 1 ether);
        vm.startPrank(owner);
        weth.approve(address(factory), type(uint256).max);
        vm.expectRevert(BucketFactory.VaultNotAllowed.selector);
        factory.createAndOpen(address(weth), address(0xBEEF), COLL, BORROW, 0, _rules(0, 0));
        vm.expectRevert(BucketFactory.BadValue.selector);
        factory.createAndOpen{value: 1}(address(weth), address(vault), COLL, BORROW, 0, _rules(0, 0));
        vm.expectRevert(Bucket.BufferTooLarge.selector);
        factory.createAndOpen(address(weth), address(vault), COLL, BORROW, BORROW + 1, _rules(0, 0));
        vm.expectRevert(bytes("borrow exceeds LTV"));
        factory.createAndOpen(address(weth), address(vault), COLL, 1_700e6, 0, _rules(0, 0));
        vm.expectRevert(BucketFactory.UnsupportedCollateral.selector);
        factory.createAndOpen(address(0xCAFE), address(vault), COLL, BORROW, 0, _rules(0, 0));
        vm.stopPrank();
    }

    function test_RescueSendsStrayTokensToOwner() public {
        Bucket b = _open(_rules(0, 0));
        usdc.mint(address(b), 5e6);
        vm.prank(owner);
        b.rescue(address(usdc));
        assertEq(usdc.balanceOf(owner), 5e6 + BUFFER, "stray tokens plus the idle buffer");
    }

    /// Found on the mainnet fork: the Morpho vault rounds down by a few wei, so an exit right after opening
    /// was 2 micro-USDC short. Dust up to MAX_DUST stays on the pool with a sliver of collateral.
    function test_RoundingDustDoesNotBlockExit() public {
        Bucket b = _open(_rules(0, 0));
        vm.prank(address(vault)); // the vault loses 2 wei, like a rounding-down redeem
        usdc.transfer(address(0xdead), 2);
        vm.prank(owner);
        b.exit();
        (uint256 coll,,,, uint256 debt,) = b.position();
        assertEq(debt, 2, "2 wei of debt left on the pool");
        assertGt(coll, 0, "a sliver of collateral backs it");
        assertLt(coll, 1e12, "the sliver is dust (< 0.000001 WETH)");
        assertEq(weth.balanceOf(owner) + coll, COLL, "everything else went to the owner");
        (,,,,, uint256 hf) = pool.getUserAccountData(address(b));
        assertGt(hf, 3e18, "left-over dust stays very healthy");
    }

    function test_RealShortfallStillReverts() public {
        Bucket b = _open(_rules(0, 0));
        vm.prank(address(vault)); // the vault loses 1 USDC: far more than dust
        usdc.transfer(address(0xdead), 1e6);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Bucket.Shortfall.selector, 1e6));
        b.exit();
    }

    /// Whatever the price path, timing and tip, a non-owner exit pays the caller exactly the tip and the owner the rest.
    function testFuzz_PermittedExitNeverOverpaysCaller(uint8 pctRaw, uint32 waitRaw, uint16 tipRaw) public {
        uint16 tip = uint16(bound(tipRaw, 0, 50));
        vm.startPrank(owner);
        weth.approve(address(factory), COLL);
        Bucket b = Bucket(
            factory.createAndOpen(
                address(weth), address(vault), COLL, BORROW, BUFFER,
                Rules({deadline: uint64(block.timestamp + 1 days), minHealth: 1.15e18, tipBps: tip})
            )
        );
        vm.stopPrank();
        _setPricePct(bound(pctRaw, 68, 100)); // stays above liquidation (health >= 1.02)
        vm.warp(block.timestamp + bound(waitRaw, 0, 2 days));
        (bool ok,) = b.canExit();
        vm.prank(keeper);
        if (!ok) {
            vm.expectRevert(Bucket.NoRuleTriggered.selector);
            b.exit();
            return;
        }
        b.exit();
        uint256 paid = weth.balanceOf(keeper);
        assertEq(paid, (COLL * tip) / 10_000);
        assertEq(weth.balanceOf(owner) + paid, COLL);
        assertEq(usdc.balanceOf(keeper), 0);
    }
}
