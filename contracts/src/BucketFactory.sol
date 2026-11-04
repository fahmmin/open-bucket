// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPool, IWETH, ReserveDataLegacy} from "./interfaces/IAave.sol";
import {Bucket, Rules} from "./Bucket.sol";

/// Creates and opens buckets. The admin can only edit the vault allowlist; it has no power over buckets.
contract BucketFactory is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IPool public immutable pool;
    address public immutable wmon;
    address public immutable debtAsset; // USDC
    address public admin;

    mapping(address => bool) public isVaultAllowed;
    address[] private _vaults;
    address[] private _buckets;
    mapping(address => address[]) private _bucketsOf;

    event Created(address indexed owner, address indexed bucket, address collateral, address vault);
    event VaultAllowed(address indexed vault, bool allowed);

    error NotAdmin();
    error VaultNotAllowed();
    error WrongVaultAsset();
    error UnsupportedCollateral();
    error BadValue();

    constructor(IPool pool_, address wmon_, address debtAsset_, address admin_) {
        pool = pool_;
        wmon = wmon_;
        debtAsset = debtAsset_;
        admin = admin_;
    }

    function setVaultAllowed(address vault, bool allowed) external {
        if (msg.sender != admin) revert NotAdmin();
        if (allowed && IERC4626(vault).asset() != debtAsset) revert WrongVaultAsset();
        if (allowed && !_known(vault)) _vaults.push(vault);
        isVaultAllowed[vault] = allowed;
        emit VaultAllowed(vault, allowed);
    }

    function createAndOpen(
        address collateral,
        address vault,
        uint256 collateralAmount,
        uint256 borrowAmount,
        uint256 bufferAmount,
        Rules calldata rules
    ) external payable nonReentrant returns (address bucket) {
        if (!isVaultAllowed[vault]) revert VaultNotAllowed();
        if (msg.value > 0 && (collateral != wmon || msg.value != collateralAmount)) revert BadValue();
        ReserveDataLegacy memory c = pool.getReserveData(collateral);
        ReserveDataLegacy memory d = pool.getReserveData(debtAsset);
        if (c.aTokenAddress == address(0)) revert UnsupportedCollateral();

        Bucket b = new Bucket(
            msg.sender,
            pool,
            IERC20(collateral),
            IERC20(c.aTokenAddress),
            IERC20(debtAsset),
            IERC20(d.variableDebtTokenAddress),
            IERC4626(vault),
            rules
        );

        if (msg.value > 0) {
            IWETH(wmon).deposit{value: msg.value}();
            IERC20(wmon).safeTransfer(address(b), collateralAmount);
        } else {
            IERC20(collateral).safeTransferFrom(msg.sender, address(b), collateralAmount);
        }
        b.open(collateralAmount, borrowAmount, bufferAmount);

        // The bucket borrowed for itself; nothing stays in the factory.
        bucket = address(b);
        _buckets.push(bucket);
        _bucketsOf[msg.sender].push(bucket);
        emit Created(msg.sender, bucket, collateral, vault);
    }

    function allowedVaults() external view returns (address[] memory out) {
        uint256 n;
        for (uint256 i; i < _vaults.length; i++) if (isVaultAllowed[_vaults[i]]) n++;
        out = new address[](n);
        n = 0;
        for (uint256 i; i < _vaults.length; i++) if (isVaultAllowed[_vaults[i]]) out[n++] = _vaults[i];
    }

    function allBuckets() external view returns (address[] memory) {
        return _buckets;
    }

    function bucketsOf(address owner) external view returns (address[] memory) {
        return _bucketsOf[owner];
    }

    function _known(address vault) private view returns (bool) {
        for (uint256 i; i < _vaults.length; i++) if (_vaults[i] == vault) return true;
        return false;
    }
}
