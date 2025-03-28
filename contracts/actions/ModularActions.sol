// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../token/IToken.sol";
import "./MAStorage.sol";
import "./modules/IModule.sol";

/**
 * @title ModularActions
 * @dev Manages token action modules such as Dividend and Voting functionality
 * Follows a similar pattern to ModularCompliance but for action modules
 */
contract ModularActions is OwnableUpgradeable, MAStorage {
    /**
     * @dev Throws if called by any address that is not a token bound to the actions contract
     */
    modifier onlyToken() {
        require(msg.sender == _tokenBound, "This address is not a token bound to the actions contract");
        _;
    }

    /**
     * @dev Initializes the contract
     */
    function init() external initializer {
        __Ownable_init();
    }

    /**
     * @dev Binds a token to the action contract
     * @param _token The token address to bind
     */
    function bindToken(address _token) external {
        require(owner() == msg.sender || (_tokenBound == address(0) && msg.sender == _token),
            "Only owner or token can call");
        require(_token != address(0), "Invalid argument - zero address");
        _tokenBound = _token;
        emit TokenBound(_token);
    }

    /**
     * @dev Unbinds a token from the action contract
     * @param _token The token address to unbind
     */
    function unbindToken(address _token) external {
        require(owner() == msg.sender || msg.sender == _token, "Only owner or token can call");
        require(_token == _tokenBound, "This token is not bound");
        require(_token != address(0), "Invalid argument - zero address");
        delete _tokenBound;
        emit TokenUnbound(_token);
    }

    /**
     * @dev Adds a module to the actions contract
     * @param _module The module address to add
     */
    function addModule(address _module) external onlyOwner {
        require(_module != address(0), "Invalid argument - zero address");
        require(!_moduleBound[_module], "Module already bound");
        require(_modules.length <= 24, "Cannot add more than 25 modules");
        
        IModule module = IModule(_module);
        if (!module.isPlugAndPlay()) {
            require(module.canActionsBind(address(this)), "Actions contract is not suitable for binding to the module");
        }

        module.bindActions(address(this));
        _modules.push(_module);
        _moduleBound[_module] = true;
        emit ModuleAdded(_module);
    }

    /**
     * @dev Removes a module from the actions contract
     * @param _module The module address to remove
     */
    function removeModule(address _module) external onlyOwner {
        require(_module != address(0), "Invalid argument - zero address");
        require(_moduleBound[_module], "Module not bound");
        
        uint256 length = _modules.length;
        for (uint256 i = 0; i < length; i++) {
            if (_modules[i] == _module) {
                IModule(_module).unbindActions(address(this));
                _modules[i] = _modules[length - 1];
                _modules.pop();
                _moduleBound[_module] = false;
                emit ModuleRemoved(_module);
                break;
            }
        }
    }

    /**
     * @dev Calls a function on a module
     * @param callData The function call data
     * @param _module The module address to call
     */
    function callModuleFunction(bytes calldata callData, address _module) external onlyOwner {
        require(_moduleBound[_module], "Call only on bound module");
        
        // Use assembly to call the interaction
        // solhint-disable-next-line no-inline-assembly
        assembly {
            let freeMemoryPointer := mload(0x40)
            calldatacopy(freeMemoryPointer, callData.offset, callData.length)
            if iszero(
                call(
                    gas(),
                    _module,
                    0,
                    freeMemoryPointer,
                    callData.length,
                    0,
                    0
                )
            ) {
                returndatacopy(0, 0, returndatasize())
                revert(0, returndatasize())
            }
        }

        emit ModuleInteraction(_module, _selector(callData));
    }

    /**
     * @dev Checks if a module is bound
     * @param _module The module address to check
     * @return bool True if the module is bound
     */
    function isModuleBound(address _module) external view returns (bool) {
        return _moduleBound[_module];
    }

    /**
     * @dev Gets all bound modules
     * @return address[] Array of all bound module addresses
     */
    function getModules() external view returns (address[] memory) {
        return _modules;
    }

    /**
     * @dev Gets the bound token address
     * @return address The bound token address
     */
    function getTokenBound() external view returns (address) {
        return _tokenBound;
    }

    /**
     * @dev Extracts the function selector from call data
     * @param callData The function call data
     * @return result The function selector
     */
    function _selector(bytes calldata callData) internal pure returns (bytes4 result) {
        if (callData.length >= 4) {
            // solhint-disable-next-line no-inline-assembly
            assembly {
                result := calldataload(callData.offset)
            }
        }
    }
}