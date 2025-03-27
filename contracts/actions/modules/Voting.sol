// SPDX-License-Identifier: GPL-3.0
/**
 * @title Voting Module contract
 * @dev Token-weighted voting contract with ranked-choice support for security tokens
 */
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../../token/IToken.sol";
import "../../roles/AgentRole.sol";

/**
 * @title Storage contract for voting functionality
 */
contract VotingStorage {
    // Ballot structure 
    struct Ballot {
        uint256 startTime;             // When voting starts
        uint256 endTime;               // When voting ends
        uint256 checkpointId;          // Token checkpoint ID for balance snapshot
        uint256 proposalCount;         // Number of proposals
        uint256 quorumPercentage;      // Required quorum (scaled by 10^16)
        bool isRankedChoice;           // Whether ballot uses RCV
        bool isActive;                 // Whether ballot is active
        uint256 totalVoters;           // Total number of voters
        uint256 totalSupply;           // Total supply at checkpoint
        
        // Voter data
        mapping(address => bool) voted;              // Whether address has voted
        mapping(address => bool) exempted;           // Addresses exempted from voting
        mapping(address => uint256) singleVote;      // Single vote selection (for non-RCV)
        mapping(address => uint256[]) rankedVotes;   // Ranked preferences (for RCV)
        mapping(address => uint256) voteWeight;      // Vote weight (token balance)
        
        // Results data
        mapping(uint256 => uint256) proposalVotes;   // Vote count per proposal
    }
    
    // Collection of all ballots
    Ballot[] public ballots;
    
    // Array of addresses excluded from all ballots by default
    address[] public defaultExempted;
    
    // Vote weight base units (for percentage calculations)
    uint256 internal constant PERCENT_BASE = 10**18;
}

/**
 * @title Weighted Vote Checkpoint contract
 * @dev Contract for managing token-weighted voting with ranked-choice support
 */
