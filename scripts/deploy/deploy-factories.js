const { ethers } = require("hardhat");
const OnchainID = require("@onchain-id/solidity");
const deployImplementationAuthority = require("./deploy-implementation-authority");

async function main(implementationAuthorityAddress = null) {
  console.log("Deploying TREX Factories...");
  
  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer address: ${deployer.address}`);
  
  // Use provided implementation authority address or deploy a new one
  let trexImplementationAuthorityAddress = implementationAuthorityAddress;
  
  if (!trexImplementationAuthorityAddress) {
    console.log("No implementation authority address provided. Deploying a new one...");
    const deployedContracts = await deployImplementationAuthority();
    trexImplementationAuthorityAddress = deployedContracts.trexImplementationAuthority;
  }

  console.log(`Using Implementation Authority at: ${trexImplementationAuthorityAddress}`);
  
  // Deploy Identity Implementation and Authority for OnchainID
  console.log("Deploying Identity Implementation...");
  const identityImplementation = await new ethers.ContractFactory(
    OnchainID.contracts.Identity.abi,
    OnchainID.contracts.Identity.bytecode,
    deployer
  ).deploy(deployer.address, true);
  
  await identityImplementation.deployed();
  console.log(`Identity Implementation deployed to: ${identityImplementation.address}`);
  
  console.log("Deploying Identity Implementation Authority...");
  const identityImplementationAuthority = await new ethers.ContractFactory(
    OnchainID.contracts.ImplementationAuthority.abi,
    OnchainID.contracts.ImplementationAuthority.bytecode,
    deployer
  ).deploy(identityImplementation.address);
  
  await identityImplementationAuthority.deployed();
  console.log(`Identity Implementation Authority deployed to: ${identityImplementationAuthority.address}`);
  
  // Deploy Identity Factory
  console.log("Deploying Identity Factory...");
  const identityFactory = await new ethers.ContractFactory(
    OnchainID.contracts.Factory.abi,
    OnchainID.contracts.Factory.bytecode,
    deployer
  ).deploy(identityImplementationAuthority.address);
  
  await identityFactory.deployed();
  console.log(`Identity Factory deployed to: ${identityFactory.address}`);
  
  // Deploy TREX Factory
  console.log("Deploying TREX Factory...");
  const trexFactory = await ethers.deployContract(
    "TREXFactory",
    [trexImplementationAuthorityAddress, identityFactory.address]
  );
  
  await trexFactory.deployed();
  console.log(`TREX Factory deployed to: ${trexFactory.address}`);
  
  // Connect the factories
  console.log("Connecting factories...");
  
  // Add TREXFactory to Identity Factory's token factories
  await identityFactory.addTokenFactory(trexFactory.address);
  console.log(`Added TREX Factory to Identity Factory's token factories`);
  
  // Set Identity Factory in TREXImplementationAuthority
  const trexImplementationAuthority = await ethers.getContractAt(
    "TREXImplementationAuthority", 
    trexImplementationAuthorityAddress
  );
  
  await trexImplementationAuthority.setTREXFactory(trexFactory.address);
  console.log(`Set TREX Factory in Implementation Authority`);
  
  return {
    identityImplementation: identityImplementation.address,
    identityImplementationAuthority: identityImplementationAuthority.address,
    identityFactory: identityFactory.address,
    trexFactory: trexFactory.address,
    trexImplementationAuthority: trexImplementationAuthorityAddress
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