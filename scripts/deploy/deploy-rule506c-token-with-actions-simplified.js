const { ethers } = require("hardhat");
const deployTokenSuite = require("./deploy-token-suite");

async function main() {
  console.log("Deploying Rule 506c Token with Corporate Action Modules...");
  
  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer address: ${deployer.address}`);
  
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
  
  console.log(`Rule 506c Compliant Token suite deployed!`);
  console.log(`Token address: ${token.token}`);
  console.log(`Token Identity address: ${token.tokenIdentity}`);
  console.log(`Compliance address: ${token.compliance}`);
  
  // Now deploy and configure the action modules
  console.log("\nDeploying action modules...");
  
  // Deploy DividendCheckpoint module
  const DividendFactory = await ethers.getContractFactory("DividendCheckpoint");
  const dividend = await DividendFactory.deploy(token.token);
  await dividend.deployed();
  console.log(`Dividend module deployed to: ${dividend.address}`);
  
  // Configure dividend module
  await dividend.setWallet(deployer.address);
  await dividend.addAgent(deployer.address);
  console.log("Dividend module configured");
  
  // Deploy Voting module
  const VotingFactory = await ethers.getContractFactory("WeightedVoteCheckpoint");
  const voting = await VotingFactory.deploy(token.token);
  await voting.deployed();
  console.log(`Voting module deployed to: ${voting.address}`);
  
  // Configure voting module
  await voting.setDefaultExemptedVoters([deployer.address]);
  await voting.addAgent(deployer.address);
  console.log("Voting module configured");
  
  console.log("\nToken and Modules Deployment Complete");
  console.log("Token address:", token.token);
  console.log("Dividend module:", dividend.address);
  console.log("Voting module:", voting.address);
  
  console.log("\nDeployment Instructions:");
  console.log("1. Use the Identity Registry to register verified investors");
  console.log("2. Use the Compliance contract to add lockup periods for investors if needed");
  console.log("3. Use the Dividend module to distribute dividends to token holders");
  console.log("4. Use the Voting module to create ballots for governance decisions");
  
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