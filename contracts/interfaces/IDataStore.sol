// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.17;

/**
 * @title Interface for data storage
 */
interface IDataStore {
    /**
     * @notice Get address from data store
     * @param _key The key to retrieve
     * @return Address stored under the key
     */
    function getAddress(bytes32 _key) external view returns(address);
}