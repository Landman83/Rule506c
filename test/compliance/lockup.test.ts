import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Lockup, ModularCompliance } from "../../typechain-types";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployFullSuiteFixture, deploySuiteWithModularCompliancesFixture } from "../fixtures/deploy-full-suite.fixture";

describe("Lockup Module", function () {
  // Test wallets
  let deployer: SignerWithAddress;
  let tokenAgent: SignerWithAddress;
  let complianceAgent: SignerWithAddress;
  let aliceWallet: SignerWithAddress;  // investor 1
  let bobWallet: SignerWithAddress;    // investor 2

  // Contracts
  let compliance: ModularCompliance;
  let token: Contract;
  let lockupModule: Lockup;
  let identityRegistry: Contract;
  
  // Identity contracts
  let aliceIdentity: Contract;
  let bobIdentity: Contract;
  
  // Constants
  const DEFAULT_LOCKUP_PERIOD = 360; // 6 minutes in seconds
  const LOCKUP_NAME = ethers.utils.formatBytes32String("INITIAL_LOCKUP");
  const SECOND_LOCKUP_NAME = ethers.utils.formatBytes32String("SECONDARY_LOCKUP");

  before(async function () {
    // Deploy the full suite fixture
    const fixture = await loadFixture(deployFullSuiteFixture);
    
    // Get signers
    [deployer, , tokenAgent] = await ethers.getSigners();
    aliceWallet = fixture.accounts.aliceWallet;
    bobWallet = fixture.accounts.bobWallet;
    complianceAgent = deployer; // For simplicity
    
    // Get contracts from the fixture
    token = fixture.suite.token;
    identityRegistry = fixture.suite.identityRegistry;
    
    // Get identities from the fixture
    aliceIdentity = fixture.identities.aliceIdentity;
    bobIdentity = fixture.identities.bobIdentity;
    
    // Deploy Lockup module
    const LockupFactory = await ethers.getContractFactory("Lockup");
    lockupModule = await LockupFactory.deploy() as Lockup;
    await lockupModule.deployed();
    await lockupModule.initialize();
    
    // Deploy our own modular compliance for testing 
    const ModularComplianceContract = await ethers.getContractFactory("ModularCompliance");
    compliance = await ModularComplianceContract.deploy() as ModularCompliance;
    await compliance.deployed();
    await compliance.init();
    
    // Set up compliance - note that we're the owner since we deployed it
    await compliance.bindToken(token.address);
    
    // Add Lockup module to compliance
    await compliance.addModule(lockupModule.address);
    
    // Initialize the module through the compliance contract
    await compliance.callModuleFunction(
      ethers.utils.hexConcat([
        '0x4cd9b8f6', // initializeModule(address) function selector
        ethers.utils.defaultAbiCoder.encode(['address'], [compliance.address])
      ]),
      lockupModule.address
    );
  });

  describe("Module Configuration", function () {
    it("should be properly initialized", async function () {
      expect(await lockupModule.name()).to.equal("Lockup");
      expect(await lockupModule.isPlugAndPlay()).to.equal(false);
      expect(await lockupModule.DEFAULT_LOCKUP_PERIOD()).to.equal(DEFAULT_LOCKUP_PERIOD);
    });

    it("should be added to compliance", async function () {
      const modules = await compliance.getModules();
      expect(modules).to.include(lockupModule.address);
    });
  });

  describe("Lockup Management", function () {
    beforeEach(async function () {
      // Mint tokens to investors
      await token.mint(aliceWallet.address, ethers.utils.parseEther("1000"));
      await token.mint(bobWallet.address, ethers.utils.parseEther("500"));
    });

    it("should allow adding a lockup to a user", async function () {
      const lockupAmount = ethers.utils.parseEther("500");
      
      await compliance.callModuleFunction(
        ethers.utils.hexConcat([
          '0x9a3da65b', // addLockUpToUser function selector
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'bytes32'],
            [aliceWallet.address, lockupAmount, LOCKUP_NAME]
          )
        ]),
        lockupModule.address
      );
      
      const lockup = await lockupModule.getLockUp(aliceWallet.address, LOCKUP_NAME);
      expect(lockup[0]).to.equal(lockupAmount); // lockupAmount
      expect(lockup[2]).to.equal(DEFAULT_LOCKUP_PERIOD); // lockUpPeriodSeconds
      expect(lockup[3]).to.equal(0); // unlockedAmount (should be 0 initially)
    });

    it("should track locked tokens correctly", async function () {
      const lockupAmount = ethers.utils.parseEther("500");
      
      await compliance.callModuleFunction(
        ethers.utils.hexConcat([
          '0x9a3da65b', // addLockUpToUser function selector
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'bytes32'],
            [bobWallet.address, lockupAmount, LOCKUP_NAME]
          )
        ]),
        lockupModule.address
      );
      
      const lockedAmount = await lockupModule.getLockedTokenToUser(bobWallet.address);
      expect(lockedAmount).to.equal(lockupAmount);
    });

    it("should prevent duplicate lockup names for the same user", async function () {
      const lockupAmount = ethers.utils.parseEther("100");
      
      // Add a lockup
      await compliance.callModuleFunction(
        ethers.utils.hexConcat([
          '0x9a3da65b', // addLockUpToUser function selector
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'bytes32'],
            [aliceWallet.address, lockupAmount, SECOND_LOCKUP_NAME]
          )
        ]),
        lockupModule.address
      );
      
      // Try to add the same lockup again
      await expect(
        compliance.callModuleFunction(
          ethers.utils.hexConcat([
            '0x9a3da65b', // addLockUpToUser function selector
            ethers.utils.defaultAbiCoder.encode(
              ['address', 'uint256', 'bytes32'],
              [aliceWallet.address, lockupAmount, SECOND_LOCKUP_NAME]
            )
          ]),
          lockupModule.address
        )
      ).to.be.revertedWith("Lockup already exists");
    });

    it("should allow removing a lockup from a user", async function () {
      const lockupName = ethers.utils.formatBytes32String("REMOVABLE_LOCKUP");
      const lockupAmount = ethers.utils.parseEther("200");
      
      // Add a lockup
      await compliance.callModuleFunction(
        ethers.utils.hexConcat([
          '0x9a3da65b', // addLockUpToUser function selector
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'bytes32'],
            [aliceWallet.address, lockupAmount, lockupName]
          )
        ]),
        lockupModule.address
      );
      
      // Verify lockup exists
      let lockup = await lockupModule.getLockUp(aliceWallet.address, lockupName);
      expect(lockup[0]).to.equal(lockupAmount);
      
      // Remove the lockup
      await compliance.callModuleFunction(
        ethers.utils.hexConcat([
          '0x7a81b5b6', // removeLockUpFromUser function selector
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'bytes32'],
            [aliceWallet.address, lockupName]
          )
        ]),
        lockupModule.address
      );
      
      // Verify lockup is removed
      lockup = await lockupModule.getLockUp(aliceWallet.address, lockupName);
      expect(lockup[0]).to.equal(0); // lockupAmount should be 0
    });
  });

  describe("Transfer Restrictions", function () {
    beforeEach(async function () {
      // Clear previous lockups
      const lockupNames = [LOCKUP_NAME, SECOND_LOCKUP_NAME, ethers.utils.formatBytes32String("REMOVABLE_LOCKUP")];
      
      for (const name of lockupNames) {
        try {
          await compliance.callModuleFunction(
            ethers.utils.hexConcat([
              '0x7a81b5b6', // removeLockUpFromUser function selector
              ethers.utils.defaultAbiCoder.encode(
                ['address', 'bytes32'],
                [aliceWallet.address, name]
              )
            ]),
            lockupModule.address
          );
          
          await compliance.callModuleFunction(
            ethers.utils.hexConcat([
              '0x7a81b5b6', // removeLockUpFromUser function selector
              ethers.utils.defaultAbiCoder.encode(
                ['address', 'bytes32'],
                [bobWallet.address, name]
              )
            ]),
            lockupModule.address
          );
        } catch (e) {
          // Ignore if lockup doesn't exist
        }
      }
      
      // Reset token balances
      await token.burn(aliceWallet.address, await token.balanceOf(aliceWallet.address));
      await token.burn(bobWallet.address, await token.balanceOf(bobWallet.address));
      
      // Mint fresh tokens
      await token.mint(aliceWallet.address, ethers.utils.parseEther("1000"));
      await token.mint(bobWallet.address, ethers.utils.parseEther("500"));
      
      // Add lockup to aliceWallet
      const lockupAmount = ethers.utils.parseEther("800");
      await compliance.callModuleFunction(
        ethers.utils.hexConcat([
          '0x9a3da65b', // addLockUpToUser function selector
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'bytes32'],
            [aliceWallet.address, lockupAmount, LOCKUP_NAME]
          )
        ]),
        lockupModule.address
      );
    });

    it("should allow transfers that respect lockup amount", async function () {
      // Should be able to transfer unlocked tokens (200 of 1000)
      const transferAmount = ethers.utils.parseEther("150");
      
      await expect(
        token.connect(aliceWallet).transfer(bobWallet.address, transferAmount)
      ).to.not.be.reverted;
      
      expect(await token.balanceOf(aliceWallet.address)).to.equal(ethers.utils.parseEther("850"));
      expect(await token.balanceOf(bobWallet.address)).to.equal(ethers.utils.parseEther("650"));
    });

    it("should prevent transfers that violate lockup amount", async function () {
      // Should not be able to transfer more than unlocked tokens
      const transferAmount = ethers.utils.parseEther("300");
      
      await expect(
        token.connect(aliceWallet).transfer(bobWallet.address, transferAmount)
      ).to.be.revertedWith("Transfer not possible");
    });

    it("should ignore lockup for minting operations", async function () {
      // Lockup should not affect minting
      const mintAmount = ethers.utils.parseEther("2000");
      
      await expect(
        token.mint(aliceWallet.address, mintAmount)
      ).to.not.be.reverted;
      
      expect(await token.balanceOf(aliceWallet.address)).to.equal(ethers.utils.parseEther("3000"));
    });

    it("should release tokens after lockup period", async function () {
      // Get lockup info
      const lockup = await lockupModule.getLockUp(aliceWallet.address, LOCKUP_NAME);
      const lockupEndTime = lockup[1].add(lockup[2]);
      
      // Advance time to after lockup period
      await ethers.provider.send("evm_increaseTime", [DEFAULT_LOCKUP_PERIOD + 10]);
      await ethers.provider.send("evm_mine", []);
      
      // Should now be able to transfer all tokens
      const transferAmount = ethers.utils.parseEther("900");
      
      await expect(
        token.connect(aliceWallet).transfer(bobWallet.address, transferAmount)
      ).to.not.be.reverted;
      
      expect(await token.balanceOf(aliceWallet.address)).to.equal(ethers.utils.parseEther("100"));
      expect(await token.balanceOf(bobWallet.address)).to.equal(ethers.utils.parseEther("1400"));
    });

    it("should handle multiple lockups correctly", async function () {
      // Add a second lockup
      const secondLockupAmount = ethers.utils.parseEther("100");
      await compliance.callModuleFunction(
        ethers.utils.hexConcat([
          '0x9a3da65b', // addLockUpToUser function selector
          ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'bytes32'],
            [aliceWallet.address, secondLockupAmount, SECOND_LOCKUP_NAME]
          )
        ]),
        lockupModule.address
      );
      
      // Total locked should be 800 + 100 = 900
      const lockedAmount = await lockupModule.getLockedTokenToUser(aliceWallet.address);
      expect(lockedAmount).to.equal(ethers.utils.parseEther("900"));
      
      // Should only be able to transfer 100 now (1000 - 900)
      const transferAmount = ethers.utils.parseEther("100");
      
      await expect(
        token.connect(aliceWallet).transfer(bobWallet.address, transferAmount)
      ).to.not.be.reverted;
      
      await expect(
        token.connect(aliceWallet).transfer(bobWallet.address, ethers.utils.parseEther("1"))
      ).to.be.revertedWith("Transfer not possible");
    });
  });
  
  describe("Module Management", function () {
    it("should only allow initialization once", async function () {
      await expect(
        lockupModule.initializeModule(compliance.address)
      ).to.be.revertedWith("module already initialized");
    });
    
    it("should only allow calls from compliance contract", async function () {
      await expect(
        lockupModule.connect(deployer).addLockUpToUser(
          aliceWallet.address,
          ethers.utils.parseEther("100"),
          ethers.utils.formatBytes32String("TEST")
        )
      ).to.be.revertedWith("only compliance contract can call");
    });
  });
});