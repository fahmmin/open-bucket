// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPool, IPoolAddressesProvider, IAaveOracle} from "./interfaces/IAave.sol";

struct Rules {
    uint64 deadline; // unix seconds; 0 = no deadline rule
    uint64 minHealth; // Aave health factor, 1e18 = 1.00; 0 = no health rule
    uint16 tipBps; // tip to a non-owner caller, bps of withdrawn collateral
}

/// One user's position: collateral and debt on Aave, the borrowed asset in an ERC-4626 vault,
/// plus exit rules. Exit is open to anyone while a rule is true, and always pays the owner.
contract Bucket is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant MAX_TIP_BPS = 50; // 0.5%
    /// Vault rounding can leave a few wei of debt right after opening; up to this much (debt-asset units,
    /// 0.01 USDC) stays on Aave with a sliver of collateral. Anything larger reverts with Shortfall.
    uint256 public constant MAX_DUST = 1e4;
    uint256 private constant VARIABLE_RATE = 2;

    address public immutable owner;
    address public immutable factory;
    IPool public immutable pool;
    IERC20 public immutable collateral;
    IERC20 public immutable aToken;
    IERC20 public immutable debtAsset;
    IERC20 public immutable debtToken;
    IERC4626 public immutable vault;

    Rules public rules;
    bool public opened;
    bool public closed;

    event Opened(uint256 collateralAmount, uint256 borrowed, uint256 deposited, uint256 shares);
    event RulesSet(uint64 deadline, uint64 minHealth, uint16 tipBps);
    event Exited(
        address indexed caller,
        uint8 reason,
        uint256 debtRepaid,
        uint256 collateralToOwner,
        uint256 debtAssetToOwner,
        uint256 tip
    );

    error NotOwner();
    error NotFactory();
    error AlreadyOpen();
    error Closed();
    error NoRuleTriggered();
    error TipTooHigh();
    error BufferTooLarge();
    error Shortfall(uint256 missing);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(
        address owner_,
        IPool pool_,
        IERC20 collateral_,
        IERC20 aToken_,
        IERC20 debtAsset_,
        IERC20 debtToken_,
        IERC4626 vault_,
        Rules memory rules_
    ) {
        if (rules_.tipBps > MAX_TIP_BPS) revert TipTooHigh();
        owner = owner_;
        factory = msg.sender;
        pool = pool_;
        collateral = collateral_;
        aToken = aToken_;
        debtAsset = debtAsset_;
        debtToken = debtToken_;
        vault = vault_;
        rules = rules_;
        emit RulesSet(rules_.deadline, rules_.minHealth, rules_.tipBps);
    }

    /// Called once by the factory after it has sent `collateralAmount` of collateral here.
    function open(uint256 collateralAmount, uint256 borrowAmount, uint256 bufferAmount) external nonReentrant {
        if (msg.sender != factory) revert NotFactory();
        if (opened) revert AlreadyOpen();
        if (bufferAmount > borrowAmount) revert BufferTooLarge();
        opened = true;

        collateral.forceApprove(address(pool), collateralAmount);
        pool.supply(address(collateral), collateralAmount, address(this), 0);
        pool.setUserUseReserveAsCollateral(address(collateral), true); // no-op if already enabled

        pool.borrow(address(debtAsset), borrowAmount, VARIABLE_RATE, 0, address(this));

        uint256 deposit = borrowAmount - bufferAmount;
        uint256 shares;
        if (deposit > 0) {
            debtAsset.forceApprove(address(vault), deposit);
            shares = vault.deposit(deposit, address(this));
        }
        emit Opened(collateralAmount, borrowAmount, deposit, shares);
    }

    function setRules(Rules calldata r) external onlyOwner {
        if (closed) revert Closed();
        if (r.tipBps > MAX_TIP_BPS) revert TipTooHigh();
        rules = r;
        emit RulesSet(r.deadline, r.minHealth, r.tipBps);
    }

    /// reason: 0 none, 1 deadline passed, 2 health below the owner's floor.
    function canExit() public view returns (bool ok, uint8 reason) {
        if (!opened || closed) return (false, 0);
        Rules memory r = rules;
        if (r.deadline != 0 && block.timestamp >= r.deadline) return (true, 1);
        if (r.minHealth != 0) {
            (,,,,, uint256 hf) = pool.getUserAccountData(address(this));
            if (hf < r.minHealth) return (true, 2);
        }
        return (false, 0);
    }

    /// Owner: any time. Anyone else: only while a rule is true. Proceeds always go to the owner.
    function exit() external nonReentrant {
        if (closed || !opened) revert Closed();
        uint8 reason;
        if (msg.sender != owner) {
            bool ok;
            (ok, reason) = canExit();
            if (!ok) revert NoRuleTriggered();
        }
        closed = true;

        uint256 shares = vault.balanceOf(address(this));
        if (shares > 0) vault.redeem(shares, address(this), address(this));

        uint256 debt = debtToken.balanceOf(address(this));
        uint256 balance = debtAsset.balanceOf(address(this));
        if (balance + MAX_DUST < debt) revert Shortfall(debt - balance);
        uint256 repaid;
        if (debt > 0) {
            debtAsset.forceApprove(address(pool), debt);
            repaid = pool.repay(
                address(debtAsset), balance >= debt ? type(uint256).max : balance, VARIABLE_RATE, address(this)
            );
        }

        uint256 withdrawn;
        uint256 supplied = aToken.balanceOf(address(this));
        if (supplied > 0) {
            uint256 dust = debtToken.balanceOf(address(this));
            uint256 keep = dust == 0 ? 0 : _collateralFor(dust);
            withdrawn = pool.withdraw(address(collateral), dust == 0 ? type(uint256).max : supplied - keep, address(this));
        }

        uint256 tip;
        if (msg.sender != owner) {
            tip = (withdrawn * rules.tipBps) / 10_000;
            if (tip > 0) collateral.safeTransfer(msg.sender, tip);
        }

        uint256 collateralToOwner = collateral.balanceOf(address(this));
        if (collateralToOwner > 0) collateral.safeTransfer(owner, collateralToOwner);
        uint256 debtAssetToOwner = debtAsset.balanceOf(address(this));
        if (debtAssetToOwner > 0) debtAsset.safeTransfer(owner, debtAssetToOwner);

        emit Exited(msg.sender, reason, repaid, collateralToOwner, debtAssetToOwner, tip);
    }

    /// Collateral worth 4x `debtAmount` at oracle prices: keeps health far above 1 for left-over dust debt.
    function _collateralFor(uint256 debtAmount) private view returns (uint256) {
        IAaveOracle oracle = IAaveOracle(IPoolAddressesProvider(pool.ADDRESSES_PROVIDER()).getPriceOracle());
        uint256 num = debtAmount * oracle.getAssetPrice(address(debtAsset)) * 4
            * (10 ** IERC20Metadata(address(collateral)).decimals());
        uint256 den = oracle.getAssetPrice(address(collateral)) * (10 ** IERC20Metadata(address(debtAsset)).decimals());
        return num / den + 1;
    }

    /// Owner can pull any token out (e.g. something sent here by mistake).
    function rescue(address token) external nonReentrant onlyOwner {
        IERC20 t = IERC20(token);
        uint256 bal = t.balanceOf(address(this));
        if (bal > 0) t.safeTransfer(owner, bal);
    }

    /// One read for the app and the agent.
    function position()
        external
        view
        returns (
            uint256 collateralAmount,
            uint256 vaultShares,
            uint256 vaultAssets,
            uint256 idleDebtAsset,
            uint256 debt,
            uint256 healthFactor
        )
    {
        collateralAmount = aToken.balanceOf(address(this));
        vaultShares = vault.balanceOf(address(this));
        vaultAssets = vaultShares > 0 ? vault.previewRedeem(vaultShares) : 0;
        idleDebtAsset = debtAsset.balanceOf(address(this));
        debt = debtToken.balanceOf(address(this));
        (,,,,, healthFactor) = pool.getUserAccountData(address(this));
    }
}
