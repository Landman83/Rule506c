const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying TREX Compliance Modules...");
  
  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer address: ${deployer.address}`);
  
  // Deploy compliance modules
  console.log("Deploying basic compliance modules...");
  
  // Legacy Default Compliance (for simpler deployments)
  const defaultCompliance = await ethers.deployContract("DefaultCompliance");
  await defaultCompliance.deployed();
  console.log(`DefaultCompliance deployed to: ${defaultCompliance.address}`);
  
  // Skip individual compliance modules as they are abstract contracts
  // We'll only use DefaultCompliance for now
  
  // Return the deployed address for use in future scripts
  return {
    defaultCompliance: defaultCompliance.address
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