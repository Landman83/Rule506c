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
  
  // Deploy Rule 506c compliance modules (KYC and Lockup)
  console.log("Deploying Rule 506c compliance modules...");
  
  // Deploy KYC module
  console.log("Deploying KYC module...");
  const kycModule = await ethers.deployContract("KYC");
  await kycModule.deployed();
  console.log(`KYC module deployed to: ${kycModule.address}`);
  
  // Initialize KYC module
  console.log("Initializing KYC module...");
  try {
    await kycModule.initialize();
    console.log("KYC module initialized");
  } catch (error) {
    if (error.message.includes("Initializable: contract is already initialized")) {
      console.log("KYC module already initialized, continuing...");
    } else {
      throw error;
    }
  }
  
  // Deploy Lockup module
  console.log("Deploying Lockup module...");
  const lockupModule = await ethers.deployContract("Lockup");
  await lockupModule.deployed();
  console.log(`Lockup module deployed to: ${lockupModule.address}`);
  
  // Initialize Lockup module
  console.log("Initializing Lockup module...");
  try {
    await lockupModule.initialize();
    console.log("Lockup module initialized");
  } catch (error) {
    if (error.message.includes("Initializable: contract is already initialized")) {
      console.log("Lockup module already initialized, continuing...");
    } else {
      throw error;
    }
  }
  
  // Return the deployed addresses for use in future scripts
  return {
    defaultCompliance: defaultCompliance.address,
    kycModule: kycModule.address,
    lockupModule: lockupModule.address
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