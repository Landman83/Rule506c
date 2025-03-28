/**
 * Deploy a standalone Action Service
 * 
 * This script deploys a ModularActions instance and its modules completely independently
 * of the token deployment process, avoiding contract size limitations.
 */

const { ethers } = require("hardhat");

async function main(tokenAddressParam = null) {
  console.log("=== Deploying Standalone Action Service ===");
  
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer address: ${deployer.address}`);
  
  // Get the token address from function parameter, task arguments, or command line
  let tokenAddress = tokenAddressParam;
  
  // Check if we're running as a Hardhat task and have arguments
  if (!tokenAddress && process.env.HARDHAT_NETWORK) {
    // Try to get from hardhat task arguments
    try {
      const taskArgs = require('hardhat').taskArguments;
      if (taskArgs && taskArgs.tokenAddress) {
        tokenAddress = taskArgs.tokenAddress;
      }
    } catch (e) {
      // Not running as a task with arguments
    }
  }
  
  // Last resort: check command line arguments
  if (!tokenAddress) {
    tokenAddress = process.argv[2];
  }
  
  if (!tokenAddress) {
    console.error("Error: Token address not provided");
    console.log("Usage: npx hardhat run scripts/deploy/deploy-action-service.js --network <network> -- <tokenAddress>");
    process.exit(1);
  }
  
  console.log(`Target token address: ${tokenAddress}`);
  
  // Verify token exists
  let tokenName, tokenSymbol;
  try {
    const token = await ethers.getContractAt("Token", tokenAddress);
    tokenName = await token.name();
    tokenSymbol = await token.symbol();
    console.log(`Token verified: ${tokenName} (${tokenSymbol})`);
  } catch (error) {
    console.error("Error verifying token:", error.message);
    process.exit(1);
  }

  // Deploy ModularActions directly (not via proxy to reduce complexity)
  console.log("\n== Deploying ModularActions Container ==");
  const MAFactory = await ethers.getContractFactory("ModularActions");
  const ma = await MAFactory.deploy();
  await ma.deployed();
  console.log(`ModularActions deployed at: ${ma.address}`);
  
  // Initialize ModularActions and bind token
  await ma.init();
  console.log("ModularActions initialized");
  
  await ma.bindToken(tokenAddress);
  console.log(`ModularActions bound to token: ${tokenAddress}`);
  
  // Deploy modules
  console.log("\n== Deploying Dividend Module ==");
  const DividendFactory = await ethers.getContractFactory("DividendCheckpoint");
  const dividend = await DividendFactory.deploy(tokenAddress);
  await dividend.deployed();
  console.log(`Dividend module deployed at: ${dividend.address}`);
  
  console.log("\n== Deploying Voting Module ==");
  const VotingFactory = await ethers.getContractFactory("WeightedVoteCheckpoint");
  const voting = await VotingFactory.deploy(tokenAddress);
  await voting.deployed();
  console.log(`Voting module deployed at: ${voting.address}`);
  
  // Bind modules to ModularActions
  console.log("\n== Binding Modules to ModularActions ==");
  await ma.addModule(dividend.address);
  console.log(`Dividend module bound at: ${dividend.address}`);
  
  await ma.addModule(voting.address);
  console.log(`Voting module bound at: ${voting.address}`);
  
  // Configure modules
  console.log("\n== Configuring Modules ==");
  
  // Configure dividend module
  console.log("Configuring dividend module...");
  await dividend.setWallet(deployer.address);
  await dividend.addAgent(deployer.address);
  console.log("Dividend module configured");
  
  // Configure voting module
  console.log("Configuring voting module...");
  await voting.setDefaultExemptedVoters([deployer.address]);
  await voting.addAgent(deployer.address);
  console.log("Voting module configured");
  
  console.log("\n== Deployment Summary ==");
  console.log(`Token: ${tokenAddress} (${tokenName} - ${tokenSymbol})`);
  console.log(`ModularActions: ${ma.address}`);
  console.log(`Dividend module: ${dividend.address}`);
  console.log(`Voting module: ${voting.address}`);
  
  console.log("\n== Usage Instructions ==");
  console.log("1. Set the token owner as agent on ModularActions:");
  console.log(`   ma.addAgent([TOKEN_OWNER_ADDRESS])`);
  
  console.log("2. Transfer ModularActions ownership to token owner:");
  console.log(`   ma.transferOwnership([TOKEN_OWNER_ADDRESS])`);
  
  console.log("3. Use the Dividend module to distribute dividends to token holders:");
  console.log(`   dividend.createDividend(maturity, expiry, tokenAddress, amount, name)`);
  console.log(`   dividend.pullDividendPayment(dividendIndex)`);
  
  console.log("4. Use the Voting module to create and manage votes:");
  console.log(`   voting.createBallot(duration, proposalCount, quorumPercentage, isRankedChoice)`);
  console.log(`   voting.castVote(ballotId, proposalId)`);
  console.log(`   voting.getBallotResults(ballotId)`);
  
  return {
    token: tokenAddress,
    modularActions: ma.address,
    dividend: dividend.address,
    voting: voting.address
  };
}

// Execute the script independently
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = main;