/**
 * Script to deploy a Rule 506(c) token with corporate action modules (dividend and voting)
 */

const { ethers } = require("hardhat");
const deployTokenSuite = require("./deploy-token-suite");

async function main() {
  console.log("Deploying Rule 506(c) token with Corporate Action modules");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // Step 1: Deploy the token suite using deploy-token-suite.js
  console.log("\n== Step 1: Deploy Token Suite ==");
  
  // Deploy a token with Rule 506c compliance
  const token = await deployTokenSuite(
    null, // gateway - Deploy a new one
    {
      name: "Rule 506c Token with Actions",
      symbol: "R506CA",
      decimals: 18,
      owner: deployer.address  // Explicitly set the deployer as owner
    },
    {}, // Identity params - use defaults
    {
      complianceType: "modular" // Ensures modular compliance with KYC and Lockup modules
    }
  );
  
  console.log("Token suite deployment complete!");
  console.log(`Token address: ${token.token}`);
  
  // Step 2: Deploy the action modules
  console.log("\n== Step 2: Deploy Action Modules ==");
  
  // Deploy the dividend module
  console.log("Deploying dividend module...");
  const DividendFactory = await ethers.getContractFactory("DividendCheckpoint");
  const dividend = await DividendFactory.deploy(token.token);
  await dividend.deployed();
  console.log(`Dividend module deployed at: ${dividend.address}`);
  
  // Deploy the voting module
  console.log("Deploying voting module...");
  const VotingFactory = await ethers.getContractFactory("WeightedVoteCheckpoint");
  const voting = await VotingFactory.deploy(token.token);
  await voting.deployed();
  console.log(`Voting module deployed at: ${voting.address}`);
  
  // Step 3: Configure the action modules
  console.log("\n== Step 3: Configure Action Modules ==");
  
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
  
  // Deployment summary
  console.log("\n== Deployment Summary ==");
  console.log(`Token: ${token.token}`);
  console.log(`Token Identity: ${token.tokenIdentity}`);
  console.log(`Compliance: ${token.compliance}`);
  console.log(`Dividend module: ${dividend.address}`);
  console.log(`Voting module: ${voting.address}`);
  
  return {
    token: token.token,
    tokenIdentity: token.tokenIdentity,
    compliance: token.compliance,
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