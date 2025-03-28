// Simple script to deploy action service for a token
const deployActionService = require("./scripts/deploy/deploy-action-service");

async function main() {
  // Directly pass the token address from the command line
  const tokenAddress = process.argv[2];
  
  if (!tokenAddress) {
    console.error("Error: Token address not provided");
    console.log("Usage: node deploy-action.js <tokenAddress>");
    process.exit(1);
  }
  
  console.log(`Deploying action service for token: ${tokenAddress}`);
  await deployActionService(tokenAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });