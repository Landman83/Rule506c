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

7. **Rule 506c Token** - `deploy-rule506c-token.js`
   - Deploys a token pre-configured for Rule 506c compliance
   - Includes KYC and lockup modules for investor verification

8. **Rule506c Factory** - `deploy-rule506c-factory.js`
   - Deploys a specialized factory for Rule 506c tokens
   - Slimmed down version that omits action modules integration
   - Avoids contract size limitations

9. **Rule 506c Token (Slim)** - `deploy-rule506c-token-slim.js`
   - Deploys a token using the specialized Rule506c factory
   - Streamlined version that avoids contract size limitations

10. **Action Service** - `deploy-action-service.js`
    - Deploys a standalone ModularActions instance with modules
    - Completely separate from token deployment
    - Takes a token address as parameter

11. **Modular Solution** - `deploy-modular-solution.js`
    - Combines slim token factory with standalone action service
    - Fully modular approach that avoids contract size limitations

## Usage Examples

### Deploy the full stack with a single command

```bash
npx hardhat run scripts/deploy/deploy-token-suite.js --network <network-name>
```

### Deploy Rule 506c Token using Modular Approach

```bash
npx hardhat run scripts/deploy/deploy-modular-solution.js --network <network-name>
```

### Deploy Slim Rule 506c Token

```bash
npx hardhat run scripts/deploy/deploy-rule506c-token-slim.js --network <network-name>
```

### Deploy Standalone Action Service for an existing token

```bash
npx hardhat run scripts/deploy/deploy-action-service.js --network <network-name> <token-address>
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