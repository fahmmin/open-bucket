// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// TESTNET ONLY. A plain OpenZeppelin ERC-4626 vault over test USDC (no strategy, no yield).
contract TestVault is ERC4626 {
    constructor(IERC20 asset_) ERC20("Test USDC Vault", "tvUSDC") ERC4626(asset_) {}
}
