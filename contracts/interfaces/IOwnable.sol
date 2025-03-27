// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.17;

/**
 * @title Interface for Ownable contracts
 */
interface IOwnable {
    /**
     * @notice Returns the address of the owner
     */
    function owner() external view returns(address);
}