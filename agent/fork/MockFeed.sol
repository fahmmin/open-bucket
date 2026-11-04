// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Settable price feed for the anvil fork ONLY. The agent copies this runtime code over the collateral's
/// Aave oracle source with anvil_setCode, then calls set() right away: the replaced contract's storage stays,
/// so slots 0 and 1 hold garbage until the first set() seeds the current price and the original decimals.
contract MockFeed {
    int256 public latestAnswer;
    uint8 public decimals;

    function set(int256 answer, uint8 decimals_) external {
        latestAnswer = answer;
        decimals = decimals_;
    }

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (1, latestAnswer, block.timestamp, block.timestamp, 1);
    }
}
