# TREX Deployment Scripts

This directory contains scripts for deploying the TREX (Token for Regulated EXchanges) smart contract suite.

## Deployment Order

The scripts should be deployed in the following order:

1. **Implementation Authority** - `deploy-implementation-authority.js`
   - Deploys the core TREX Implementation Authority
   - Deploys all implementation contracts
   - Registers implementations in the authority

2. **Factories** - `deploy-factories.js`
   - Deploys the Identity Implementation and Authority
   - Deploys the Identity Factory
   - Deploys the TREX Factory
   - Links the factories together

3. **Gateway** - `deploy-gateway.js` (optional but recommended)
   - Deploys the TREX Gateway for access control
   - Transfers factory ownership to the gateway
   - Configures deployment permissions

4. **Compliance Modules** - `deploy-compliance-modules.js`
   - Deploys a suite of compliance modules for token rules
   - Includes DefaultCompliance and individual modules

5. **Standalone Components** - `deploy-standalone-components.js`
   - Deploys individual TREX components for sharing across tokens
   - Includes functions for each component type

6. **Token Suite** - `deploy-token-suite.js`
   - Deploys a complete token suite with all components
   - Configures identity, compliance and token details

## Usage Examples

### Deploy the full stack with a single command

```bash
npx hardhat run scripts/deploy/deploy-token-suite.js --network <network-name>
```

### Deploy individual components

```bash
# Deploy implementation authority
npx hardhat run scripts/deploy/deploy-implementation-authority.js --network <network-name>

# Deploy factories with existing implementation authority
npx hardhat run scripts/deploy/deploy-factories.js --network <network-name>

# Deploy gateway with public deployments enabled
node -e "require('./scripts/deploy/deploy-gateway.js')(null, true)" --network <network-name>

# Deploy standalone components
npx hardhat run scripts/deploy/deploy-standalone-components.js <implementation-authority-address> --network <network-name>
```

## Script Options

Each script can be used both as a standalone command and as a module imported by other scripts. When imported, the scripts accept parameters to customize the deployment.

### deploy-token-suite.js Parameters

```javascript
main(
  gatewayAddress,           // Optional: Use existing gateway
  tokenParams: {
    name: "TREX Token",     // Token name
    symbol: "TREX",         // Token symbol
    decimals: 18,           // Token decimals
    owner: null             // Token owner (defaults to deployer)
  },
  identityParams: {
    implementationAuthorityAddress: null // Optional: Override identity authority
  },
  complianceParams: {
    complianceType: "default", // "default" or "modular"
    modules: [],              // Addresses of compliance modules to use
    moduleSettings: []        // Settings for each module
  }
);
```

## Dependencies

The deployment scripts depend on the following packages:

- hardhat
- ethers
- @onchain-id/solidity

Make sure to install these dependencies before running the scripts.