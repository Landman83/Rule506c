// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.17;

import "../roles/AgentRole.sol";
import "../token/IToken.sol";
import "../registry/interface/IClaimTopicsRegistry.sol";
import "../registry/interface/IIdentityRegistry.sol";
import "../compliance/modular/IModularCompliance.sol";
import "../registry/interface/ITrustedIssuersRegistry.sol";
import "../registry/interface/IIdentityRegistryStorage.sol";
import "../proxy/authority/ITREXImplementationAuthority.sol";
import "../proxy/TokenProxy.sol";
import "../proxy/ClaimTopicsRegistryProxy.sol";
import "../proxy/IdentityRegistryProxy.sol";
import "../proxy/IdentityRegistryStorageProxy.sol";
import "../proxy/TrustedIssuersRegistryProxy.sol";
import "../proxy/ModularComplianceProxy.sol";
import "./ITREXFactory.sol";
import "@onchain-id/solidity/contracts/factory/IIdFactory.sol";

/**
 * @title Rule506cFactory
 * @dev A slimmed down version of TREXFactory specifically for Rule 506c tokens
 * This factory omits action modules integration to avoid contract size limitations
 */
contract Rule506cFactory is Ownable {
    /// the address of the implementation authority contract used in the tokens deployed by the factory
    address private _implementationAuthority;

    /// the address of the Identity Factory used to deploy token OIDs
    address private _idFactory;

    /// mapping containing info about the token contracts corresponding to salt already used for CREATE2 deployments
    mapping(string => address) public tokenDeployed;

    /// Events
    event Deployed(address indexed _addr);
    event IdFactorySet(address _idFactory);
    event ImplementationAuthoritySet(address _implementationAuthority);
    event Rule506cTokenDeployed(address indexed _token, address _ir, address _irs, address _tir, address _ctr, address _mc, string indexed _salt);

    /// constructor is setting the implementation authority and the Identity Factory of the TREX factory
    constructor(address implementationAuthority_, address idFactory_) {
        setImplementationAuthority(implementationAuthority_);
        setIdFactory(idFactory_);
    }

    // Events to help with debugging
    event DeploymentStarted(
        string salt,
        string name,
        string symbol,
        uint8 decimals,
        address owner,
        address[] complianceModules
    );
    event ComponentDeployed(string componentName, address componentAddress);

    /**
     * @dev Deploys a Rule 506c compliant token suite
     * This version does not include action modules to avoid contract size limitations
     * @param _salt The salt for CREATE2 deployment
     * @param _name Token name
     * @param _symbol Token symbol
     * @param _decimals Token decimals
     * @param _owner Token owner
     * @param _complianceModules Array of compliance module addresses (optional)
     */
    function deployRule506cToken(
        string memory _salt, 
        string memory _name,
        string memory _symbol,
        uint8 _decimals,
        address _owner,
        address[] memory _complianceModules
    ) external onlyOwner {
        require(tokenDeployed[_salt] == address(0), "token already deployed");
        require(_owner != address(0), "invalid owner address");
        
        // Emit event for debugging
        emit DeploymentStarted(_salt, _name, _symbol, _decimals, _owner, _complianceModules);

        // Deploy TREX components
        emit ComponentDeployed("Starting TIR deployment", address(0));
        address tirAddress = _deployTIR(_salt, _implementationAuthority);
        emit ComponentDeployed("TIR", tirAddress);
        ITrustedIssuersRegistry tir = ITrustedIssuersRegistry(tirAddress);
        
        emit ComponentDeployed("Starting CTR deployment", address(0));
        address ctrAddress = _deployCTR(_salt, _implementationAuthority);
        emit ComponentDeployed("CTR", ctrAddress);
        IClaimTopicsRegistry ctr = IClaimTopicsRegistry(ctrAddress);
        
        emit ComponentDeployed("Starting MC deployment", address(0));
        address mcAddress = _deployMC(_salt, _implementationAuthority);
        emit ComponentDeployed("MC", mcAddress);
        IModularCompliance mc = IModularCompliance(mcAddress);
        
        emit ComponentDeployed("Starting IRS deployment", address(0));
        address irsAddress = _deployIRS(_salt, _implementationAuthority);
        emit ComponentDeployed("IRS", irsAddress);
        IIdentityRegistryStorage irs = IIdentityRegistryStorage(irsAddress);
        
        emit ComponentDeployed("Starting IR deployment", address(0));
        address irAddress = _deployIR(_salt, _implementationAuthority, address(tir), address(ctr), address(irs));
        emit ComponentDeployed("IR", irAddress);
        IIdentityRegistry ir = IIdentityRegistry(irAddress);

        // Deploy token without onchain ID (will be created later)
        IToken token = IToken(_deployToken(
            _salt,
            _implementationAuthority,
            address(ir),
            address(mc),
            _name,
            _symbol,
            _decimals,
            address(0) // No ONCHAINID yet
        ));

        // Create token identity
        address tokenID = IIdFactory(_idFactory).createTokenIdentity(address(token), _owner, _salt);
        token.setOnchainID(tokenID);

        // Setup claim topics for Rule 506c - requires KYC
        ctr.addClaimTopic(7); // KYC claim topic

        // Setup identity registry
        irs.bindIdentityRegistry(address(ir));
        AgentRole(address(ir)).addAgent(address(token));
        AgentRole(address(ir)).addAgent(_owner);
        
        // Setup token
        AgentRole(address(token)).addAgent(_owner);
        
        // Setup compliance modules
        if (_complianceModules.length > 0) {
            // Add provided compliance modules
            for (uint256 i = 0; i < _complianceModules.length; i++) {
                if (_complianceModules[i] != address(0) && !mc.isModuleBound(_complianceModules[i])) {
                    mc.addModule(_complianceModules[i]);
                }
            }
        }
        
        // ModularComplianceProxy initializes itself during deployment
        
        // Register the deployed token
        tokenDeployed[_salt] = address(token);
        
        // Transfer ownership of all contracts to the specified owner
        (Ownable(address(token))).transferOwnership(_owner);
        (Ownable(address(ir))).transferOwnership(_owner);
        (Ownable(address(tir))).transferOwnership(_owner);
        (Ownable(address(ctr))).transferOwnership(_owner);
        (Ownable(address(mc))).transferOwnership(_owner);
        
        emit Rule506cTokenDeployed(address(token), address(ir), address(irs), address(tir), address(ctr), address(mc), _salt);
    }

    /**
     * @dev Recover ownership of a contract
     */
    function recoverContractOwnership(address _contract, address _newOwner) external onlyOwner {
        (Ownable(_contract)).transferOwnership(_newOwner);
    }

    /**
     * @dev Get the implementation authority address
     */
    function getImplementationAuthority() external view returns(address) {
        return _implementationAuthority;
    }

    /**
     * @dev Get the ID factory address
     */
    function getIdFactory() external view returns(address) {
        return _idFactory;
    }

    /**
     * @dev Get token address for a given salt
     */
    function getToken(string calldata _salt) external view returns(address) {
        return tokenDeployed[_salt];
    }

    /**
     * @dev Set the implementation authority
     */
    function setImplementationAuthority(address implementationAuthority_) public onlyOwner {
        require(implementationAuthority_ != address(0), "invalid argument - zero address");
        // should not be possible to set an implementation authority that is not complete
        require(
            (ITREXImplementationAuthority(implementationAuthority_)).getTokenImplementation() != address(0)
            && (ITREXImplementationAuthority(implementationAuthority_)).getCTRImplementation() != address(0)
            && (ITREXImplementationAuthority(implementationAuthority_)).getIRImplementation() != address(0)
            && (ITREXImplementationAuthority(implementationAuthority_)).getIRSImplementation() != address(0)
            && (ITREXImplementationAuthority(implementationAuthority_)).getMCImplementation() != address(0)
            && (ITREXImplementationAuthority(implementationAuthority_)).getTIRImplementation() != address(0),
            "invalid Implementation Authority");
        _implementationAuthority = implementationAuthority_;
        emit ImplementationAuthoritySet(implementationAuthority_);
    }

    /**
     * @dev Set the ID factory
     */
    function setIdFactory(address idFactory_) public onlyOwner {
        require(idFactory_ != address(0), "invalid argument - zero address");
        _idFactory = idFactory_;
        emit IdFactorySet(idFactory_);
    }

    /// deploy function with create2 opcode call
    /// returns the address of the contract created
    function _deploy(string memory salt, bytes memory bytecode) private returns (address) {
        bytes32 saltBytes = bytes32(keccak256(abi.encodePacked(salt)));
        address addr;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            let encoded_data := add(0x20, bytecode) // load initialization code.
            let encoded_size := mload(bytecode)     // load init code's length.
            addr := create2(0, encoded_data, encoded_size, saltBytes)
            if iszero(extcodesize(addr)) {
                revert(0, 0)
            }
        }
        emit Deployed(addr);
        return addr;
    }

    /// function used to deploy a trusted issuers registry using CREATE2
    function _deployTIR
    (
        string memory _salt,
        address implementationAuthority_
    ) private returns (address){
        bytes memory _code = type(TrustedIssuersRegistryProxy).creationCode;
        require(implementationAuthority_ != address(0), "TIR deploy: implementation authority cannot be zero");
        bytes memory _constructData = abi.encode(implementationAuthority_);
        bytes memory bytecode = abi.encodePacked(_code, _constructData);
        return _deploy(_salt, bytecode);
    }

    /// function used to deploy a claim topics registry using CREATE2
    function  _deployCTR
    (
        string memory _salt,
        address implementationAuthority_
    ) private returns (address) {
        bytes memory _code = type(ClaimTopicsRegistryProxy).creationCode;
        bytes memory _constructData = abi.encode(implementationAuthority_);
        bytes memory bytecode = abi.encodePacked(_code, _constructData);
        return _deploy(_salt, bytecode);
    }

    /// function used to deploy modular compliance contract using CREATE2
    function  _deployMC
    (
        string memory _salt,
        address implementationAuthority_
    ) private returns (address) {
        bytes memory _code = type(ModularComplianceProxy).creationCode;
        bytes memory _constructData = abi.encode(implementationAuthority_);
        bytes memory bytecode = abi.encodePacked(_code, _constructData);
        return _deploy(_salt, bytecode);
    }

    /// function used to deploy an identity registry storage using CREATE2
    function _deployIRS
    (
        string memory _salt,
        address implementationAuthority_
    ) private returns (address) {
        bytes memory _code = type(IdentityRegistryStorageProxy).creationCode;
        bytes memory _constructData = abi.encode(implementationAuthority_);
        bytes memory bytecode = abi.encodePacked(_code, _constructData);
        return _deploy(_salt, bytecode);
    }

    /// function used to deploy an identity registry using CREATE2
    function _deployIR
    (
        string memory _salt,
        address implementationAuthority_,
        address _trustedIssuersRegistry,
        address _claimTopicsRegistry,
        address _identityStorage
    ) private returns (address) {
        bytes memory _code = type(IdentityRegistryProxy).creationCode;
        bytes memory _constructData = abi.encode
        (
            implementationAuthority_,
            _trustedIssuersRegistry,
            _claimTopicsRegistry,
            _identityStorage
        );
        bytes memory bytecode = abi.encodePacked(_code, _constructData);
        return _deploy(_salt, bytecode);
    }

    /// function used to deploy a token using CREATE2
    function _deployToken
    (
        string memory _salt,
        address implementationAuthority_,
        address _identityRegistry,
        address _compliance,
        string memory _name,
        string memory _symbol,
        uint8 _decimals,
        address _onchainId
    ) private returns (address) {
        bytes memory _code = type(TokenProxy).creationCode;
        bytes memory _constructData = abi.encode
        (
            implementationAuthority_,
            _identityRegistry,
            _compliance,
            _name,
            _symbol,
            _decimals,
            _onchainId
        );
        bytes memory bytecode = abi.encodePacked(_code, _constructData);
        return _deploy(_salt, bytecode);
    }
}