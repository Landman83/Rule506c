const { ethers } = require("hardhat");
const deployFactories = require("./deploy-factories");

async function main(factoryAddress = null, publicDeployment = false) {
  console.log("Deploying TREX Gateway...");
  
  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer address: ${deployer.address}`);
  
  // Use provided factory address or deploy a new factory stack
  let trexFactoryAddress = factoryAddress;
  
  if (!trexFactoryAddress) {
    console.log("No factory address provided. Deploying a new factory stack...");
    const deployedContracts = await deployFactories();
    trexFactoryAddress = deployedContracts.trexFactory;
  }

  console.log(`Using TREX Factory at: ${trexFactoryAddress}`);
  
  // Deploy TREX Gateway
  console.log(`Deploying TREX Gateway with public deployment ${publicDeployment ? 'enabled' : 'disabled'}...`);
  const trexGateway = await ethers.deployContract(
    "TREXGateway",
    [trexFactoryAddress, publicDeployment]
  );
  
  await trexGateway.deployed();
  console.log(`TREX Gateway deployed to: ${trexGateway.address}`);
  
  // Transfer factory ownership to gateway
  console.log("Transferring factory ownership to gateway...");
  const trexFactory = await ethers.getContractAt("TREXFactory", trexFactoryAddress);
  
  if (await trexFactory.owner() === deployer.address) {
    await trexFactory.transferOwnership(trexGateway.address);
    console.log("Factory ownership transferred to Gateway successfully");
  } else {
    console.log("WARNING: Factory ownership not transferred - deployer is not the current owner");
  }
  
  // Add deployer as an approved deployer (for private deployment)
  if (!publicDeployment) {
    console.log("Adding deployer as approved deployer in Gateway...");
    await trexGateway.addDeployer(deployer.address);
    console.log(`Added ${deployer.address} as approved deployer`);
  }
  
  return {
    trexGateway: trexGateway.address,
    trexFactory: trexFactoryAddress,
    publicDeployment: publicDeployment
  };
}

// Execute the script independently
if (require.main === module) {
  // By default, deploy with publicDeployment = false (private deployment)
  main(null, false)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = main;