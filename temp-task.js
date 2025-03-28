const deployActionService = require("./scripts/deploy/deploy-action-service");

task("deploy-action-service", "Deploy the action service for an existing token")
  .addPositionalParam("tokenAddress", "The address of the token to deploy action service for")
  .setAction(async (taskArgs) => {
    await deployActionService(taskArgs.tokenAddress);
  });

module.exports = {};