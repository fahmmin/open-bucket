// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// TESTNET ONLY. A 6-decimal stand-in for USDC that the owner can mint.
contract TestUSDC is ERC20 {
    address public immutable owner;

    constructor(address owner_) ERC20("Test USDC (Open Bucket)", "tUSDC") {
        owner = owner_;
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == owner, "only owner");
        _mint(to, amount);
    }
}

/// TESTNET ONLY. Stand-in for WETH (the collateral Aave accepts on Monad mainnet). Anyone can take 1 from the faucet.
contract TestWETH is ERC20 {
    uint256 public constant FAUCET_AMOUNT = 1 ether;

    constructor() ERC20("Test WETH (Open Bucket)", "tWETH") {}

    function faucet() external {
        _mint(msg.sender, FAUCET_AMOUNT);
    }
}

/// TESTNET ONLY. WETH9-style wrapper for native MON.
contract TestWMON is ERC20 {
    constructor() ERC20("Wrapped MON (Open Bucket test)", "WMON") {}

    receive() external payable {
        deposit();
    }

    function deposit() public payable {
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        _burn(msg.sender, amount);
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "MON transfer failed");
    }
}
