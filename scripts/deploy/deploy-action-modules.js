/**
 * Script to deploy and configure action modules (dividend and voting) for an existing token
 */

const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying and configuring corporate action modules");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // User inputs - replace these with actual values or make interactive
  const tokenAddress = process.argv[2]; // Pass token address as first argument
  
  if (!tokenAddress) {
    console.error("Error: Token address not provided. Please provide token address as an argument.");
    console.log("Usage: npx hardhat run scripts/deploy/deploy-action-modules.js --network <network> <tokenAddress>");
    process.exit(1);
  }
  
  console.log("Token address:", tokenAddress);
  
  // Create token contract instance
  const token = await ethers.getContractAt("Token", tokenAddress);
  
  // Get token details for verification
  const tokenName = await token.name();
  const tokenSymbol = await token.symbol();
  console.log(`Deploying action modules for token: ${tokenName} (${tokenSymbol})`);

  // Deploy dividend module
  console.log("Deploying dividend module...");
  const DividendFactory = await ethers.getContractFactory("DividendCheckpoint");
  const dividend = await DividendFactory.deploy(tokenAddress);
  await dividend.deployed();
  console.log("Dividend module deployed at:", dividend.address);

  // Deploy voting module
  console.log("Deploying voting module...");
  const VotingFactory = await ethers.getContractFactory("WeightedVoteCheckpoint");
  const voting = await VotingFactory.deploy(tokenAddress);
  await voting.deployed();
  console.log("Voting module deployed at:", voting.address);

  // Get token owner for permissions
  const owner = await token.owner();
  console.log("Token owner:", owner);
  
  // Configure modules
  console.log("Configuring dividend module...");
  // Set treasury wallet (using deployer address for demo)
  const tx1 = await dividend.setWallet(deployer.address);
  await tx1.wait();
  console.log("Dividend wallet set to deployer address");
  
  // Add agent permission
  const tx2 = await dividend.addAgent(deployer.address);
  await tx2.wait();
  console.log("Deployer added as agent to dividend module");
  
  // Configure voting module
  console.log("Configuring voting module...");
  // Set exempted voters (treasury usually shouldn't vote)
  const tx3 = await voting.setDefaultExemptedVoters([deployer.address]);
  await tx3.wait();
  console.log("Default exempted voters configured");
  
  // Add agent permission
  const tx4 = await voting.addAgent(deployer.address);
  await tx4.wait();
  console.log("Deployer added as agent to voting module");

  console.log("\nDeployment complete. Module addresses:");
  console.log("Dividend module:", dividend.address);
  console.log("Voting module:", voting.address);
  console.log("\nNext steps: Use these modules to manage dividends and voting for your token.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });