/**
 * Script to deploy corporate action modules for an existing token
 * This script avoids size limitations by separating action module deployment
 */

const { ethers } = require("hardhat");

async function main(tokenAddressParam = null) {
  console.log("Deploying Corporate Action Modules for an existing token");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // Get the token address from parameter or command line argument
  const tokenAddress = tokenAddressParam || process.argv[2];
  
  if (!tokenAddress) {
    console.error("Error: Token address not provided");
    console.log("Usage: npx hardhat run scripts/deploy/deploy-action-modules-only.js --network <network> <tokenAddress>");
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
  console.log(`Dividend module: ${dividend.address}`);
  console.log(`Voting module: ${voting.address}`);
  
  console.log("\n== Usage Instructions ==");
  console.log("1. Use the Dividend module to distribute dividends to token holders:");
  console.log(`   - Create dividend: dividend.createDividend(maturity, expiry, tokenAddress, amount, name)`);
  console.log(`   - Claim dividend: dividend.pullDividendPayment(dividendIndex)`);
  
  console.log("2. Use the Voting module to create and manage votes:");
  console.log(`   - Create ballot: voting.createBallot(duration, proposalCount, quorumPercentage, isRankedChoice)`);
  console.log(`   - Cast vote: voting.castVote(ballotId, proposalId) or voting.castRankedVote(ballotId, preferences)`);
  console.log(`   - Get results: voting.getBallotResults(ballotId)`);
  
  return {
    token: tokenAddress,
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