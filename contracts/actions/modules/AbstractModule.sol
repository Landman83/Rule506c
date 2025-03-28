// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.17;

import "./IModule.sol";

/**
 * @title Abstract Action Module
 * @dev Base implementation for all action modules
 */
abstract contract AbstractModule is IModule {
    /// Mapping of actions contracts to binding status
    mapping(address => bool) internal _actionsBound;

    /**
     * @dev Binds the module to an actions contract
     * @param _actions The address of the actions contract to bind
     */
    function bindActions(address _actions) external override {
        require(_actions != address(0), "Invalid argument - zero address");
        require(!_actionsBound[_actions], "Actions contract already bound");
        require(msg.sender == _actions, "Only actions contract can call");
        
        _actionsBound[_actions] = true;
        emit ActionsBound(_actions);
    }

    /**
     * @dev Unbinds the module from an actions contract
     * @param _actions The address of the actions contract to unbind
     */
    function unbindActions(address _actions) external override {
        require(_actions != address(0), "Invalid argument - zero address");
        require(_actionsBound[_actions], "Actions contract not bound");
        require(msg.sender == _actions, "Only actions contract can call");
        
        delete _actionsBound[_actions];
        emit ActionsUnbound(_actions);
    }

    /**
     * @dev Checks if an actions contract is bound to the module
     * @param _actions The address of the actions contract to check
     * @return bool True if the actions contract is bound
     */
    function isActionsBound(address _actions) external view override returns (bool) {
        return _actionsBound[_actions];
    }

    /**
     * @dev Checks if module can be added to any actions contract without validation
     * @return bool True by default as most modules are plug and play
     */
    function isPlugAndPlay() external pure virtual override returns (bool) {
        return true;
    }

    /**
     * @dev Checks if an actions contract can be bound to the module
     * @param _actions The address of the actions contract to check
     * @return bool Always true for plug and play modules
     */
    function canActionsBind(address _actions) external view virtual override returns (bool) {
        require(_actions != address(0), "Invalid argument - zero address");
        return true;
    }
}