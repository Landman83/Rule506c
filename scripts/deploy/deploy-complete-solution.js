/**
 * Deploy a complete token solution with Rule 506c compliance and corporate action modules
 * This script handles the deployment in two completely separate steps to avoid contract size limitations:
 * 1. Deploy the token with Rule 506c compliance modules (KYC and lockup)
 * 2. Deploy a standalone action service with modules (dividend and voting) for the token
 */

const { ethers } = require("hardhat");
const deployRule506cToken = require("./deploy-rule506c-token");
const deployActionService = require("./deploy-action-service");

async function main() {
  console.log("=== Deploying Complete Token Solution ===");
  console.log("Phase 1: Deploying Rule 506c Compliant Token");
  
  // Deploy the 506c-compliant token first - this deploys without action modules
  const tokenDeployment = await deployRule506cToken();
  const tokenAddress = tokenDeployment.token;
  
  console.log("\nPhase 2: Deploying Separate Action Service");
  
  // Deploy action service for the token - separate deployment to avoid size limitations
  // Need to use process.argv emulation since deployActionService expects token as command line arg
  const originalArgv = process.argv;
  process.argv = [process.argv[0], process.argv[1], tokenAddress];
  const actionService = await deployActionService();
  // Restore original argv
  process.argv = originalArgv;
  
  console.log("\n=== Deployment Complete ===");
  console.log("Token Suite Addresses:");
  console.log(`- Token: ${tokenAddress}`);
  console.log(`- Token Identity: ${tokenDeployment.tokenIdentity}`);
  console.log(`- Compliance: ${tokenDeployment.compliance}`);
  console.log("\nAction Service Addresses:");
  console.log(`- ModularActions Container: ${actionService.modularActions}`);
  console.log(`- Dividend Module: ${actionService.dividend}`);
  console.log(`- Voting Module: ${actionService.voting}`);
  
  console.log("\nUsage Guide:");
  console.log("1. Register investors with KYC claims through Identity Registry");
  console.log("2. Set lockup periods for investors if needed");
  console.log("3. Set token owner as agent on ModularActions");
  console.log("4. Transfer ModularActions ownership to token owner");
  console.log("5. Create dividends and votes for token holders");
  
  return {
    token: tokenAddress,
    tokenIdentity: tokenDeployment.tokenIdentity, 
    compliance: tokenDeployment.compliance,
    modularActions: actionService.modularActions,
    dividend: actionService.dividend,
    voting: actionService.voting
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