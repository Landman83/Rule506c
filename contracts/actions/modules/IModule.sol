// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.17;

/**
 * @title Action Module Interface
 * @dev Interface for all modules that can be added to ModularActions
 */
interface IModule {
    /**
     * @dev Emitted when the actions contract is bound to the module
     * @param actions The address of the actions contract being bound
     */
    event ActionsBound(address indexed actions);

    /**
     * @dev Emitted when the actions contract is unbound from the module
     * @param actions The address of the actions contract being unbound
     */
    event ActionsUnbound(address indexed actions);

    /**
     * @dev Binds the module to an actions contract
     * Can only be called by the actions contract itself
     * @param _actions The address of the actions contract
     */
    function bindActions(address _actions) external;

    /**
     * @dev Unbinds the module from an actions contract
     * Can only be called by the actions contract itself
     * @param _actions The address of the actions contract
     */
    function unbindActions(address _actions) external;

    /**
     * @dev Checks if an actions contract is bound to the module
     * @param _actions The address of the actions contract to check
     * @return bool True if the actions contract is bound
     */
    function isActionsBound(address _actions) external view returns (bool);

    /**
     * @dev Checks if an actions contract can be bound to the module
     * @param _actions The address of the actions contract to check
     * @return bool True if the actions contract can be bound
     */
    function canActionsBind(address _actions) external view returns (bool);

    /**
     * @dev Checks if module can be added to any actions contract without validation
     * @return bool True if the module is plug and play
     */
    function isPlugAndPlay() external pure returns (bool);

    /**
     * @dev Returns the name of the module
     * @return string The name of the module
     */
    function name() external pure returns (string memory);
}