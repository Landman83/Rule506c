const { ethers } = require("hardhat");
const deployGateway = require("./deploy-gateway");
const deployComplianceModules = require("./deploy-compliance-modules");
const { deployTrustedIssuersRegistry, deployClaimTopicsRegistry } = require("./deploy-standalone-components");
const OnchainID = require("@onchain-id/solidity");

async function deployIdentity(implementationAuthority, owner) {
  console.log(`Deploying identity for owner ${owner}...`);
  
  const identity = await new ethers.ContractFactory(
    OnchainID.contracts.IdentityProxy.abi,
    OnchainID.contracts.IdentityProxy.bytecode,
    (await ethers.getSigners())[0]
  ).deploy(implementationAuthority, owner);
  
  await identity.deployed();
  console.log(`Identity deployed to: ${identity.address}`);
  
  return identity.address;
}

async function main(
  gatewayAddress = null,
  tokenParams = {
    name: "TREX Token",
    symbol: "TREX",
    decimals: 18,
    owner: null
  },
  identityParams = {
    implementationAuthorityAddress: null
  },
  complianceParams = {
    complianceType: "modular", // Default to modular compliance for Rule 506c
    modules: [],
    moduleSettings: []
  }
) {
  console.log("Deploying TREX Token Suite...");
  
  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer address: ${deployer.address}`);
  
  // Default the token owner to the deployer if not specified
  if (!tokenParams.owner) {
    tokenParams.owner = deployer.address;
  }
  
  // Use provided gateway address or deploy a new one (which also deploys the full stack)
  let gatewayContractAddress = gatewayAddress;
  let factoryAddress;
  let trexImplementationAuthorityAddress;
  let identityImplementationAuthorityAddress;
  
  if (!gatewayContractAddress) {
    console.log("No gateway address provided. Deploying a new gateway and factory stack...");
    const gatewayDeployment = await deployGateway();
    gatewayContractAddress = gatewayDeployment.trexGateway;
    factoryAddress = gatewayDeployment.trexFactory;
    
    // Get the implementation authority addresses from factory
    const trexFactory = await ethers.getContractAt("TREXFactory", factoryAddress);
    trexImplementationAuthorityAddress = await trexFactory.getImplementationAuthority();
    
    const identityFactoryAddress = await trexFactory.getIdFactory();
    // The IdFactory doesn't expose implementationAuthority as a getter function
    // Since we're deploying our own identity directly using deployIdentity function,
    // we can get the OID implementation authority from our previous deployment or use a hardcoded value
    identityImplementationAuthorityAddress = "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318"; // Hardcoded from previous deployment
  } else {
    console.log(`Using Gateway at: ${gatewayContractAddress}`);
    const gateway = await ethers.getContractAt("TREXGateway", gatewayContractAddress);
    factoryAddress = await gateway.getFactory();
    console.log(`Gateway is using Factory at: ${factoryAddress}`);
    
    const trexFactory = await ethers.getContractAt("TREXFactory", factoryAddress);
    trexImplementationAuthorityAddress = await trexFactory.getImplementationAuthority();
    
    const identityFactoryAddress = await trexFactory.getIdFactory();
    // The IdFactory doesn't expose implementationAuthority as a getter function
    // Use the same hardcoded value as before
    identityImplementationAuthorityAddress = "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318"; // Hardcoded from previous deployment
  }
  
  // Overwrite identity implementation authority if provided
  if (identityParams.implementationAuthorityAddress) {
    identityImplementationAuthorityAddress = identityParams.implementationAuthorityAddress;
  }
  
  console.log(`Using TREX Implementation Authority at: ${trexImplementationAuthorityAddress}`);
  console.log(`Using Identity Implementation Authority at: ${identityImplementationAuthorityAddress}`);
  
  // Deploy token identity
  const tokenIdentityAddress = await deployIdentity(
    identityImplementationAuthorityAddress,
    tokenParams.owner
  );
  
  // Determine compliance
  let complianceAddress;
  let complianceModulesAddresses = [];
  let complianceSettingsData = [];
  
  if (complianceParams.complianceType === "default") {
    // Deploy DefaultCompliance
    console.log("Deploying DefaultCompliance...");
    const modules = await deployComplianceModules();
    complianceAddress = modules.defaultCompliance;
  } else {
    // Use modular compliance approach with Rule 506c modules (KYC and Lockup)
    console.log("Setting up Rule 506c Modular Compliance with KYC and Lockup modules...");
    
    // Deploy Modular Compliance
    const modularCompliance = await ethers.deployContract(
      "ModularComplianceProxy",
      [trexImplementationAuthorityAddress]
    );
    await modularCompliance.deployed();
    console.log(`ModularCompliance deployed to: ${modularCompliance.address}`);
    
    // Initialize the Modular Compliance
    try {
      const mc = await ethers.getContractAt("ModularCompliance", modularCompliance.address);
      await mc.init();
      console.log(`ModularCompliance initialized`);
    } catch (error) {
      // If already initialized, just continue
      if (error.message.includes("Initializable: contract is already initialized")) {
        console.log("ModularCompliance already initialized, continuing...");
      } else {
        throw error;
      }
    }
    
    complianceAddress = modularCompliance.address;
    
    // Deploy or use existing compliance modules
    if (!complianceParams.modules || complianceParams.modules.length === 0) {
      // Deploy compliance modules
      console.log("Deploying Rule 506c compliance modules...");
      const modules = await deployComplianceModules();
      
      // Add modules to the list
      complianceModulesAddresses = [modules.kycModule, modules.lockupModule];
      console.log(`Using KYC module at: ${modules.kycModule}`);
      console.log(`Using Lockup module at: ${modules.lockupModule}`);
      
      // Prepare module initialization calls
      const iface = new ethers.utils.Interface(['function initializeModule(address)']);
      
      // Our initialization calls will be sent after token deployment
      complianceSettingsData = [
        iface.encodeFunctionData('initializeModule', [complianceAddress]),
        iface.encodeFunctionData('initializeModule', [complianceAddress])
      ];
    } else {
      // Use provided modules
      console.log("Using provided compliance modules");
      complianceModulesAddresses = complianceParams.modules;
      complianceSettingsData = complianceParams.moduleSettings || [];
    }
  }
  
  // Define token deployment details for the gateway
  const tokenDetails = {
    owner: tokenParams.owner,
    name: tokenParams.name,
    symbol: tokenParams.symbol,
    decimals: tokenParams.decimals,
    irs: ethers.constants.AddressZero, // Deploy a new IRS
    ONCHAINID: tokenIdentityAddress,
    irAgents: [deployer.address], // Add deployer as an IR agent
    tokenAgents: [deployer.address], // Add deployer as a token agent
    complianceModules: complianceModulesAddresses,
    complianceSettings: complianceSettingsData
  };
  
  // Prepare claim details
  const claimDetails = {
    claimTopics: [],
    issuers: [],
    issuerClaims: []
  };
  
  // Deploy the token suite through the gateway
  console.log("Deploying token suite via Gateway...");
  console.log("Token details:", JSON.stringify(tokenDetails, null, 2));
  console.log("Claim details:", JSON.stringify(claimDetails, null, 2));
  
  const gateway = await ethers.getContractAt("TREXGateway", gatewayContractAddress);
  
  // Check if the deployer is allowed to deploy
  const isDeployer = await gateway.isDeployer(deployer.address);
  const publicDeployment = await gateway.getPublicDeploymentStatus();
  console.log(`Deployer allowed: ${isDeployer}, Public deployment enabled: ${publicDeployment}`);
  
  if (!isDeployer && !publicDeployment) {
    throw new Error("Deployer is not authorized to deploy tokens");
  }
  
  console.log("Calculating salt for token deployment...");
  // The salt used by the gateway (from TREXGateway.sol line 358)
  // string memory _salt = string(abi.encodePacked(Strings.toHexString(_tokenDetails.owner), _tokenDetails.name));
  const salt = tokenParams.owner.toLowerCase() + tokenParams.name;
  console.log(`Salt used for token deployment: ${salt}`);
  
  // Deploy the token suite
  console.log("Sending deployTREXSuite transaction to gateway...");
  const tx = await gateway.deployTREXSuite(tokenDetails, claimDetails);
  console.log("Transaction sent, waiting for receipt...");
  console.log("Transaction hash:", tx.hash);
  const receipt = await tx.wait();
  console.log("Transaction mined!");
  
  // Extract token address from event logs
  console.log("All events from receipt:", receipt.events.map(e => e.event || "Anonymous Event"));
  
  const deploymentProcessedEvent = receipt.events.find(
    (event) => event.event === "GatewaySuiteDeploymentProcessed"
  );
  
  if (deploymentProcessedEvent) {
    console.log("Found GatewaySuiteDeploymentProcessed event:", deploymentProcessedEvent.args);
  } else {
    console.log("No GatewaySuiteDeploymentProcessed event found. Looking for other relevant events...");
    
    // Check for TREXSuiteDeployed event from factory
    const factoryEvents = receipt.events.filter(
      (event) => {
        try {
          return event.event === "TREXSuiteDeployed";
        } catch (e) {
          return false;
        }
      }
    );
    
    if (factoryEvents.length > 0) {
      console.log("Found TREXSuiteDeployed event(s):", factoryEvents.map(e => e.args));
    }
    
    // Check for Deployed events (from create2 deployments)
    const deployedEvents = receipt.events.filter(
      (event) => {
        try {
          return event.event === "Deployed";
        } catch (e) {
          return false;
        }
      }
    );
    
    if (deployedEvents.length > 0) {
      console.log("Found Deployed event(s):", deployedEvents.map(e => e.args));
    }
  }
  
  // Get the token address from the factory
  const factory = await ethers.getContractAt("TREXFactory", factoryAddress);
  
  // Get the token address from the factory
  console.log("Retrieving token address from factory...");
  
  // The TREXGateway uses lowercase owner address for the salt
  const tokenSalt = tokenParams.owner.toLowerCase() + tokenParams.name;
  const tokenAddress = await factory.getToken(tokenSalt);
  console.log(`Retrieved token address: ${tokenAddress}`);
  
  console.log(`Token suite deployed!`);
  console.log(`Token address: ${tokenAddress}`);
  
  // Return the deployed token address and related contracts
  return {
    token: tokenAddress,
    tokenIdentity: tokenIdentityAddress,
    compliance: complianceAddress
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