// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// TESTNET ONLY. Owner-set USD prices (8 decimals), same getter as Aave's oracle.
contract TestOracle {
    address public owner;
    mapping(address => uint256) public price;

    event AssetPriceSet(address indexed asset, uint256 price);
    event OwnerChanged(address indexed owner);

    constructor(address owner_) {
        owner = owner_;
    }

    function setAssetPrice(address asset, uint256 newPrice) external {
        require(msg.sender == owner, "only owner");
        require(newPrice > 0, "price is zero");
        price[asset] = newPrice;
        emit AssetPriceSet(asset, newPrice);
    }

    function setOwner(address owner_) external {
        require(msg.sender == owner, "only owner");
        owner = owner_;
        emit OwnerChanged(owner_);
    }

    function getAssetPrice(address asset) external view returns (uint256) {
        uint256 p = price[asset];
        require(p != 0, "no price");
        return p;
    }

    function getSourceOfAsset(address) external pure returns (address) {
        return address(0);
    }
}
