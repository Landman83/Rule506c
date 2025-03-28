// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.17;

import "./IModularStorage.sol";

/**
 * @title Modular Actions Storage
 * @dev Defines storage structure and variables for ModularActions
 */
contract MAStorage is IModularStorage {
    /// Address of token bound to this modular actions contract
    address internal _tokenBound;

    /// Array of all module addresses bound to this modular actions contract
    address[] internal _modules;
    
    /// Mapping of module address to binding status
    mapping(address => bool) internal _moduleBound;
}