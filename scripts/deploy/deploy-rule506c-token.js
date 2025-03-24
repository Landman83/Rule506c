const { ethers } = require("hardhat");
const deployTokenSuite = require("./deploy-token-suite");

async function main() {
  console.log("Deploying Rule 506c Compliant Token...");
  
  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer address: ${deployer.address}`);
  
  // Deploy a token with Rule 506c compliance
  const token = await deployTokenSuite(
    null, // gateway - Deploy a new one
    {
      name: "Rule 506c Token",
      symbol: "R506C",
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
  
  console.log("\nDeployment Instructions:");
  console.log("1. Use the Identity Registry to register verified investors");
  console.log("2. Use the Compliance contract to add lockup periods for investors if needed");
  console.log("3. Only verified investors will be able to send and receive tokens");
  console.log("4. Transfers will be restricted until lockup periods expire");
  
  return token;
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