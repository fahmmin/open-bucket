// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ReserveDataLegacy} from "../interfaces/IAave.sol";
import {TestOracle} from "./TestOracle.sol";

/// Balance tracker standing in for Aave's aToken / variable debt token. Not transferable.
contract TestReceipt {
    string public name;
    string public symbol;
    uint8 public immutable decimals;
    address public immutable pool;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;

    event Transfer(address indexed from, address indexed to, uint256 value);

    constructor(string memory name_, string memory symbol_, uint8 decimals_) {
        name = name_;
        symbol = symbol_;
        decimals = decimals_;
        pool = msg.sender;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == pool, "only pool");
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function burn(address from, uint256 amount) external {
        require(msg.sender == pool, "only pool");
        balanceOf[from] -= amount;
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }
}

/// TESTNET STAND-IN FOR AAVE V3. Aave is not deployed on Monad testnet, so this exposes the same function
/// signatures as the Aave V3 Pool for the calls Open Bucket makes. Deliberately simplified: no interest,
/// every supplied asset counts as collateral, 50% close factor, owner-set prices. Never use on mainnet.
contract TestPool is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Reserve {
        bool listed;
        uint8 decimals;
        uint16 ltv; // bps
        uint16 lt; // liquidation threshold, bps
        uint16 bonus; // liquidation bonus, bps on top of 100%
        TestReceipt aToken;
        TestReceipt debtToken;
        uint128 displayBorrowRateRay; // shown in the app only; no interest accrues
    }

    TestOracle public immutable oracle;
    address public owner;
    mapping(address => Reserve) public reserves;
    address[] public reservesList;

    event ReserveListed(address indexed asset, address aToken, address debtToken);
    event Supply(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint16 indexed referralCode);
    event Withdraw(address indexed reserve, address indexed user, address indexed to, uint256 amount);
    event Borrow(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount);
    event Repay(address indexed reserve, address indexed user, address indexed repayer, uint256 amount);
    event LiquidationCall(
        address indexed collateralAsset,
        address indexed debtAsset,
        address indexed user,
        uint256 debtToCover,
        uint256 liquidatedCollateralAmount,
        address liquidator,
        bool receiveAToken
    );

    constructor(TestOracle oracle_, address owner_) {
        oracle = oracle_;
        owner = owner_;
    }

    // ---- admin ----

    function listReserve(address asset, uint16 ltv, uint16 lt, uint16 bonus, uint128 displayBorrowRateRay) external {
        require(msg.sender == owner, "only owner");
        require(!reserves[asset].listed, "listed");
        require(ltv < lt && lt <= 9500 && bonus <= 2000, "bad params");
        string memory sym = IERC20Metadata(asset).symbol();
        uint8 dec = IERC20Metadata(asset).decimals();
        TestReceipt a = new TestReceipt(string.concat("Test pool supplied ", sym), string.concat("tp", sym), dec);
        TestReceipt d = new TestReceipt(string.concat("Test pool debt ", sym), string.concat("tpDebt", sym), dec);
        reserves[asset] = Reserve(true, dec, ltv, lt, bonus, a, d, displayBorrowRateRay);
        reservesList.push(asset);
        emit ReserveListed(asset, address(a), address(d));
    }

    // ---- Aave V3 Pool surface ----

    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external nonReentrant {
        Reserve storage r = _reserve(asset);
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        r.aToken.mint(onBehalfOf, amount);
        emit Supply(asset, msg.sender, onBehalfOf, amount, referralCode);
    }

    function withdraw(address asset, uint256 amount, address to) external nonReentrant returns (uint256) {
        Reserve storage r = _reserve(asset);
        uint256 bal = r.aToken.balanceOf(msg.sender);
        uint256 amt = amount == type(uint256).max ? bal : amount;
        require(amt <= bal, "not enough supplied");
        r.aToken.burn(msg.sender, amt);
        (,,,,, uint256 hf) = getUserAccountData(msg.sender);
        require(hf >= 1e18, "health would fall below 1");
        IERC20(asset).safeTransfer(to, amt);
        emit Withdraw(asset, msg.sender, to, amt);
        return amt;
    }

    function borrow(address asset, uint256 amount, uint256, uint16, address onBehalfOf) external nonReentrant {
        require(onBehalfOf == msg.sender, "no credit delegation in test pool");
        Reserve storage r = _reserve(asset);
        r.debtToken.mint(msg.sender, amount);
        (uint256 coll, uint256 debt,,, uint256 ltv,) = getUserAccountData(msg.sender);
        require(debt * 10_000 <= coll * ltv, "borrow exceeds LTV");
        IERC20(asset).safeTransfer(msg.sender, amount);
        emit Borrow(asset, msg.sender, onBehalfOf, amount);
    }

    function repay(address asset, uint256 amount, uint256, address onBehalfOf) external nonReentrant returns (uint256) {
        Reserve storage r = _reserve(asset);
        if (amount == type(uint256).max) require(msg.sender == onBehalfOf, "explicit amount needed");
        uint256 debt = r.debtToken.balanceOf(onBehalfOf);
        uint256 pay = amount < debt ? amount : debt;
        IERC20(asset).safeTransferFrom(msg.sender, address(this), pay);
        r.debtToken.burn(onBehalfOf, pay);
        emit Repay(asset, onBehalfOf, msg.sender, pay);
        return pay;
    }

    function setUserUseReserveAsCollateral(address, bool) external pure {} // every supplied asset counts

    function liquidationCall(address collateralAsset, address debtAsset, address user, uint256 debtToCover, bool receiveAToken)
        external
        nonReentrant
    {
        require(!receiveAToken, "aToken receipt not supported");
        (,,,,, uint256 hf) = getUserAccountData(user);
        require(hf < 1e18, "health not below 1");
        (uint256 cover, uint256 seize) = _liquidationAmounts(collateralAsset, debtAsset, user, debtToCover);
        IERC20(debtAsset).safeTransferFrom(msg.sender, address(this), cover);
        reserves[debtAsset].debtToken.burn(user, cover);
        reserves[collateralAsset].aToken.burn(user, seize);
        IERC20(collateralAsset).safeTransfer(msg.sender, seize);
        emit LiquidationCall(collateralAsset, debtAsset, user, cover, seize, msg.sender, false);
    }

    function _liquidationAmounts(address collateralAsset, address debtAsset, address user, uint256 debtToCover)
        private
        view
        returns (uint256 cover, uint256 seize)
    {
        Reserve storage c = _reserve(collateralAsset);
        Reserve storage d = _reserve(debtAsset);
        uint256 maxCover = d.debtToken.balanceOf(user) / 2; // 50% close factor
        cover = debtToCover < maxCover ? debtToCover : maxCover;
        uint256 num = oracle.getAssetPrice(debtAsset) * (10 ** c.decimals) * (10_000 + c.bonus);
        uint256 den = oracle.getAssetPrice(collateralAsset) * (10 ** d.decimals) * 10_000;
        seize = (cover * num) / den;
        uint256 aBal = c.aToken.balanceOf(user);
        if (seize > aBal) {
            seize = aBal;
            cover = (seize * den) / num;
        }
    }

    function getUserAccountData(address user)
        public
        view
        returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        )
    {
        // currentLiquidationThreshold and ltv first hold value-weighted sums, then the averages.
        for (uint256 i; i < reservesList.length; i++) {
            (uint256 c, uint256 d, uint256 ltWeighted, uint256 ltvWeighted) = _values(reservesList[i], user);
            totalCollateralBase += c;
            totalDebtBase += d;
            currentLiquidationThreshold += ltWeighted;
            ltv += ltvWeighted;
        }
        if (totalCollateralBase > 0) {
            currentLiquidationThreshold /= totalCollateralBase;
            ltv /= totalCollateralBase;
        }
        uint256 maxDebt = (totalCollateralBase * ltv) / 10_000;
        availableBorrowsBase = maxDebt > totalDebtBase ? maxDebt - totalDebtBase : 0;
        healthFactor = totalDebtBase == 0
            ? type(uint256).max
            : (((totalCollateralBase * currentLiquidationThreshold) / 10_000) * 1e18) / totalDebtBase;
    }

    function _values(address asset, address user)
        private
        view
        returns (uint256 coll, uint256 debt, uint256 ltWeighted, uint256 ltvWeighted)
    {
        Reserve storage r = reserves[asset];
        uint256 a = r.aToken.balanceOf(user);
        uint256 dBal = r.debtToken.balanceOf(user);
        if (a == 0 && dBal == 0) return (0, 0, 0, 0);
        uint256 p = oracle.getAssetPrice(asset);
        uint256 unit = 10 ** r.decimals;
        coll = (a * p) / unit;
        debt = (dBal * p) / unit;
        ltWeighted = coll * r.lt;
        ltvWeighted = coll * r.ltv;
    }

    /// Aave's legacy struct; configuration uses Aave's bit layout (LTV, threshold, 10000+bonus, decimals,
    /// active bit 56, borrowing-enabled bit 58).
    function getReserveData(address asset) external view returns (ReserveDataLegacy memory out) {
        Reserve storage r = reserves[asset];
        if (!r.listed) return out;
        out.configuration = uint256(r.ltv) | (uint256(r.lt) << 16) | (uint256(10_000 + r.bonus) << 32)
            | (uint256(r.decimals) << 48) | (uint256(1) << 56) | (uint256(1) << 58);
        out.currentVariableBorrowRate = r.displayBorrowRateRay;
        out.aTokenAddress = address(r.aToken);
        out.variableDebtTokenAddress = address(r.debtToken);
    }

    function getReservesList() external view returns (address[] memory) {
        return reservesList;
    }

    /// Lets tools resolve the oracle the Aave way: Pool.ADDRESSES_PROVIDER().getPriceOracle().
    function ADDRESSES_PROVIDER() external view returns (address) {
        return address(this);
    }

    function getPriceOracle() external view returns (address) {
        return address(oracle);
    }

    function _reserve(address asset) private view returns (Reserve storage r) {
        r = reserves[asset];
        require(r.listed, "reserve not listed");
    }
}
