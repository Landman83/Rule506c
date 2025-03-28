/**
 * Deploy a complete token solution with Rule 506c compliance and corporate action modules
 * This script handles the deployment in two phases to avoid contract size limitations:
 * 1. Deploy the token with Rule 506c compliance modules (KYC and lockup)
 * 2. Deploy separate corporate action modules (dividend and voting) for the token
 */

const { ethers } = require("hardhat");
const deployRule506cToken = require("./deploy-rule506c-token");
const deployActionModules = require("./deploy-action-modules-only");

async function main() {
  console.log("=== Deploying Complete Token Solution ===");
  console.log("Phase 1: Deploying Rule 506c Compliant Token");
  
  // Deploy the 506c-compliant token first
  const tokenDeployment = await deployRule506cToken();
  const tokenAddress = tokenDeployment.token;
  
  console.log("\nPhase 2: Deploying Corporate Action Modules");
  
  // Deploy action modules for the token
  const actionModules = await deployActionModules(tokenAddress);
  
  console.log("\n=== Deployment Complete ===");
  console.log("Token Suite Addresses:");
  console.log(`- Token: ${tokenAddress}`);
  console.log(`- Token Identity: ${tokenDeployment.tokenIdentity}`);
  console.log(`- Compliance: ${tokenDeployment.compliance}`);
  console.log("\nCorporate Action Module Addresses:");
  console.log(`- Dividend Module: ${actionModules.dividend}`);
  console.log(`- Voting Module: ${actionModules.voting}`);
  
  console.log("\nUsage Guide:");
  console.log("1. Register investors with KYC claims through Identity Registry");
  console.log("2. Set lockup periods for investors if needed");
  console.log("3. Configure dividend properties (e.g., wallet, agents)");
  console.log("4. Configure voting parameters (e.g., quorum, exempted voters)");
  console.log("5. Create dividends and votes for token holders");
  
  return {
    token: tokenAddress,
    tokenIdentity: tokenDeployment.tokenIdentity, 
    compliance: tokenDeployment.compliance,
    dividend: actionModules.dividend,
    voting: actionModules.voting
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