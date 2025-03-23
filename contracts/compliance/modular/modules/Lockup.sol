// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./AbstractModuleUpgradeable.sol"; // ERC-3643 base module
import "../../../token/IToken.sol"; // T-REX Token interface
import "../IModularCompliance.sol"; // Modular Compliance interface

contract Lockup is AbstractModuleUpgradeable {
    // Default lockup period (6 minutes = 360 seconds)
    uint256 public constant DEFAULT_LOCKUP_PERIOD = 360;

    // Struct to store lockup details
    struct LockUp {
        uint256 lockupAmount;         // Amount of tokens locked
        uint256 startTime;           // When the lockup starts
        uint256 lockUpPeriodSeconds; // Total lockup duration
        uint256 unlockedAmount;      // Amount unlocked so far
    }

    // Mapping of user address to their lockups (name => LockUp)
    mapping(address => mapping(bytes32 => LockUp)) public userToLockups;
    // Mapping of lockup name to list of users
    mapping(bytes32 => address[]) public lockupToUsers;
    // List of all lockup names
    bytes32[] public lockupArray;
    // Mapping to track initialized status for each compliance
    mapping(address => bool) private _initialized;

    event AddLockUpToUser(address indexed userAddress, bytes32 indexed lockupName, uint256 lockupAmount, uint256 startTime);
    event RemoveLockUpFromUser(address indexed userAddress, bytes32 indexed lockupName);
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

    // Add a lockup to a user with default 6-minute period
    function addLockUpToUser(address _userAddress, uint256 _lockupAmount, bytes32 _lockupName) external onlyComplianceCall {
        require(_userAddress != address(0), "Invalid address");
        require(_lockupAmount > 0, "Amount cannot be zero");
        require(_lockupName != bytes32(0), "Invalid name");
        require(userToLockups[_userAddress][_lockupName].lockupAmount == 0, "Lockup already exists");

        uint256 startTime = block.timestamp;
        userToLockups[_userAddress][_lockupName] = LockUp(_lockupAmount, startTime, DEFAULT_LOCKUP_PERIOD, 0);
        lockupToUsers[_lockupName].push(_userAddress);
        lockupArray.push(_lockupName);

        emit AddLockUpToUser(_userAddress, _lockupName, _lockupAmount, startTime);
    }

    // Remove a lockup from a user
    function removeLockUpFromUser(address _userAddress, bytes32 _lockupName) external onlyComplianceCall {
        require(_userAddress != address(0), "Invalid address");
        require(_lockupName != bytes32(0), "Invalid name");
        require(userToLockups[_userAddress][_lockupName].lockupAmount > 0, "Lockup does not exist");

        // Remove from userToLockups
        delete userToLockups[_userAddress][_lockupName];

        // Remove from lockupToUsers
        address[] storage users = lockupToUsers[_lockupName];
        for (uint256 i = 0; i < users.length; i++) {
            if (users[i] == _userAddress) {
                if (i != users.length - 1) {
                    users[i] = users[users.length - 1];
                }
                users.pop();
                break;
            }
        }

        // Note: lockupArray is not updated for simplicity; it could be if needed
        emit RemoveLockUpFromUser(_userAddress, _lockupName);
    }

    // Check transfer compliance
    function moduleCheck(
        address _from,
        address /*_to*/,
        uint256 _value,
        address _compliance
    ) external view override returns (bool) {
        // Don't enforce lockup on minting operations
        if (_from == address(0)) {
            return true;
        }
        return _checkIfValidTransfer(_from, _value, _compliance);
    }

    // Internal logic to verify transfer
    function _checkIfValidTransfer(address _from, uint256 _value, address _compliance) internal view returns (bool) {
        uint256 lockedAmount = getLockedTokenToUser(_from);
        
        // Get token address from compliance
        address tokenAddress = IModularCompliance(_compliance).getTokenBound();
        uint256 currentBalance = IToken(tokenAddress).balanceOf(_from);

        // Allow transfer if balance after transfer exceeds locked amount
        return currentBalance >= _value + lockedAmount;
    }

    // Calculate total locked tokens for a user
    function getLockedTokenToUser(address _userAddress) public view returns (uint256) {
        uint256 totalLocked = 0;
        for (uint256 i = 0; i < lockupArray.length; i++) {
            LockUp memory lockup = userToLockups[_userAddress][lockupArray[i]];
            if (lockup.lockupAmount > 0) {
                uint256 unlocked = _getUnlockedAmountForLockup(_userAddress, lockupArray[i]);
                if (lockup.lockupAmount > unlocked) {
                    totalLocked += lockup.lockupAmount - unlocked;
                }
            }
        }
        return totalLocked;
    }

    // Calculate unlocked amount for a specific lockup
    function _getUnlockedAmountForLockup(address _userAddress, bytes32 _lockupName) internal view returns (uint256) {
        LockUp memory lockup = userToLockups[_userAddress][_lockupName];
        if (lockup.lockupAmount == 0 || block.timestamp < lockup.startTime) {
            return 0;
        }
        if (block.timestamp >= lockup.startTime + lockup.lockUpPeriodSeconds) {
            return lockup.lockupAmount;
        }
        // Cliff vesting - no tokens unlock until the end of the lockup period
        return 0;
    }

    // Public view function to get lockup details
    function getLockUp(address _userAddress, bytes32 _lockupName) external view returns (
        uint256 lockupAmount,
        uint256 startTime,
        uint256 lockUpPeriodSeconds,
        uint256 unlockedAmount
    ) {
        LockUp memory lockup = userToLockups[_userAddress][_lockupName];
        if (lockup.lockupAmount == 0) {
            return (0, 0, 0, 0);
        }
        return (
            lockup.lockupAmount,
            lockup.startTime,
            lockup.lockUpPeriodSeconds,
            _getUnlockedAmountForLockup(_userAddress, _lockupName)
        );
    }

    // No-op functions required by IModule
    function moduleTransferAction(address, address, uint256) external onlyComplianceCall {}
    function moduleMintAction(address, uint256) external onlyComplianceCall {}
    function moduleBurnAction(address, uint256) external onlyComplianceCall {}

    // ERC-3643 compatibility
    function canComplianceBind(address /*_compliance*/) external view override returns (bool) {
        return true;
    }

    function isPlugAndPlay() external pure override returns (bool) {
        // Not plug and play because it requires initialization
        return false;
    }

    function name() public pure override returns (string memory) {
        return "Lockup";
    }
}