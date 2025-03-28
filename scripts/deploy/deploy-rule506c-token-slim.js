/**
 * Deploy a Rule 506c compliant token using the specialized Rule506cFactory
 * This approach avoids contract size limitations by using a slimmer factory
 */

const { ethers } = require("hardhat");
const deployRule506cFactory = require("./deploy-rule506c-factory");

async function main(
  factoryAddress = null,
  tokenParams = {
    name: "Rule 506c Token",
    symbol: "R506C",
    decimals: 18,
    owner: null  // Will default to deployer
  }
) {
  console.log("Deploying Rule 506c Compliant Token (Slim Version)...");
  
  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer address: ${deployer.address}`);
  
  // Default the token owner to the deployer if not specified
  if (!tokenParams.owner) {
    tokenParams.owner = deployer.address;
  }
  
  // Use provided factory or deploy a new one
  let rule506cFactoryAddress = factoryAddress;
  let kycModule, lockupModule;
  
  if (!rule506cFactoryAddress) {
    console.log("No factory address provided. Deploying a new Rule506c factory...");
    const factoryDeployment = await deployRule506cFactory();
    
    // Log the factory deployment result for debugging
    console.log("Factory deployment result:", JSON.stringify(factoryDeployment, null, 2));
    
    rule506cFactoryAddress = factoryDeployment.rule506cFactory;
    kycModule = factoryDeployment.kycModule;
    lockupModule = factoryDeployment.lockupModule;
  } else {
    // If we're using an existing factory, deploy compliance modules separately
    console.log("Deploying compliance modules...");
    const complianceModules = await require("./deploy-compliance-modules")();
    kycModule = complianceModules.kycModule;
    lockupModule = complianceModules.lockupModule;
  }
  
  console.log(`Using Rule506c Factory at: ${rule506cFactoryAddress}`);
  console.log(`Using KYC module: ${kycModule}`);
  console.log(`Using Lockup module: ${lockupModule}`);
  
  // Create a salt for deterministic address
  const salt = `${tokenParams.owner.toLowerCase()}${tokenParams.name}`;
  console.log(`Using salt for deployment: ${salt}`);
  
  console.log(`Using KYC module: ${kycModule}`);
  console.log(`Using Lockup module: ${lockupModule}`);
  
  // Deploy the token through the factory
  console.log("Deploying token through Rule506c Factory...");
  const factory = await ethers.getContractAt("Rule506cFactory", rule506cFactoryAddress);
  
  let deployTx;
  try {
    console.log("Deployment parameters:");
    console.log(`Salt: ${salt}`);
    console.log(`Name: ${tokenParams.name}`);
    console.log(`Symbol: ${tokenParams.symbol}`);
    console.log(`Decimals: ${tokenParams.decimals}`);
    console.log(`Owner: ${tokenParams.owner}`);
    console.log(`Compliance modules: ${[kycModule, lockupModule]}`);
    
    // Get gas estimate to see if it's a gas issue
    console.log("Estimating gas...");
    const gasEstimate = await factory.estimateGas.deployRule506cToken(
      salt,
      tokenParams.name,
      tokenParams.symbol,
      tokenParams.decimals,
      tokenParams.owner,
      [kycModule, lockupModule]
    );
    console.log(`Gas estimate: ${gasEstimate}`);
    
    deployTx = await factory.deployRule506cToken(
      salt,
      tokenParams.name,
      tokenParams.symbol,
      tokenParams.decimals,
      tokenParams.owner,
      [kycModule, lockupModule], // Add the compliance modules
      {
        gasLimit: Math.ceil(gasEstimate.toNumber() * 1.2) // Add 20% buffer
      }
    );
    
    console.log("Transaction sent, hash:", deployTx.hash);
  } catch (error) {
    console.error("Error deploying token:", error);
    // Try to get more details from the error
    if (error.error && error.error.message) {
      console.error("Detailed error:", error.error.message);
    }
    throw error;
  }
  
  // Wait for the transaction to be mined
  console.log("Waiting for transaction to be mined...");
  await deployTx.wait();
  
  // Get the token address from the factory
  console.log("Retrieving token address from factory...");
  const tokenAddress = await factory.getToken(salt);
  console.log(`Token deployed at: ${tokenAddress}`);
  
  // Get token information
  const token = await ethers.getContractAt("Token", tokenAddress);
  const irAddress = await token.identityRegistry();
  const complianceAddress = await token.compliance();
  const tokenOnchainId = await token.onchainID();
  
  console.log(`Token name: ${await token.name()}`);
  console.log(`Token symbol: ${await token.symbol()}`);
  console.log(`Token decimals: ${await token.decimals()}`);
  console.log(`Token owner: ${await token.owner()}`);
  console.log(`Token identity registry: ${irAddress}`);
  console.log(`Token compliance: ${complianceAddress}`);
  console.log(`Token onchain ID: ${tokenOnchainId}`);
  
  return {
    token: tokenAddress,
    tokenIdentity: tokenOnchainId,
    compliance: complianceAddress,
    identityRegistry: irAddress,
    factory: rule506cFactoryAddress
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