contract WeightedVoteCheckpoint is VotingStorage, Ownable, AgentRole {
    // Security token reference
    IToken public securityToken;
    
    // Paused state
    bool private _paused;
    
    // Permission constants
    bytes32 internal constant ADMIN = "ADMIN";
    
    // Events
    event BallotCreated(
        uint256 indexed ballotId,
        uint256 checkpointId,
        uint256 startTime,
        uint256 endTime,
        uint256 proposalCount,
        uint256 quorumPercentage,
        bool isRankedChoice
    );
    
    event VoteCast(
        address indexed voter,
        uint256 weight,
        uint256 indexed ballotId,
        uint256 proposalId
    );
    
    event VoteCastRanked(
        address indexed voter,
        uint256 weight,
        uint256 indexed ballotId,
        uint256[] preferences
    );
    
    event BallotStatusChanged(
        uint256 indexed ballotId,
        bool isActive
    );
    
    event ChangedBallotExemptedVotersList(
        uint256 indexed ballotId,
        address indexed voter,
        bool isExempted
    );
    
    /**
     * @notice Constructor for the voting contract
     * @param _securityToken Address of the security token
     */
    constructor(address _securityToken) {
        require(_securityToken != address(0), "Invalid security token address");
        securityToken = IToken(_securityToken);
        _paused = false;
    }
    
    /**
     * @dev Modifier to make a function callable only when the contract is not paused.
     */
    modifier whenNotPaused() {
        require(!_paused, "Contract is paused");
        _;
    }
    
    /**
     * @dev Modifier to make a function callable only when the contract is paused.
     */
    modifier whenPaused() {
        require(_paused, "Contract is not paused");
        _;
    }
    
    /**
     * @notice Modifier to restrict functions to only ADMIN role
     */
    modifier onlyAdmin() {
        require(isAgent(msg.sender) || msg.sender == owner(), "Only admin can call");
        _;
    }
    
    /**
     * @notice Pause the contract
     */
    function pause() external onlyAdmin {
        _paused = true;
    }
    
    /**
     * @notice Unpause the contract
     */
    function unpause() external onlyAdmin {
        _paused = false;
    }
    
    /**
     * @notice Check if the contract is paused
     * @return True if paused
     */
    function paused() external view returns (bool) {
        return _paused;
    }
    
    /**
     * @notice Creates a checkpoint on the token
     * @return The checkpoint ID
     */
    function createCheckpoint() public onlyAgent returns (uint256) {
        // Since we're not using actual token checkpoints, we return a dummy value
        return block.timestamp;
    }
    
    /**
     * @notice Creates a ballot with specified parameters
     * @param _duration Duration of the ballot in seconds
     * @param _proposalCount Number of proposals (minimum 2)
     * @param _quorumPercentage Quorum percentage required (0 < percentage <= 100%, scaled by 10^16)
     * @param _isRankedChoice Whether the ballot should use ranked-choice voting
     * @return The ID of the created ballot
     */
    function createBallot(
        uint256 _duration,
        uint256 _proposalCount,
        uint256 _quorumPercentage,
        bool _isRankedChoice
    ) external onlyAdmin whenNotPaused returns (uint256) {
        // Input validation
        require(_proposalCount >= 2, "Must have at least 2 proposals");
        require(_quorumPercentage > 0 && _quorumPercentage <= PERCENT_BASE, "Invalid quorum percentage");
        require(_duration > 0, "Duration must be positive");
        
        // Create checkpoint
        uint256 checkpointId = createCheckpoint();
        
        // Get current timestamp and calculate end time
        uint256 startTime = block.timestamp;
        uint256 endTime = startTime + _duration;
        
        return _createBallot(
            startTime,
            endTime,
            checkpointId,
            _proposalCount,
            _quorumPercentage,
            _isRankedChoice
        );
    }
    
    /**
     * @notice Creates a ballot with specified parameters and custom start time
     * @param _startTime When voting starts
     * @param _endTime When voting ends
     * @param _proposalCount Number of proposals (minimum 2)
     * @param _quorumPercentage Quorum percentage required (0 < percentage <= 100%, scaled by 10^16)
     * @param _isRankedChoice Whether the ballot should use ranked-choice voting
     * @return The ID of the created ballot
     */
    function createBallotWithStartTime(
        uint256 _startTime,
        uint256 _endTime,
        uint256 _proposalCount,
        uint256 _quorumPercentage,
        bool _isRankedChoice
    ) external onlyAdmin whenNotPaused returns (uint256) {
        // Input validation
        require(_proposalCount >= 2, "Must have at least 2 proposals");
        require(_quorumPercentage > 0 && _quorumPercentage <= PERCENT_BASE, "Invalid quorum percentage");
        require(_startTime >= block.timestamp, "Start time must be in the future");
        require(_endTime > _startTime, "End time must be after start time");
        
        // Create checkpoint
        uint256 checkpointId = createCheckpoint();
        
        return _createBallot(
            _startTime,
            _endTime,
            checkpointId,
            _proposalCount,
            _quorumPercentage,
            _isRankedChoice
        );
    }
    
    /**
     * @notice Internal function to create a ballot
     * @param _startTime When voting starts
     * @param _endTime When voting ends
     * @param _checkpointId Token checkpoint ID
     * @param _proposalCount Number of proposals
     * @param _quorumPercentage Quorum percentage required
     * @param _isRankedChoice Whether the ballot should use ranked-choice voting
     * @return The ID of the created ballot
     */
    function _createBallot(
        uint256 _startTime,
        uint256 _endTime,
        uint256 _checkpointId,
        uint256 _proposalCount,
        uint256 _quorumPercentage,
        bool _isRankedChoice
    ) internal returns (uint256) {
        // Create new ballot
        uint256 ballotId = ballots.length;
        ballots.push();
        Ballot storage ballot = ballots[ballotId];
        
        // Set ballot parameters
        ballot.startTime = _startTime;
        ballot.endTime = _endTime;
        ballot.checkpointId = _checkpointId;
        ballot.proposalCount = _proposalCount;
        ballot.quorumPercentage = _quorumPercentage;
        ballot.isRankedChoice = _isRankedChoice;
        ballot.isActive = true;
        ballot.totalSupply = securityToken.totalSupply();
        
        // Apply default exemptions
        for (uint256 i = 0; i < defaultExempted.length; i++) {
            ballot.exempted[defaultExempted[i]] = true;
        }
        
        // Emit event
        emit BallotCreated(
            ballotId,
            _checkpointId,
            _startTime,
            _endTime,
            _proposalCount,
            _quorumPercentage,
            _isRankedChoice
        );
        
        return ballotId;
    }
    
    /**
     * @notice Set default exempted addresses for all future ballots
     * @param _exemptedAddresses Array of addresses to exempt
     */
    function setDefaultExemptedVoters(address[] calldata _exemptedAddresses) external onlyAdmin {
        delete defaultExempted;
        for (uint256 i = 0; i < _exemptedAddresses.length; i++) {
            defaultExempted.push(_exemptedAddresses[i]);
        }
    }
    
    /**
     * @notice Exempt a voter from a specific ballot
     * @param _ballotId The ballot ID
     * @param _voter The voter address
     * @param _exempt Whether to exempt or unexempt
     */
    function exemptVoter(uint256 _ballotId, address _voter, bool _exempt) external onlyAdmin {
        require(_ballotId < ballots.length, "Invalid ballot ID");
        require(_voter != address(0), "Invalid voter address");
        
        Ballot storage ballot = ballots[_ballotId];
        require(block.timestamp < ballot.endTime, "Ballot has ended");
        
        ballot.exempted[_voter] = _exempt;
        
        emit ChangedBallotExemptedVotersList(_ballotId, _voter, _exempt);
    }
    
    /**
     * @notice Change the status of a ballot (active/inactive)
     * @param _ballotId The ballot ID
     * @param _isActive New status
     */
    function changeBallotStatus(uint256 _ballotId, bool _isActive) external onlyAdmin {
        require(_ballotId < ballots.length, "Invalid ballot ID");
        
        Ballot storage ballot = ballots[_ballotId];
        require(ballot.isActive != _isActive, "Status already set");
        
        ballot.isActive = _isActive;
        
        emit BallotStatusChanged(_ballotId, _isActive);
    }
    
    /**
     * @notice Cast a vote on a ballot (non-ranked)
     * @param _ballotId The ballot ID
     * @param _proposalId The proposal ID to vote for
     */
    function castVote(uint256 _ballotId, uint256 _proposalId) external whenNotPaused {
        require(_ballotId < ballots.length, "Invalid ballot ID");
        Ballot storage ballot = ballots[_ballotId];
        
        // Validate ballot state
        require(ballot.isActive, "Ballot is not active");
        require(block.timestamp >= ballot.startTime, "Voting has not started");
        require(block.timestamp < ballot.endTime, "Voting has ended");
        
        // Validate proposal
        require(_proposalId > 0 && _proposalId <= ballot.proposalCount, "Invalid proposal ID");
        
        // Check voter eligibility
        require(!ballot.voted[msg.sender], "Already voted");
        require(!ballot.exempted[msg.sender], "Voter is exempted");
        
        // Get voter's token balance at checkpoint
        uint256 weight = securityToken.balanceOf(msg.sender);
        require(weight > 0, "No voting weight");
        
        // Record vote
        ballot.voted[msg.sender] = true;
        ballot.singleVote[msg.sender] = _proposalId;
        ballot.voteWeight[msg.sender] = weight;
        ballot.proposalVotes[_proposalId] += weight;
        ballot.totalVoters++;
        
        emit VoteCast(msg.sender, weight, _ballotId, _proposalId);
    }
    
    /**
     * @notice Cast a ranked-choice vote on a ballot
     * @param _ballotId The ballot ID
     * @param _preferences Array of proposal IDs in order of preference
     */
    function castRankedVote(uint256 _ballotId, uint256[] calldata _preferences) external whenNotPaused {
        require(_ballotId < ballots.length, "Invalid ballot ID");
        Ballot storage ballot = ballots[_ballotId];
        
        // Validate ballot state
        require(ballot.isActive, "Ballot is not active");
        require(block.timestamp >= ballot.startTime, "Voting has not started");
        require(block.timestamp < ballot.endTime, "Voting has ended");
        require(ballot.isRankedChoice, "Ballot is not ranked-choice");
        
        // Check voter eligibility
        require(!ballot.voted[msg.sender], "Already voted");
        require(!ballot.exempted[msg.sender], "Voter is exempted");
        
        // Validate preferences
        require(_preferences.length > 0, "No preferences provided");
        require(_preferences.length <= ballot.proposalCount, "Too many preferences");
        
        // Check for duplicates and valid proposal IDs
        bool[] memory seen = new bool[](ballot.proposalCount + 1);
        for (uint256 i = 0; i < _preferences.length; i++) {
            uint256 proposalId = _preferences[i];
            require(proposalId > 0 && proposalId <= ballot.proposalCount, "Invalid proposal ID");
            require(!seen[proposalId], "Duplicate proposal in preferences");
            seen[proposalId] = true;
        }
        
        // Get voter's token balance at checkpoint
        uint256 weight = securityToken.balanceOf(msg.sender);
        require(weight > 0, "No voting weight");
        
        // Record vote
        ballot.voted[msg.sender] = true;
        ballot.rankedVotes[msg.sender] = _preferences;
        ballot.voteWeight[msg.sender] = weight;
        
        // For first-choice counting
        ballot.proposalVotes[_preferences[0]] += weight;
        ballot.totalVoters++;
        
        emit VoteCastRanked(msg.sender, weight, _ballotId, _preferences);
    }
    
    /**
     * @notice Get ballot results (non-ranked)
     * @param _ballotId The ballot ID
     * @return weights Array of vote weights per proposal
     * @return tiedProposals Array of tied winning proposals (if any)
     * @return winningProposal The winning proposal ID (0 if no winner)
     * @return success Whether quorum was reached
     * @return totalVoters Total number of voters
     */
    function getBallotResults(uint256 _ballotId) external view returns (
        uint256[] memory weights,
        uint256[] memory tiedProposals,
        uint256 winningProposal,
        bool success,
        uint256 totalVoters
    ) {
        require(_ballotId < ballots.length, "Invalid ballot ID");
        Ballot storage ballot = ballots[_ballotId];
        
        // For ranked-choice ballots, use the RCV calculation
        if (ballot.isRankedChoice && ballot.proposalCount > 2) {
            return getRankedChoiceResults(_ballotId);
        }
        
        // Initialize arrays
        weights = new uint256[](ballot.proposalCount + 1);
        
        // Calculate required quorum
        uint256 requiredQuorum = (ballot.totalSupply * ballot.quorumPercentage) / PERCENT_BASE;
        
        // Get vote weights for each proposal
        uint256 highestVotes = 0;
        uint256 totalVotesCast = 0;
        
        for (uint256 i = 1; i <= ballot.proposalCount; i++) {
            weights[i] = ballot.proposalVotes[i];
            totalVotesCast += weights[i];
            
            if (weights[i] > highestVotes) {
                highestVotes = weights[i];
            }
        }
        
        // Check if quorum was reached
        success = totalVotesCast >= requiredQuorum;
        
        // Find winning proposal(s)
        uint256[] memory tied = new uint256[](ballot.proposalCount);
        uint256 tiedCount = 0;
        
        for (uint256 i = 1; i <= ballot.proposalCount; i++) {
            if (weights[i] == highestVotes) {
                tied[tiedCount] = i;
                tiedCount++;
            }
        }
        
        // If there's only one with highest votes, it's the winner
        if (tiedCount == 1) {
            winningProposal = tied[0];
            tiedProposals = new uint256[](0);
        } else if (tiedCount > 1) {
            // There's a tie
            tiedProposals = new uint256[](tiedCount);
            for (uint256 i = 0; i < tiedCount; i++) {
                tiedProposals[i] = tied[i];
            }
            winningProposal = 0; // No single winner
        } else {
            // No votes cast
            tiedProposals = new uint256[](0);
            winningProposal = 0;
        }
        
        totalVoters = ballot.totalVoters;
        return (weights, tiedProposals, winningProposal, success, totalVoters);
    }
    
    /**
     * @notice Get ranked-choice ballot results
     * @param _ballotId The ballot ID
     * @return weights Array of vote weights per proposal
     * @return tiedProposals Array of tied winning proposals (if any)
     * @return winningProposal The winning proposal ID (0 if no winner)
     * @return success Whether quorum was reached
     * @return totalVoters Total number of voters
     */
    function getRankedChoiceResults(uint256 _ballotId) public view returns (
        uint256[] memory weights,
        uint256[] memory tiedProposals,
        uint256 winningProposal,
        bool success,
        uint256 totalVoters
    ) {
        require(_ballotId < ballots.length, "Invalid ballot ID");
        Ballot storage ballot = ballots[_ballotId];
        require(ballot.isRankedChoice, "Not a ranked-choice ballot");
        
        // Initialize arrays
        weights = new uint256[](ballot.proposalCount + 1);
        
        // Calculate required quorum
        uint256 requiredQuorum = (ballot.totalSupply * ballot.quorumPercentage) / PERCENT_BASE;
        
        // Get initial vote weights (first preferences)
        uint256 totalVotesCast = 0;
        for (uint256 i = 1; i <= ballot.proposalCount; i++) {
            weights[i] = ballot.proposalVotes[i];
            totalVotesCast += weights[i];
        }
        
        // Track eliminated proposals
        bool[] memory eliminated = new bool[](ballot.proposalCount + 1);
        uint256 remainingProposals = ballot.proposalCount;
        
        // Initialize result variables
        winningProposal = 0;
        success = false;
        
        // If no votes cast, return early
        if (totalVotesCast == 0) {
            return (weights, new uint256[](0), 0, false, ballot.totalVoters);
        }
        
        // Continue until we have a winner
        while (remainingProposals > 1) {
            // Find proposal with highest votes
            uint256 highestVotes = 0;
            uint256 highestProposal = 0;
            
            // Find proposal with lowest votes to eliminate
            uint256 lowestVotes = type(uint256).max;
            uint256[] memory lowestProposals = new uint256[](ballot.proposalCount);
            uint256 lowestCount = 0;
            
            for (uint256 i = 1; i <= ballot.proposalCount; i++) {
                if (!eliminated[i]) {
                    // Update highest
                    if (weights[i] > highestVotes) {
                        highestVotes = weights[i];
                        highestProposal = i;
                    }
                    
                    // Update lowest
                    if (weights[i] < lowestVotes) {
                        lowestVotes = weights[i];
                        lowestCount = 1;
                        lowestProposals[0] = i;
                    } else if (weights[i] == lowestVotes) {
                        lowestProposals[lowestCount] = i;
                        lowestCount++;
                    }
                }
            }
            
            // Check if we have a majority winner
            if (highestVotes > totalVotesCast / 2 || highestVotes >= requiredQuorum) {
                winningProposal = highestProposal;
                success = true;
                break;
            }
            
            // Eliminate the proposal with lowest votes
            // If there's a tie for elimination, eliminate the one with the lowest ID
            uint256 toEliminate = lowestProposals[0];
            eliminated[toEliminate] = true;
            remainingProposals--;
            
            // Redistribute votes from eliminated proposal
            for (uint256 v = 0; v < ballot.totalVoters; v++) {
                address voter = _getVoterByIndex(_ballotId, v);
                if (voter == address(0)) continue;
                
                uint256[] memory prefs = ballot.rankedVotes[voter];
                uint256 voterWeight = ballot.voteWeight[voter];
                
                // Skip if this voter didn't rank the eliminated proposal
                bool needsRedistribution = false;
                uint256 firstActiveChoice = 0;
                
                for (uint256 p = 0; p < prefs.length; p++) {
                    if (!eliminated[prefs[p]] && firstActiveChoice == 0) {
                        firstActiveChoice = prefs[p];
                    }
                    
                    if (prefs[p] == toEliminate && firstActiveChoice == prefs[p]) {
                        needsRedistribution = true;
                        break;
                    }
                }
                
                if (needsRedistribution) {
                    // Find next un-eliminated preference
                    for (uint256 p = 0; p < prefs.length; p++) {
                        if (prefs[p] == toEliminate) continue;
                        
                        if (!eliminated[prefs[p]]) {
                            // Redistribute to this preference
                            weights[prefs[p]] += voterWeight;
                            break;
                        }
                    }
                    
                    // Remove votes from eliminated proposal
                    weights[toEliminate] -= voterWeight;
                }
            }
        }
        
        // If we didn't find a winner and only one proposal remains, it's the winner
        if (winningProposal == 0 && remainingProposals == 1) {
            for (uint256 i = 1; i <= ballot.proposalCount; i++) {
                if (!eliminated[i]) {
                    winningProposal = i;
                    success = weights[i] >= requiredQuorum;
                    break;
                }
            }
        }
        
        // No tied proposals in RCV final result
        tiedProposals = new uint256[](0);
        
        totalVoters = ballot.totalVoters;
        return (weights, tiedProposals, winningProposal, success, totalVoters);
    }
    
    /**
     * @notice Helper function to get voter address by index
     * @param _ballotId The ballot ID
     * @param _index The index
     * @return The voter address
     */
    function _getVoterByIndex(uint256 _ballotId, uint256 _index) internal view returns (address) {
        // This is a simplified implementation - in production you'd 
        // need a way to track all voters for a ballot
        // For this implementation, we'll return address(0) as we don't store this mapping
        return address(0);
    }
    
    /**
     * @notice Get proposal selected by a voter
     * @param _ballotId The ballot ID
     * @param _voter The voter address
     * @return For non-RCV: the selected proposal ID (0 if not voted)
     * @return For RCV: array of ranked proposals (empty if not voted)
     */
    function getSelectedProposal(uint256 _ballotId, address _voter) external view returns (
        uint256,
        uint256[] memory
    ) {
        require(_ballotId < ballots.length, "Invalid ballot ID");
        Ballot storage ballot = ballots[_ballotId];
        
        if (!ballot.voted[_voter]) {
            return (0, new uint256[](0));
        }
        
        if (!ballot.isRankedChoice || ballot.proposalCount < 3) {
            return (ballot.singleVote[_voter], new uint256[](0));
        } else {
            return (0, ballot.rankedVotes[_voter]);
        }
    }
    
    /**
     * @notice Get details of a ballot
     * @param _ballotId The ballot ID
     * @return quorumPercentage Quorum percentage required
     * @return totalSupply Total token supply at checkpoint
     * @return checkpointId Checkpoint ID
     * @return startTime Start time of the ballot
     * @return endTime End time of the ballot
     * @return proposalCount Number of proposals
     * @return totalVoters Total number of voters
     * @return isActive Whether the ballot is active
     * @return isRankedChoice Whether the ballot uses ranked-choice voting
     */
    function getBallotDetails(uint256 _ballotId) external view returns (
        uint256 quorumPercentage,
        uint256 totalSupply,
        uint256 checkpointId,
        uint256 startTime,
        uint256 endTime,
        uint256 proposalCount,
        uint256 totalVoters,
        bool isActive,
        bool isRankedChoice
    ) {
        require(_ballotId < ballots.length, "Invalid ballot ID");
        Ballot storage ballot = ballots[_ballotId];
        
        return (
            ballot.quorumPercentage,
            ballot.totalSupply,
            ballot.checkpointId,
            ballot.startTime,
            ballot.endTime,
            ballot.proposalCount,
            ballot.totalVoters,
            ballot.isActive,
            ballot.isRankedChoice
        );
    }
    
    /**
     * @notice Get permissions of the contract
     * @return Array of permission flags
     */
    function getPermissions() external pure returns (bytes32[] memory) {
        bytes32[] memory permissions = new bytes32[](1);
        permissions[0] = ADMIN;
        return permissions;
    }
}
