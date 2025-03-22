const { ethers } = require("hardhat");
const OnchainID = require("@onchain-id/solidity");

async function main() {
  console.log("Deploying Simple TREX Token...");
  
  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer address: ${deployer.address}`);
  
  // Use the gateway we already deployed
  const gatewayAddress = "0x9A676e781A523b5d0C0e43731313A708CB607508";
  console.log(`Using Gateway at: ${gatewayAddress}`);
  
  // Use hardcoded implementation authority address from previous deployment
  const identityImplementationAuthorityAddress = "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318";
  
  // Deploy token identity
  console.log("Deploying token identity...");
  const tokenIdentity = await new ethers.ContractFactory(
    OnchainID.contracts.IdentityProxy.abi,
    OnchainID.contracts.IdentityProxy.bytecode,
    deployer
  ).deploy(identityImplementationAuthorityAddress, deployer.address);
  
  await tokenIdentity.deployed();
  console.log(`Token identity deployed to: ${tokenIdentity.address}`);
  
  // Use default compliance address from previous deployment
  const defaultComplianceAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  
  // Define token deployment details for the gateway
  const tokenDetails = {
    owner: deployer.address,
    name: "TREX Demo Token",
    symbol: "TDT",
    decimals: 18,
    irs: ethers.constants.AddressZero, // Deploy a new IRS
    ONCHAINID: tokenIdentity.address,
    irAgents: [deployer.address], // Add deployer as an IR agent
    tokenAgents: [deployer.address], // Add deployer as a token agent
    complianceModules: [],
    complianceSettings: []
  };
  
  // Prepare claim details
  const claimDetails = {
    claimTopics: [],
    issuers: [],
    issuerClaims: []
  };
  
  // Deploy the token suite through the gateway
  console.log("Deploying token suite via Gateway...");
  const gateway = await ethers.getContractAt("TREXGateway", gatewayAddress);
  
  // Check if the deployer is allowed to deploy
  const isDeployer = await gateway.isDeployer(deployer.address);
  const publicDeployment = await gateway.getPublicDeploymentStatus();
  
  if (!isDeployer && !publicDeployment) {
    console.log("Adding deployer to allowed list...");
    await gateway.addDeployer(deployer.address);
  }
  
  console.log("Deploying token through gateway...");
  const tx = await gateway.deployTREXSuite(tokenDetails, claimDetails);
  const receipt = await tx.wait();
  
  // Get the factory address
  const factoryAddress = await gateway.getFactory();
  console.log(`Getting token address from factory at ${factoryAddress}...`);
  
  // Get the token address from the factory
  const factory = await ethers.getContractAt("TREXFactory", factoryAddress);
  
  const salt = ethers.utils.solidityKeccak256(
    ["string"],
    [deployer.address.toLowerCase() + tokenDetails.name]
  );
  
  // For hardhat, we can use this simplified approach
  const salt2 = deployer.address.toLowerCase() + tokenDetails.name;
  const tokenAddress = await factory.getToken(salt2);
  
  console.log(`Token suite deployed!`);
  console.log(`Token address: ${tokenAddress}`);
  
  return {
    token: tokenAddress,
    tokenIdentity: tokenIdentity.address
  };
}

// Execute the script
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = main;