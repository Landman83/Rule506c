/**
 * Script to deploy a test token with corporate action modules for development purposes
 * This script deploys all components from scratch for testing
 */

const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying test token with corporate action modules");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // 1. Deploy Implementation Authority
  console.log("Deploying Implementation Authority...");
  const TREXImplementationAuthority = await ethers.getContractFactory("TREXImplementationAuthority");
  const implementationAuthority = await TREXImplementationAuthority.deploy(true, ethers.constants.AddressZero, ethers.constants.AddressZero);
  await implementationAuthority.deployed();
  console.log("Implementation Authority deployed at:", implementationAuthority.address);

  // 2. Deploy implementations of all contracts
  console.log("Deploying contract implementations...");
  
  // Deploy Token implementation
  const TokenImplementation = await ethers.getContractFactory("Token");
  const tokenImplementation = await TokenImplementation.deploy();
  await tokenImplementation.deployed();
  console.log("Token implementation deployed at:", tokenImplementation.address);
  
  // Deploy CTR implementation
  const CTRImplementation = await ethers.getContractFactory("ClaimTopicsRegistry");
  const ctrImplementation = await CTRImplementation.deploy();
  await ctrImplementation.deployed();
  console.log("CTR implementation deployed at:", ctrImplementation.address);
  
  // Deploy IR implementation
  const IRImplementation = await ethers.getContractFactory("IdentityRegistry");
  const irImplementation = await IRImplementation.deploy();
  await irImplementation.deployed();
  console.log("IR implementation deployed at:", irImplementation.address);
  
  // Deploy IRS implementation
  const IRSImplementation = await ethers.getContractFactory("IdentityRegistryStorage");
  const irsImplementation = await IRSImplementation.deploy();
  await irsImplementation.deployed();
  console.log("IRS implementation deployed at:", irsImplementation.address);
  
  // Deploy TIR implementation
  const TIRImplementation = await ethers.getContractFactory("TrustedIssuersRegistry");
  const tirImplementation = await TIRImplementation.deploy();
  await tirImplementation.deployed();
  console.log("TIR implementation deployed at:", tirImplementation.address);
  
  // Deploy MC implementation
  const MCImplementation = await ethers.getContractFactory("ModularCompliance");
  const mcImplementation = await MCImplementation.deploy();
  await mcImplementation.deployed();
  console.log("MC implementation deployed at:", mcImplementation.address);
  
  // Deploy MA implementation
  const MAImplementation = await ethers.getContractFactory("ModularActions");
  const maImplementation = await MAImplementation.deploy();
  await maImplementation.deployed();
  console.log("MA implementation deployed at:", maImplementation.address);

  // 3. Register implementations in the implementation authority
  console.log("Registering implementations in the authority...");
  
  const trexContracts = {
    tokenImplementation: tokenImplementation.address,
    ctrImplementation: ctrImplementation.address,
    irImplementation: irImplementation.address,
    irsImplementation: irsImplementation.address,
    tirImplementation: tirImplementation.address,
    mcImplementation: mcImplementation.address,
    maImplementation: maImplementation.address
  };
  
  const version = {
    major: 4,
    minor: 0,
    patch: 0
  };
  
  await implementationAuthority.addTREXVersion(version, trexContracts);
  await implementationAuthority.useTREXVersion(version);
  console.log("Implementations registered successfully");

  // 4. Deploy Factory and Gateway
  console.log("Deploying Factory...");
  const TREXFactory = await ethers.getContractFactory("TREXFactory");
  const factory = await TREXFactory.deploy(implementationAuthority.address, ethers.constants.AddressZero);
  await factory.deployed();
  console.log("Factory deployed at:", factory.address);
  
  // Set factory in implementation authority
  await implementationAuthority.setTREXFactory(factory.address);
  
  console.log("Deploying Gateway...");
  const TREXGateway = await ethers.getContractFactory("TREXGateway");
  const gateway = await TREXGateway.deploy(factory.address, true);
  await gateway.deployed();
  console.log("Gateway deployed at:", gateway.address);
  
  // 5. Deploy Compliance modules
  console.log("Deploying KYC module...");
  const KYCModule = await ethers.getContractFactory("KYCModule");
  const kycModule = await KYCModule.deploy();
  await kycModule.deployed();
  console.log("KYC module deployed at:", kycModule.address);

  // 6. Deploy Claim Issuer
  console.log("Deploying Claim Issuer...");
  const IAFactory = await ethers.getContractFactory("IAFactory");
  const iaFactory = await IAFactory.deploy();
  await iaFactory.deployed();
  
  // Deploy a test identity contract - in production this would be your KYC provider's identity
  const testIssuerIdentity = await iaFactory.createIdentity(deployer.address, 1000, true);
  const testIssuerReceipt = await testIssuerIdentity.wait();
  const issuerAddress = testIssuerReceipt.events[0].args[0];
  console.log("Test claim issuer deployed at:", issuerAddress);

  // 7. Deploy the token suite using the factory
  console.log("Preparing token deployment...");
  
  // Prepare token details
  const tokenName = "Test Rule 506(c) Token";
  const tokenSymbol = "TEST506C";
  const tokenDecimals = 18;

  // Prepare claim details
  const claimTopics = [1, 7]; // Example: KYC and Accredited Investor claims
  const issuerClaims = [claimTopics];

  // Prepare compliance modules
  const complianceModules = [kycModule.address];
  const complianceSettings = [
    ethers.utils.defaultAbiCoder.encode(
      ['address[]', 'uint256[]'],
      [[issuerAddress], [7]] // Accredited investor claim topic
    )
  ];

  // Create token details object
  const tokenDetails = {
    owner: deployer.address,
    name: tokenName,
    symbol: tokenSymbol,
    decimals: tokenDecimals,
    irs: ethers.constants.AddressZero, // Deploy a new storage
    ONCHAINID: ethers.constants.AddressZero, // Deploy a new ONCHAINID
    irAgents: [deployer.address],
    tokenAgents: [deployer.address],
    complianceModules: complianceModules,
    complianceSettings: complianceSettings,
    actionModules: [], // We'll deploy these after the token
    actionSettings: []
  };

  // Create claim details object
  const claimDetails = {
    claimTopics: claimTopics,
    issuers: [issuerAddress],
    issuerClaims: issuerClaims
  };

  // Deploy token suite
  console.log("Deploying token suite...");
  const salt = ethers.utils.formatBytes32String("test-token-" + Date.now().toString());
  const tx = await factory.deployTREXSuite(salt, tokenDetails, claimDetails);
  const receipt = await tx.wait();
  
  // Get token address from events
  let tokenAddress;
  for (const event of receipt.events) {
    if (event.event === "TREXSuiteDeployed") {
      tokenAddress = event.args._token;
      break;
    }
  }
  
  console.log("Token deployed at:", tokenAddress);
  
  // Get ModularActions address from events
  let modularActionsAddress;
  for (const event of receipt.events) {
    if (event.event === "TREXSuiteDeployed") {
      modularActionsAddress = event.args._ma;
      break;
    }
  }
  
  console.log("ModularActions deployed at:", modularActionsAddress);

  // 8. Deploy the action modules
  console.log("Deploying action modules...");
  const DividendFactory = await ethers.getContractFactory("DividendCheckpoint");
  const dividend = await DividendFactory.deploy(tokenAddress);
  await dividend.deployed();
  console.log("Dividend module deployed at:", dividend.address);

  const VotingFactory = await ethers.getContractFactory("WeightedVoteCheckpoint");
  const voting = await VotingFactory.deploy(tokenAddress);
  await voting.deployed();
  console.log("Voting module deployed at:", voting.address);

  // 9. Add the modules to ModularActions
  if (modularActionsAddress && modularActionsAddress !== ethers.constants.AddressZero) {
    console.log("Configuring ModularActions...");
    const modularActions = await ethers.getContractAt("ModularActions", modularActionsAddress);
    
    // Add modules
    await modularActions.addModule(dividend.address);
    await modularActions.addModule(voting.address);
    console.log("Modules added to ModularActions");
    
    // Configure modules
    console.log("Configuring dividend module...");
    await dividend.setWallet(deployer.address);
    await dividend.addAgent(deployer.address);
    
    console.log("Configuring voting module...");
    await voting.setDefaultExemptedVoters([deployer.address]);
    await voting.addAgent(deployer.address);
    
    console.log("Modules configured successfully");
  }

  console.log("\nDeployment completed successfully");
  console.log("Token:", tokenAddress);
  console.log("ModularActions:", modularActionsAddress);
  console.log("Dividend module:", dividend.address);
  console.log("Voting module:", voting.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });