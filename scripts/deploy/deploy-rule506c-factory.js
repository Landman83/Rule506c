/**
 * Deploy a specialized Rule506c factory
 * This script deploys a slimmed-down factory without action modules integration
 * to avoid contract size limitations
 */

const { ethers } = require("hardhat");
const deployImplementationAuthority = require("./deploy-implementation-authority");
const deployComplianceModules = require("./deploy-compliance-modules");
const OnchainID = require("@onchain-id/solidity");

async function main(
  implementationAuthorityAddress = null,
  idFactoryAddress = null,
  complianceModulesAddresses = null
) {
  console.log("Deploying Rule506c Factory...");
  
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer address: ${deployer.address}`);
  
  // Deploy or use existing implementation authority
  let trexImplementationAuthorityAddress = implementationAuthorityAddress;
  let deployedIA;
  
  if (!trexImplementationAuthorityAddress) {
    console.log("No implementation authority address provided. Deploying a new one...");
    deployedIA = await deployImplementationAuthority();
    trexImplementationAuthorityAddress = deployedIA.trexImplementationAuthority;
    console.log(`Using Implementation Authority at: ${trexImplementationAuthorityAddress}`);
  } else {
    console.log(`Using provided Implementation Authority at: ${trexImplementationAuthorityAddress}`);
  }
  
  // Double-check that we have a valid address
  if (!trexImplementationAuthorityAddress) {
    console.error("CRITICAL ERROR: Implementation Authority address is undefined!");
    throw new Error("Implementation Authority address is undefined");
  }
  
  // Use IdFactory if provided, otherwise deploy a new one
  let identityFactoryAddress = idFactoryAddress;
  
  if (!identityFactoryAddress) {
    console.log("No identity factory address provided. Deploying a new one...");
    
    // Deploy Identity Implementation
    console.log("Deploying Identity Implementation...");
    const identityImplementation = await new ethers.ContractFactory(
      OnchainID.contracts.Identity.abi,
      OnchainID.contracts.Identity.bytecode,
      deployer
    ).deploy(deployer.address, true);
    
    await identityImplementation.deployed();
    console.log(`Identity Implementation deployed to: ${identityImplementation.address}`);
    
    // Deploy Identity Implementation Authority
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
    identityFactoryAddress = identityFactory.address;
    
    // Make sure to register factory address with IdFactory
    console.log("Adding Rule506c Factory to Identity Factory's allowed factories...");
    // Deploy a temporary factory to get added to the IdFactory's authorized factories list
    const tmpFactory = await ethers.deployContract("Rule506cFactory", [
      trexImplementationAuthorityAddress, 
      identityFactoryAddress
    ]);
    await tmpFactory.deployed();
    await identityFactory.addTokenFactory(tmpFactory.address);
    console.log(`Authorized factory address: ${tmpFactory.address}`);
  }
  
  console.log(`Using Identity Factory at: ${identityFactoryAddress}`);
  
  // Deploy compliance modules if not provided
  let complianceModules = complianceModulesAddresses;
  if (!complianceModules) {
    console.log("Deploying compliance modules for Rule 506c...");
    complianceModules = await deployComplianceModules();
    console.log(`KYC module deployed at: ${complianceModules.kycModule}`);
    console.log(`Lockup module deployed at: ${complianceModules.lockupModule}`);
  }
  
  // Deploy the Rule506c Factory
  console.log("Deploying Rule506c Factory...");
  const Rule506cFactory = await ethers.getContractFactory("Rule506cFactory");
  const factory = await Rule506cFactory.deploy(
    trexImplementationAuthorityAddress,
    identityFactoryAddress
  );
  
  // Now we need to add our actual factory to the IdFactory
  const identityFactory = await ethers.getContractAt(
    OnchainID.contracts.Factory.abi,
    identityFactoryAddress
  );
  await identityFactory.addTokenFactory(factory.address);
  console.log(`Added Rule506c Factory to Identity Factory's token factories`);
  
  await factory.deployed();
  console.log(`Rule506c Factory deployed to: ${factory.address}`);
  
  const result = {
    rule506cFactory: factory.address,
    implementationAuthority: trexImplementationAuthorityAddress,
    idFactory: identityFactoryAddress,
    kycModule: complianceModules.kycModule,
    lockupModule: complianceModules.lockupModule
  };
  
  console.log("Factory deployment result:", JSON.stringify(result, null, 2));
  return result;
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