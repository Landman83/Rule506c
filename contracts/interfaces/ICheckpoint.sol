// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.17;

/**
 * @title Interface for checkpoint module
 */
interface ICheckpoint {
    /**
     * @notice Creates a checkpoint on the token
     * @return The checkpoint ID
     */
    function createCheckpoint() external returns(uint256);
}