// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.17;

/**
 * @title Interface for Modular Actions Storage
 * @dev Defines storage structure and variables for ModularActions
 */
interface IModularStorage {
    /**
     * @dev Emitted when an action module is bound to the modular actions contract
     * @param module The address of the module being bound
     */
    event ModuleAdded(address indexed module);

    /**
     * @dev Emitted when an action module is unbound from the modular actions contract
     * @param module The address of the module being unbound
     */
    event ModuleRemoved(address indexed module);

    /**
     * @dev Emitted when token is bound to the modular actions contract
     * @param token The address of the token being bound
     */
    event TokenBound(address indexed token);

    /**
     * @dev Emitted when token is unbound from the modular actions contract
     * @param token The address of the token being unbound
     */
    event TokenUnbound(address indexed token);

    /**
     * @dev Emitted when a module function is called through the modular actions contract
     * @param module The module address that was called
     * @param selector The function selector that was called on the module
     */
    event ModuleInteraction(address indexed module, bytes4 indexed selector);
}