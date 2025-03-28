/**
 * Script to deploy corporate action modules (dividend and voting) for a token
 */

const { ethers } = require("hardhat");

async function main(tokenAddress) {
  console.log("Deploying Corporate Action Modules...");
  
  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer address: ${deployer.address}`);
  
  if (!tokenAddress) {
    console.error("Token address is required");
    process.exit(1);
  }
  
  console.log(`Target token address: ${tokenAddress}`);
  
  try {
    // Verify that the token exists
    const token = await ethers.getContractAt("Token", tokenAddress);
    const tokenName = await token.name();
    const tokenSymbol = await token.symbol();
    console.log(`Token verified: ${tokenName} (${tokenSymbol})`);
    
    // Deploy Dividend module
    console.log("Deploying Dividend module...");
    const DividendCheckpoint = await ethers.getContractFactory("DividendCheckpoint");
    const dividend = await DividendCheckpoint.deploy(tokenAddress);
    await dividend.deployed();
    console.log(`Dividend module deployed to: ${dividend.address}`);
    
    // Configure Dividend module
    console.log("Configuring Dividend module...");
    await dividend.setWallet(deployer.address);
    await dividend.addAgent(deployer.address);
    console.log("Dividend module configured");
    
    // Deploy Voting module
    console.log("Deploying Voting module...");
    const WeightedVoteCheckpoint = await ethers.getContractFactory("WeightedVoteCheckpoint");
    const voting = await WeightedVoteCheckpoint.deploy(tokenAddress);
    await voting.deployed();
    console.log(`Voting module deployed to: ${voting.address}`);
    
    // Configure Voting module
    console.log("Configuring Voting module...");
    await voting.setDefaultExemptedVoters([deployer.address]);
    await voting.addAgent(deployer.address);
    console.log("Voting module configured");
    
    console.log("\nCorporate Action Modules Deployment Complete");
    console.log(`Dividend module: ${dividend.address}`);
    console.log(`Voting module: ${voting.address}`);
    
    return {
      dividend: dividend.address,
      voting: voting.address
    };
  } catch (error) {
    console.error("Error deploying corporate action modules:", error);
    throw error;
  }
}

// Execute the script independently
if (require.main === module) {
  // Check if a token address was provided as a command line argument
  const tokenAddress = process.argv[2];
  
  if (!tokenAddress) {
    console.log("Usage: npx hardhat run scripts/deploy/deploy-corporate-action-modules.js --network <network> <tokenAddress>");
    process.exit(1);
  }
  
  main(tokenAddress)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = main;