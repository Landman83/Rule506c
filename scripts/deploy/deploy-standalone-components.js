const { ethers } = require("hardhat");

async function deployTrustedIssuersRegistry(implementationAuthorityAddress) {
  console.log("Deploying standalone Trusted Issuers Registry...");
  
  const trustedIssuersRegistry = await ethers.deployContract(
    "TrustedIssuersRegistryProxy", 
    [implementationAuthorityAddress]
  );
  
  await trustedIssuersRegistry.deployed();
  console.log(`Trusted Issuers Registry deployed to: ${trustedIssuersRegistry.address}`);
  
  return trustedIssuersRegistry.address;
}

async function deployClaimTopicsRegistry(implementationAuthorityAddress) {
  console.log("Deploying standalone Claim Topics Registry...");
  
  const claimTopicsRegistry = await ethers.deployContract(
    "ClaimTopicsRegistryProxy", 
    [implementationAuthorityAddress]
  );
  
  await claimTopicsRegistry.deployed();
  console.log(`Claim Topics Registry deployed to: ${claimTopicsRegistry.address}`);
  
  return claimTopicsRegistry.address;
}

async function deployIdentityRegistryStorage(implementationAuthorityAddress) {
  console.log("Deploying standalone Identity Registry Storage...");
  
  const identityRegistryStorage = await ethers.deployContract(
    "IdentityRegistryStorageProxy", 
    [implementationAuthorityAddress]
  );
  
  await identityRegistryStorage.deployed();
  console.log(`Identity Registry Storage deployed to: ${identityRegistryStorage.address}`);
  
  return identityRegistryStorage.address;
}

async function deployIdentityRegistry(implementationAuthorityAddress, tirAddress, ctrAddress, irsAddress) {
  console.log("Deploying standalone Identity Registry...");
  
  const identityRegistry = await ethers.deployContract(
    "IdentityRegistryProxy", 
    [implementationAuthorityAddress, tirAddress, ctrAddress, irsAddress]
  );
  
  await identityRegistry.deployed();
  console.log(`Identity Registry deployed to: ${identityRegistry.address}`);
  
  // Bind the Identity Registry to the Identity Registry Storage
  const irs = await ethers.getContractAt("IdentityRegistryStorage", irsAddress);
  await irs.bindIdentityRegistry(identityRegistry.address);
  console.log(`Identity Registry bound to Identity Registry Storage`);
  
  return identityRegistry.address;
}

async function deployModularCompliance(implementationAuthorityAddress) {
  console.log("Deploying standalone Modular Compliance...");
  
  const modularCompliance = await ethers.deployContract(
    "ModularComplianceProxy", 
    [implementationAuthorityAddress]
  );
  
  await modularCompliance.deployed();
  console.log(`Modular Compliance deployed to: ${modularCompliance.address}`);
  
  // Initialize the Modular Compliance
  const mc = await ethers.getContractAt("ModularCompliance", modularCompliance.address);
  await mc.init();
  console.log(`Modular Compliance initialized`);
  
  return modularCompliance.address;
}

async function main(implementationAuthorityAddress) {
  if (!implementationAuthorityAddress) {
    throw new Error("Implementation Authority address is required");
  }
  
  console.log("Deploying standalone TREX components...");
  
  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer address: ${deployer.address}`);
  
  console.log(`Using Implementation Authority at: ${implementationAuthorityAddress}`);
  
  // Deploy all standalone components
  const tirAddress = await deployTrustedIssuersRegistry(implementationAuthorityAddress);
  const ctrAddress = await deployClaimTopicsRegistry(implementationAuthorityAddress);
  const irsAddress = await deployIdentityRegistryStorage(implementationAuthorityAddress);
  const irAddress = await deployIdentityRegistry(implementationAuthorityAddress, tirAddress, ctrAddress, irsAddress);
  const mcAddress = await deployModularCompliance(implementationAuthorityAddress);
  
  return {
    trustedIssuersRegistry: tirAddress,
    claimTopicsRegistry: ctrAddress,
    identityRegistryStorage: irsAddress,
    identityRegistry: irAddress,
    modularCompliance: mcAddress
  };
}

// Execute the script independently
if (require.main === module) {
  // Check if an Implementation Authority address was provided
  if (process.argv.length < 3) {
    console.error("Please provide an Implementation Authority address as a command line argument");
    process.exit(1);
  }
  
  const implementationAuthorityAddress = process.argv[2];
  
  main(implementationAuthorityAddress)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  main,
  deployTrustedIssuersRegistry,
  deployClaimTopicsRegistry,
  deployIdentityRegistryStorage,
  deployIdentityRegistry,
  deployModularCompliance
};