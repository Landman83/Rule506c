// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./AbstractModuleUpgradeable.sol"; // ERC-3643 base module
import "../../../registry/interface/IIdentityRegistry.sol"; // T-REX IdentityRegistry interface
import "../../../token/IToken.sol"; // T-REX Token interface
import "../IModularCompliance.sol"; // Modular Compliance interface

contract KYC is AbstractModuleUpgradeable {
    // Storage for tracking module initialization
    mapping(address => bool) private _initialized;

    // Event emitted when module is initialized
    event ModuleInitialized(address indexed compliance);

    // Modifier to ensure token compliance initialization
    modifier onlyInitialized(address _compliance) {
        require(_initialized[_compliance], "compliance not initialized");
        _;
    }

    // Initialize for upgradeable proxy
    function initialize() external initializer {
        __AbstractModule_init();
    }

    // Initialize the module for a specific compliance
    function initializeModule(address _compliance) external onlyComplianceCall {
        require(!_initialized[_compliance], "module already initialized");
        _initialized[_compliance] = true;
        emit ModuleInitialized(_compliance);
    }

    // Check transfer compliance using the IdentityRegistry from the token
    function moduleCheck(
        address _from,
        address _to,
        uint256 /*_value*/,
        address _compliance
    ) external view override onlyInitialized(_compliance) returns (bool) {
        // Get token from compliance
        address tokenAddress = IModularCompliance(_compliance).getTokenBound();
        // Get identity registry from token
        IIdentityRegistry identityRegistry = IToken(tokenAddress).identityRegistry();
        
        // For minting, only check the receiver
        if (_from == address(0)) {
            return identityRegistry.isVerified(_to);
        }
        
        // For transfers, check both sender and receiver
        return identityRegistry.isVerified(_from) && identityRegistry.isVerified(_to);
    }

    // Public view function to check KYC status
    function isKYCApproved(address _investor, address _compliance) external view onlyInitialized(_compliance) returns (bool) {
        address tokenAddress = IModularCompliance(_compliance).getTokenBound();
        IIdentityRegistry identityRegistry = IToken(tokenAddress).identityRegistry();
        return identityRegistry.isVerified(_investor);
    }

    // No-op functions required by IModule
    function moduleTransferAction(address, address, uint256) external override onlyComplianceCall {}
    function moduleMintAction(address, uint256) external override onlyComplianceCall {}
    function moduleBurnAction(address, uint256) external override onlyComplianceCall {}

    // ERC-3643 compatibility
    function canComplianceBind(address _compliance) external view override returns (bool) {
        return true;
    }

    function isPlugAndPlay() external pure override returns (bool) {
        // Not plug and play because it requires initialization
        return false;
    }

    function name() public pure override returns (string memory) {
        return "KYC";
    }
}