import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { KYC, ModularCompliance } from "../../typechain-types";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployFullSuiteFixture, deploySuiteWithModularCompliancesFixture } from "../fixtures/deploy-full-suite.fixture";

describe("KYC Module", function () {
  // Test wallets
  let deployer: SignerWithAddress;
  let tokenAgent: SignerWithAddress;
  let complianceAgent: SignerWithAddress;
  let aliceWallet: SignerWithAddress;  // verified investor 1
  let bobWallet: SignerWithAddress;    // verified investor 2
  let charlieWallet: SignerWithAddress;  // unverified investor

  // Contracts
  let compliance: ModularCompliance;
  let token: Contract;
  let kycModule: KYC;
  let identityRegistry: Contract;
  
  // Identity contracts
  let aliceIdentity: Contract;
  let bobIdentity: Contract;
  let charlieIdentity: Contract;

  before(async function () {
    // Deploy the full suite fixture
    const fixture = await loadFixture(deployFullSuiteFixture);
    
    // Get signers
    [deployer, , tokenAgent] = await ethers.getSigners();
    aliceWallet = fixture.accounts.aliceWallet;
    bobWallet = fixture.accounts.bobWallet;
    charlieWallet = fixture.accounts.charlieWallet;
    complianceAgent = deployer; // For simplicity
    
    // Get contracts from the fixture
    token = fixture.suite.token;
    identityRegistry = fixture.suite.identityRegistry;
    
    // Get identities from the fixture
    aliceIdentity = fixture.identities.aliceIdentity;
    bobIdentity = fixture.identities.bobIdentity;
    charlieIdentity = fixture.identities.charlieIdentity;
    
    // Deploy KYC module
    const KYCFactory = await ethers.getContractFactory("KYC");
    kycModule = await KYCFactory.deploy() as KYC;
    await kycModule.deployed();
    await kycModule.initialize();

    // Deploy our own modular compliance for testing 
    const ModularComplianceContract = await ethers.getContractFactory("ModularCompliance");
    compliance = await ModularComplianceContract.deploy() as ModularCompliance;
    await compliance.deployed();
    await compliance.init();
    
    // Set up compliance - note that we're the owner since we deployed it
    await compliance.bindToken(token.address);
    
    // Add KYC module to compliance
    await compliance.addModule(kycModule.address);
    
    // Initialize the module through the compliance contract
    // Using the same approach as in the successful test below at line 159
    await compliance.callModuleFunction(
      ethers.utils.hexConcat([
        '0x4cd9b8f6', // initializeModule(address) function selector
        ethers.utils.defaultAbiCoder.encode(['address'], [compliance.address])
      ]),
      kycModule.address
    );
  });

  describe("Module Configuration", function () {
    it("should be properly initialized", async function () {
      expect(await kycModule.name()).to.equal("KYC");
      expect(await kycModule.isPlugAndPlay()).to.equal(false);
    });

    it("should be added to compliance", async function () {
      const modules = await compliance.getModules();
      expect(modules).to.include(kycModule.address);
    });
  });

  describe("KYC Verification", function () {
    it("should correctly report KYC status of investors", async function () {
      // Alice and Bob are verified in the fixture, Charlie is not
      expect(await kycModule.isKYCApproved(aliceWallet.address, compliance.address)).to.equal(true);
      expect(await kycModule.isKYCApproved(bobWallet.address, compliance.address)).to.equal(true);
      expect(await kycModule.isKYCApproved(charlieWallet.address, compliance.address)).to.equal(false);
    });

    it("should match identity registry verification status", async function () {
      expect(await identityRegistry.isVerified(aliceWallet.address)).to.equal(true);
      expect(await identityRegistry.isVerified(bobWallet.address)).to.equal(true);
      expect(await identityRegistry.isVerified(charlieWallet.address)).to.equal(false);
      
      expect(await kycModule.isKYCApproved(aliceWallet.address, compliance.address))
        .to.equal(await identityRegistry.isVerified(aliceWallet.address));
      
      expect(await kycModule.isKYCApproved(charlieWallet.address, compliance.address))
        .to.equal(await identityRegistry.isVerified(charlieWallet.address));
    });
  });

  describe("Transfer Compliance", function () {
    beforeEach(async function () {
      // Mint tokens to verified investors
      await token.mint(aliceWallet.address, ethers.utils.parseEther("1000"));
      await token.mint(bobWallet.address, ethers.utils.parseEther("500"));
    });

    it("should allow transfers between KYC verified addresses", async function () {
      const transferAmount = ethers.utils.parseEther("100");
      await expect(
        token.connect(aliceWallet).transfer(bobWallet.address, transferAmount)
      ).to.not.be.reverted;
      
      // Check balances updated correctly
      expect(await token.balanceOf(aliceWallet.address))
        .to.equal(ethers.utils.parseEther("900"));
      expect(await token.balanceOf(bobWallet.address))
        .to.equal(ethers.utils.parseEther("600"));
    });

    it("should prevent transfers to unverified addresses", async function () {
      const transferAmount = ethers.utils.parseEther("100");
      await expect(
        token.connect(aliceWallet).transfer(charlieWallet.address, transferAmount)
      ).to.be.revertedWith("Transfer not possible");
    });

    it("should prevent minting to unverified addresses", async function () {
      const mintAmount = ethers.utils.parseEther("100");
      await expect(
        token.mint(charlieWallet.address, mintAmount)
      ).to.be.revertedWith("Transfer not possible");
    });

    it("should verify both sender and receiver for transfers", async function () {
      // Mock moduleCheck function to inspect parameters
      const moduleMock = await ethers.getContractFactory("KYC");
      const mockModule = await moduleMock.deploy();
      await mockModule.deployed();
      await mockModule.initialize();
      
      // Check that moduleCheck is called with correct addresses
      // This is a bit tricky to test directly, so we're testing the function behavior
      expect(await mockModule.moduleCheck(
        aliceWallet.address,
        bobWallet.address,
        ethers.utils.parseEther("100"),
        compliance.address
      )).to.equal(false); // False because mock module is not initialized with our compliance
      
      // Initialize the mockModule properly
      await compliance.addModule(mockModule.address);
      await compliance.callModuleFunction(
        ethers.utils.hexConcat([
          '0x4cd9b8f6', // initializeModule(address)
          ethers.utils.defaultAbiCoder.encode(['address'], [compliance.address])
        ]),
        mockModule.address
      );
      
      // Now check should work if both addresses are verified
      expect(await mockModule.moduleCheck(
        aliceWallet.address,
        bobWallet.address,
        ethers.utils.parseEther("100"),
        compliance.address
      )).to.equal(true);
      
      // Should fail if either address is unverified
      expect(await mockModule.moduleCheck(
        aliceWallet.address,
        charlieWallet.address,
        ethers.utils.parseEther("100"),
        compliance.address
      )).to.equal(false);
      
      expect(await mockModule.moduleCheck(
        charlieWallet.address,
        bobWallet.address,
        ethers.utils.parseEther("100"),
        compliance.address
      )).to.equal(false);
    });
  });
  
  describe("Module Management", function () {
    it("should only allow initialization once", async function () {
      await expect(
        kycModule.initializeModule(compliance.address)
      ).to.be.revertedWith("module already initialized");
    });
    
    it("should only allow calls from compliance contract", async function () {
      await expect(
        kycModule.connect(deployer).moduleCheck(
          aliceWallet.address,
          bobWallet.address,
          ethers.utils.parseEther("100"),
          compliance.address
        )
      ).to.be.revertedWith("only compliance contract can call");
    });
  });
});