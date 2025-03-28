const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying TREX Implementation Authority...");
  
  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer address: ${deployer.address}`);
  
  // Deploy Implementation Authority as a reference contract
  // Parameters: isReference (true), factory (0x0), referenceContract (0x0)
  const trexImplementationAuthority = await ethers.deployContract(
    "TREXImplementationAuthority",
    [true, ethers.constants.AddressZero, ethers.constants.AddressZero]
  );
  
  await trexImplementationAuthority.deployed();
  console.log(`TREX Implementation Authority deployed to: ${trexImplementationAuthority.address}`);
  
  // Deploy all implementations
  console.log("Deploying implementations...");
  
  const tokenImplementation = await ethers.deployContract("Token");
  await tokenImplementation.deployed();
  console.log(`Token implementation: ${tokenImplementation.address}`);
  
  const claimTopicsRegistryImplementation = await ethers.deployContract("ClaimTopicsRegistry");
  await claimTopicsRegistryImplementation.deployed();
  console.log(`ClaimTopicsRegistry implementation: ${claimTopicsRegistryImplementation.address}`);
  
  const identityRegistryImplementation = await ethers.deployContract("IdentityRegistry");
  await identityRegistryImplementation.deployed();
  console.log(`IdentityRegistry implementation: ${identityRegistryImplementation.address}`);
  
  const identityRegistryStorageImplementation = await ethers.deployContract("IdentityRegistryStorage");
  await identityRegistryStorageImplementation.deployed();
  console.log(`IdentityRegistryStorage implementation: ${identityRegistryStorageImplementation.address}`);
  
  const trustedIssuersRegistryImplementation = await ethers.deployContract("TrustedIssuersRegistry");
  await trustedIssuersRegistryImplementation.deployed();
  console.log(`TrustedIssuersRegistry implementation: ${trustedIssuersRegistryImplementation.address}`);
  
  const modularComplianceImplementation = await ethers.deployContract("ModularCompliance");
  await modularComplianceImplementation.deployed();
  console.log(`ModularCompliance implementation: ${modularComplianceImplementation.address}`);
  
  const modularActionsImplementation = await ethers.deployContract("ModularActions");
  await modularActionsImplementation.deployed();
  console.log(`ModularActions implementation: ${modularActionsImplementation.address}`);
  
  // Register the implementations in the authority
  const versionStruct = {
    major: 4,
    minor: 0,
    patch: 0,
  };
  
  const contractsStruct = {
    tokenImplementation: tokenImplementation.address,
    ctrImplementation: claimTopicsRegistryImplementation.address,
    irImplementation: identityRegistryImplementation.address,
    irsImplementation: identityRegistryStorageImplementation.address,
    tirImplementation: trustedIssuersRegistryImplementation.address,
    mcImplementation: modularComplianceImplementation.address,
    maImplementation: modularActionsImplementation.address,
  };
  
  console.log("Adding version to Implementation Authority...");
  await trexImplementationAuthority.addAndUseTREXVersion(versionStruct, contractsStruct);
  console.log(`Added and set active version ${versionStruct.major}.${versionStruct.minor}.${versionStruct.patch}`);
  
  // Return all deployed addresses for use in future scripts
  return {
    trexImplementationAuthority: trexImplementationAuthority.address,
    tokenImplementation: tokenImplementation.address,
    claimTopicsRegistryImplementation: claimTopicsRegistryImplementation.address,
    identityRegistryImplementation: identityRegistryImplementation.address,
    identityRegistryStorageImplementation: identityRegistryStorageImplementation.address,
    trustedIssuersRegistryImplementation: trustedIssuersRegistryImplementation.address,
    modularComplianceImplementation: modularComplianceImplementation.address,
    modularActionsImplementation: modularActionsImplementation.address,
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