import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { ethers } from 'hardhat';
import { expect } from 'chai';
import {
  deployFullSuiteFixture,
  deploySuiteWithModularCompliancesFixture,
  deploySuiteWithModuleComplianceBoundToWallet,
} from './fixtures/deploy-full-suite.fixture';

describe('ModularCompliance', () => {
  describe('.init', () => {
    it('should prevent calling init twice', async () => {
      const {
        suite: { compliance },
      } = await loadFixture(deploySuiteWithModularCompliancesFixture);

      await expect(compliance.init()).to.be.revertedWith('Initializable: contract is already initialized');
    });
  });

  describe('.bindToken', () => {
    describe('when calling as another account that the owner', () => {
      it('should revert', async () => {
        const {
          accounts: { anotherWallet },
          suite: { token, compliance },
        } = await loadFixture(deploySuiteWithModularCompliancesFixture);

        await expect(compliance.connect(anotherWallet).bindToken(token.address)).to.be.revertedWith('only owner or token can call');
      });
    });

    describe('when the compliance is already bound to a token', () => {
      describe('when not calling as the token', () => {
        it('should revert', async () => {
          const {
            accounts: { deployer, anotherWallet },
            suite: { token },
          } = await loadFixture(deployFullSuiteFixture);

          const compliance = await ethers.deployContract('ModularCompliance', deployer);
          await compliance.init();

          await compliance.bindToken(token.address);

          await expect(compliance.connect(anotherWallet).bindToken(token.address)).to.be.revertedWith('only owner or token can call');
        });
      });

      describe('when calling as the token', () => {
        it('should set the new compliance', async () => {
          const {
            suite: { token },
          } = await loadFixture(deployFullSuiteFixture);

          const compliance = await ethers.deployContract('ModularCompliance');
          await compliance.init();
          await compliance.bindToken(token.address);

          const newCompliance = await ethers.deployContract('ModularCompliance');

          const tx = await token.setCompliance(newCompliance.address);
          await expect(tx).to.emit(token, 'ComplianceAdded').withArgs(newCompliance.address);
          await expect(tx).to.emit(newCompliance, 'TokenBound').withArgs(token.address);
        });
      });
    });

    describe('when calling as the owner', () => {
      describe('when token address is zero', () => {
        it('should revert', async () => {
          const {
            accounts: { deployer },
          } = await loadFixture(deployFullSuiteFixture);

          const compliance = await ethers.deployContract('ModularCompliance', deployer);
          await compliance.init();

          await expect(compliance.bindToken(ethers.constants.AddressZero)).to.be.revertedWith('invalid argument - zero address');
        });
      });
    });
  });

  describe('.unbindToken', () => {
    describe('when calling as another account', () => {
      it('should revert', async () => {
        const {
          accounts: { anotherWallet },
          suite: { token, compliance },
        } = await loadFixture(deploySuiteWithModularCompliancesFixture);

        await expect(compliance.connect(anotherWallet).unbindToken(token.address)).to.be.revertedWith('only owner or token can call');
      });
    });

    describe('when calling as the owner', () => {
      describe('when token is a zero address', () => {
        it('should revert', async () => {
          const {
            suite: { compliance },
          } = await loadFixture(deploySuiteWithModularCompliancesFixture);

          await expect(compliance.unbindToken(ethers.constants.AddressZero)).to.be.revertedWith('invalid argument - zero address');
        });
      });

      describe('when token is not bound', () => {
        it('should revert', async () => {
          const {
            accounts: { deployer },
            suite: { token },
          } = await loadFixture(deployFullSuiteFixture);

          const compliance = await ethers.deployContract('ModularCompliance', deployer);
          await compliance.init();

          await expect(compliance.unbindToken(token.address)).to.be.revertedWith('This token is not bound');
        });
      });
    });

    describe('when calling as the token given in parameters', () => {
      it('should bind the new compliance to the token', async () => {
        const {
          suite: { compliance, complianceBeta, token },
        } = await loadFixture(deploySuiteWithModularCompliancesFixture);

        await token.setCompliance(compliance.address);

        const tx = await token.setCompliance(complianceBeta.address);
        await expect(tx).to.emit(token, 'ComplianceAdded').withArgs(complianceBeta.address);
        await expect(tx).to.emit(complianceBeta, 'TokenBound').withArgs(token.address);
        await expect(tx).to.emit(compliance, 'TokenUnbound').withArgs(token.address);

        await expect(complianceBeta.getTokenBound()).to.eventually.eq(token.address);
      });
    });
  });

  describe('.addModule', () => {
    describe('when not calling as the owner', () => {
      it('should revert', async () => {
        const {
          accounts: { anotherWallet },
          suite: { compliance },
        } = await loadFixture(deploySuiteWithModularCompliancesFixture);

        await expect(compliance.connect(anotherWallet).addModule(ethers.constants.AddressZero)).to.be.revertedWith(
          'Ownable: caller is not the owner',
        );
      });
    });

    describe('when calling as the owner', () => {
      describe('when module address is zero', () => {
        it('should revert', async () => {
          const {
            suite: { compliance },
          } = await loadFixture(deploySuiteWithModularCompliancesFixture);

          await expect(compliance.addModule(ethers.constants.AddressZero)).to.be.revertedWith('invalid argument - zero address');
        });
      });

      describe('when module address is already bound', () => {
        it('should revert', async () => {
          const {
            suite: { compliance },
          } = await loadFixture(deploySuiteWithModularCompliancesFixture);

          const module = await ethers.deployContract('TestModule');
          await compliance.addModule(module.address);

          await expect(compliance.addModule(module.address)).to.be.revertedWith('module already bound');
        });
      });

      describe('when module is plug & play', () => {
        it('should add the module', async () => {
          const {
            suite: { compliance },
          } = await loadFixture(deploySuiteWithModularCompliancesFixture);

          const module = await ethers.deployContract('TestModule');
          const tx = await compliance.addModule(module.address);

          await expect(tx).to.emit(compliance, 'ModuleAdded').withArgs(module.address);
          await expect(compliance.getModules()).to.eventually.deep.eq([module.address]);
        });
      });

      describe('when attempting to bind a 25th module', () => {
        it('should revert', async () => {
          const {
            suite: { compliance },
          } = await loadFixture(deploySuiteWithModularCompliancesFixture);

          const modules = await Promise.all(Array.from({ length: 25 }, () => ethers.deployContract('TestModule')));

          await Promise.all(modules.map((module) => compliance.addModule(module.address)));

          const module = await ethers.deployContract('TestModule');

          await expect(compliance.addModule(module.address)).to.be.revertedWith('cannot add more than 25 modules');
        });
      });
    });
  });

  describe('.removeModule', () => {
    describe('when not calling as owner', () => {
      it('should revert', async () => {
        const {
          accounts: { anotherWallet },
          suite: { compliance },
        } = await loadFixture(deploySuiteWithModularCompliancesFixture);

        await expect(compliance.connect(anotherWallet).removeModule(ethers.constants.AddressZero)).to.be.revertedWith(
          'Ownable: caller is not the owner',
        );
      });
    });

    describe('when calling as the owner', () => {
      describe('when module address is zero', () => {
        it('should revert', async () => {
          const {
            suite: { compliance },
          } = await loadFixture(deploySuiteWithModularCompliancesFixture);

          await expect(compliance.removeModule(ethers.constants.AddressZero)).to.be.revertedWith('invalid argument - zero address');
        });
      });

      describe('when module address is not bound', () => {
        it('should revert', async () => {
          const {
            suite: { compliance },
          } = await loadFixture(deploySuiteWithModularCompliancesFixture);

          const module = await ethers.deployContract('TestModule');

          await expect(compliance.removeModule(module.address)).to.be.revertedWith('module not bound');
        });
      });

      describe('when module is bound', () => {
        it('should remove the module', async () => {
          const {
            suite: { compliance },
          } = await loadFixture(deploySuiteWithModularCompliancesFixture);

          const module = await ethers.deployContract('TestModule');
          await compliance.addModule(module.address);

          const moduleB = await ethers.deployContract('TestModule');
          await compliance.addModule(moduleB.address);

          const tx = await compliance.removeModule(moduleB.address);

          await expect(tx).to.emit(compliance, 'ModuleRemoved').withArgs(moduleB.address);

          await expect(compliance.isModuleBound(moduleB.address)).to.be.eventually.false;
        });
      });
    });
  });

  describe('.transferred', () => {
    describe('when not calling as a bound token', () => {
      it('should revert', async () => {
        const {
          accounts: { anotherWallet },
          suite: { compliance },
        } = await loadFixture(deploySuiteWithModularCompliancesFixture);

        await expect(compliance.connect(anotherWallet).transferred(ethers.constants.AddressZero, ethers.constants.AddressZero, 0)).to.be.revertedWith(
          'error : this address is not a token bound to the compliance contract',
        );
      });
    });

    describe('when calling as a bound token', () => {
      describe('when from address is null', () => {
        it('should revert', async () => {
          const {
            suite: { compliance },
            accounts: { bobWallet, charlieWallet },
          } = await loadFixture(deploySuiteWithModuleComplianceBoundToWallet);

          await expect(compliance.connect(charlieWallet).transferred(ethers.constants.AddressZero, bobWallet.address, 10)).to.be.revertedWith(
            'invalid argument - zero address',
          );
        });
      });

      describe('when to address is null', () => {
        it('should revert', async () => {
          const {
            suite: { compliance },
            accounts: { charlieWallet, aliceWallet },
          } = await loadFixture(deploySuiteWithModuleComplianceBoundToWallet);

          await expect(compliance.connect(charlieWallet).transferred(aliceWallet.address, ethers.constants.AddressZero, 10)).to.be.revertedWith(
            'invalid argument - zero address',
          );
        });
      });

      describe('when amount is zero', () => {
        it('should revert', async () => {
          const {
            suite: { compliance },
            accounts: { aliceWallet, bobWallet, charlieWallet },
          } = await loadFixture(deploySuiteWithModuleComplianceBoundToWallet);

          await expect(compliance.connect(charlieWallet).transferred(aliceWallet.address, bobWallet.address, 0)).to.be.revertedWith(
            'invalid argument - no value transfer',
          );
        });
      });

      describe('when amount is greater than zero', () => {
        it('Should update the modules', async () => {
          const {
            suite: { compliance },
            accounts: { aliceWallet, bobWallet, charlieWallet },
          } = await loadFixture(deploySuiteWithModuleComplianceBoundToWallet);

          await expect(compliance.connect(charlieWallet).transferred(aliceWallet.address, bobWallet.address, 10)).to.be.fulfilled;
        });
      });
    });
  });

  describe('.created', () => {
    describe('when not calling as a bound token', () => {
      it('should revert', async () => {
        const {
          accounts: { anotherWallet },
          suite: { compliance },
        } = await loadFixture(deploySuiteWithModularCompliancesFixture);

        await expect(compliance.connect(anotherWallet).created(ethers.constants.AddressZero, 0)).to.be.revertedWith(
          'error : this address is not a token bound to the compliance contract',
        );
      });
    });

    describe('when calling as a bound token', () => {
      describe('when to address is null', () => {
        it('should revert', async () => {
          const {
            suite: { compliance },
            accounts: { charlieWallet },
          } = await loadFixture(deploySuiteWithModuleComplianceBoundToWallet);

          await expect(compliance.connect(charlieWallet).created(ethers.constants.AddressZero, 10)).to.be.revertedWith(
            'invalid argument - zero address',
          );
        });
      });

      describe('when amount is zero', () => {
        it('should revert', async () => {
          const {
            suite: { compliance },
            accounts: { bobWallet, charlieWallet },
          } = await loadFixture(deploySuiteWithModuleComplianceBoundToWallet);

          await expect(compliance.connect(charlieWallet).created(bobWallet.address, 0)).to.be.revertedWith('invalid argument - no value mint');
        });
      });

      describe('when amount is greater than zero', () => {
        it('Should update the modules', async () => {
          const {
            suite: { compliance },
            accounts: { bobWallet, charlieWallet },
          } = await loadFixture(deploySuiteWithModuleComplianceBoundToWallet);

          await expect(compliance.connect(charlieWallet).created(bobWallet.address, 10)).to.be.fulfilled;
        });
      });
    });
  });

  describe('.destroyed', () => {
    describe('when not calling as a bound token', () => {
      it('should revert', async () => {
        const {
          accounts: { anotherWallet },
          suite: { compliance },
        } = await loadFixture(deploySuiteWithModularCompliancesFixture);

        await expect(compliance.connect(anotherWallet).destroyed(ethers.constants.AddressZero, 0)).to.be.revertedWith(
          'error : this address is not a token bound to the compliance contract',
        );
      });
    });

    describe('when calling as a bound token', () => {
      describe('when from address is null', () => {
        it('should revert', async () => {
          const {
            suite: { compliance },
            accounts: { charlieWallet },
          } = await loadFixture(deploySuiteWithModuleComplianceBoundToWallet);

          await expect(compliance.connect(charlieWallet).destroyed(ethers.constants.AddressZero, 10)).to.be.revertedWith(
            'invalid argument - zero address',
          );
        });
      });

      describe('when amount is zero', () => {
        it('should revert', async () => {
          const {
            suite: { compliance },
            accounts: { aliceWallet, charlieWallet },
          } = await loadFixture(deploySuiteWithModuleComplianceBoundToWallet);

          await expect(compliance.connect(charlieWallet).destroyed(aliceWallet.address, 0)).to.be.revertedWith('invalid argument - no value burn');
        });
      });

      describe('when amount is greater than zero', () => {
        it('Should update the modules', async () => {
          const {
            suite: { compliance },
            accounts: { aliceWallet, charlieWallet },
          } = await loadFixture(deploySuiteWithModuleComplianceBoundToWallet);

          await expect(compliance.connect(charlieWallet).destroyed(aliceWallet.address, 10)).to.be.fulfilled;
        });
      });
    });
  });

  describe('.callModuleFunction()', () => {
    describe('when sender is not the owner', () => {
      it('should revert', async () => {
        const {
          accounts: { anotherWallet },
          suite: { compliance },
        } = await loadFixture(deploySuiteWithModularCompliancesFixture);

        await expect(
          compliance.connect(anotherWallet).callModuleFunction(ethers.utils.randomBytes(32), ethers.constants.AddressZero),
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });
    });

    describe('when module is not bound', () => {
      it('should revert', async () => {
        const {
          accounts: { deployer },
          suite: { compliance },
        } = await loadFixture(deploySuiteWithModularCompliancesFixture);

        await expect(compliance.connect(deployer).callModuleFunction(ethers.utils.randomBytes(32), ethers.constants.AddressZero)).to.be.revertedWith(
          'call only on bound module',
        );
      });
    });
  });

  describe('KYC Module Integration', () => {
    let compliance;
    let kycModule;
    let token;
    let identityRegistry;
    let aliceWallet;
    let bobWallet;
    let charlieWallet;
    let deployer;

    beforeEach(async () => {
      const fixture = await loadFixture(deployFullSuiteFixture);
      
      // Get signers
      [deployer] = await ethers.getSigners();
      aliceWallet = fixture.accounts.aliceWallet;
      bobWallet = fixture.accounts.bobWallet;
      charlieWallet = fixture.accounts.charlieWallet;
      
      // Get contracts from the fixture
      token = fixture.suite.token;
      identityRegistry = fixture.suite.identityRegistry;
      
      // Deploy our own modular compliance for testing 
      const ModularComplianceContract = await ethers.getContractFactory("ModularCompliance");
      compliance = await ModularComplianceContract.deploy();
      await compliance.init();
      
      // Deploy KYC module
      const KYCFactory = await ethers.getContractFactory("KYC");
      kycModule = await KYCFactory.deploy();
      await kycModule.initialize();
      
      // Set up compliance
      await compliance.bindToken(token.address);
      
      // Add KYC module to compliance
      await compliance.addModule(kycModule.address);
      
      // Initialize the module through compliance using the interface
      const iface = new ethers.utils.Interface(['function initializeModule(address)']);
      const encodedData = iface.encodeFunctionData('initializeModule', [compliance.address]);
      await compliance.callModuleFunction(encodedData, kycModule.address);
    });

    it('should be properly initialized', async () => {
      expect(await kycModule.name()).to.equal("KYC");
      expect(await kycModule.isPlugAndPlay()).to.equal(false);
    });

    it('should be added to compliance', async () => {
      const modules = await compliance.getModules();
      expect(modules).to.include(kycModule.address);
    });

    it('should correctly report KYC status of investors', async () => {
      // The fixture already marks Alice and Bob as verified
      expect(await identityRegistry.isVerified(aliceWallet.address)).to.equal(true);
      expect(await identityRegistry.isVerified(bobWallet.address)).to.equal(true);
      expect(await identityRegistry.isVerified(charlieWallet.address)).to.equal(false);
      
      expect(await kycModule.isKYCApproved(aliceWallet.address, compliance.address)).to.equal(true);
      expect(await kycModule.isKYCApproved(bobWallet.address, compliance.address)).to.equal(true);
      expect(await kycModule.isKYCApproved(charlieWallet.address, compliance.address)).to.equal(false);
    });

    it('should prevent multiple initialization', async () => {
      const iface = new ethers.utils.Interface(['function initializeModule(address)']);
      const encodedData = iface.encodeFunctionData('initializeModule', [compliance.address]);
      
      await expect(
        compliance.callModuleFunction(encodedData, kycModule.address)
      ).to.be.reverted; // Just check that it reverts, without checking the specific error message
    });
  });

  describe('Lockup Module Integration', () => {
    let compliance;
    let lockupModule;
    let token;
    let aliceWallet;
    let bobWallet;
    let deployer;
    const LOCKUP_NAME = ethers.utils.formatBytes32String("TEST_LOCKUP");
    const DEFAULT_LOCKUP_PERIOD = 360; // 6 minutes in seconds

    beforeEach(async () => {
      const fixture = await loadFixture(deployFullSuiteFixture);
      
      // Get signers
      [deployer] = await ethers.getSigners();
      aliceWallet = fixture.accounts.aliceWallet;
      bobWallet = fixture.accounts.bobWallet;
      
      // Get contracts from the fixture
      token = fixture.suite.token;
      
      // Deploy our own modular compliance for testing 
      const ModularComplianceContract = await ethers.getContractFactory("ModularCompliance");
      compliance = await ModularComplianceContract.deploy();
      await compliance.init();
      
      // Deploy Lockup module
      const LockupFactory = await ethers.getContractFactory("Lockup");
      lockupModule = await LockupFactory.deploy();
      await lockupModule.initialize();
      
      // Set up compliance
      await compliance.bindToken(token.address);
      
      // Add Lockup module to compliance
      await compliance.addModule(lockupModule.address);
      
      // Initialize the module through compliance using the interface
      const iface = new ethers.utils.Interface(['function initializeModule(address)']);
      const encodedData = iface.encodeFunctionData('initializeModule', [compliance.address]);
      await compliance.callModuleFunction(encodedData, lockupModule.address);
    });

    it('should be properly initialized', async () => {
      expect(await lockupModule.name()).to.equal("Lockup");
      expect(await lockupModule.isPlugAndPlay()).to.equal(false);
      expect(await lockupModule.DEFAULT_LOCKUP_PERIOD()).to.equal(DEFAULT_LOCKUP_PERIOD);
    });

    it('should be added to compliance', async () => {
      const modules = await compliance.getModules();
      expect(modules).to.include(lockupModule.address);
    });

    it('should allow adding a lockup to a user', async () => {
      const lockupAmount = ethers.utils.parseEther("500");
      
      const lockupIface = new ethers.utils.Interface(['function addLockUpToUser(address,uint256,bytes32)']);
      const lockupEncodedData = lockupIface.encodeFunctionData('addLockUpToUser', [
        aliceWallet.address, 
        lockupAmount, 
        LOCKUP_NAME
      ]);
      await compliance.callModuleFunction(lockupEncodedData, lockupModule.address);
      
      const lockup = await lockupModule.getLockUp(aliceWallet.address, LOCKUP_NAME);
      expect(lockup[0]).to.equal(lockupAmount); // lockupAmount
      expect(lockup[2]).to.equal(DEFAULT_LOCKUP_PERIOD); // lockUpPeriodSeconds
      expect(lockup[3]).to.equal(0); // unlockedAmount (should be 0 initially)
    });

    it('should track locked tokens correctly', async () => {
      const lockupAmount = ethers.utils.parseEther("500");
      
      const lockupIface = new ethers.utils.Interface(['function addLockUpToUser(address,uint256,bytes32)']);
      const lockupEncodedData = lockupIface.encodeFunctionData('addLockUpToUser', [
        bobWallet.address, 
        lockupAmount, 
        LOCKUP_NAME
      ]);
      await compliance.callModuleFunction(lockupEncodedData, lockupModule.address);
      
      const lockedAmount = await lockupModule.getLockedTokenToUser(bobWallet.address);
      expect(lockedAmount).to.equal(lockupAmount);
    });

    it('should prevent duplicate lockup names for the same user', async () => {
      const lockupAmount = ethers.utils.parseEther("100");
      
      // Add a lockup
      const lockupIface = new ethers.utils.Interface(['function addLockUpToUser(address,uint256,bytes32)']);
      const lockupEncodedData = lockupIface.encodeFunctionData('addLockUpToUser', [
        aliceWallet.address, 
        lockupAmount, 
        LOCKUP_NAME
      ]);
      await compliance.callModuleFunction(lockupEncodedData, lockupModule.address);
      
      // Try to add the same lockup again
      await expect(
        compliance.callModuleFunction(lockupEncodedData, lockupModule.address)
      ).to.be.revertedWith("Lockup already exists");
    });
  });
});
