// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.17;

import "./AbstractProxy.sol";
import "./authority/ITREXImplementationAuthority.sol";

/**
 * @title ModularActionsProxy
 * @dev Proxy contract for ModularActions to support upgradeable pattern
 */
contract ModularActionsProxy is AbstractProxy {

    /**
     * @dev constructor
     * @param _implementationAuthority the implementation authority contract address
     */
    constructor(address _implementationAuthority) {
        require(_implementationAuthority != address(0), "invalid argument - zero address");
        _storeImplementationAuthority(_implementationAuthority);
        emit ImplementationAuthoritySet(_implementationAuthority);
        
        address logic = ITREXImplementationAuthority(getImplementationAuthority()).getMAImplementation();
        
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = logic.delegatecall(abi.encodeWithSignature("init()"));
        require(success, "Initialization failed.");
    }

    /**
     * @dev default payable function
     */
    // solhint-disable-next-line no-empty-blocks
    receive() external payable {
    }

    // solhint-disable-next-line no-complex-fallback
    fallback() external payable {
        address logic = ITREXImplementationAuthority(getImplementationAuthority()).getMAImplementation();
        
        // solhint-disable-next-line no-inline-assembly
        assembly {
            calldatacopy(0x0, 0x0, calldatasize())
            let success := delegatecall(sub(gas(), 10000), logic, 0x0, calldatasize(), 0, 0)
            let retSz := returndatasize()
            returndatacopy(0, 0, retSz)
            switch success
            case 0 {
                revert(0, retSz)
            }
            default {
                return(0, retSz)
            }
        }
    }
}