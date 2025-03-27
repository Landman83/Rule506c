import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployFullSuiteFixture } from "../fixtures/deploy-full-suite.fixture";
import { DividendCheckpoint } from "../../typechain-types";

describe("Dividend Module", function () {
  // Test wallets
  let deployer: SignerWithAddress;
  let tokenIssuer: SignerWithAddress;
  let tokenAgent: SignerWithAddress;
  let aliceWallet: SignerWithAddress;  // verified investor 1
  let bobWallet: SignerWithAddress;    // verified investor 2
  let charlieWallet: SignerWithAddress;  // unverified investor
  let walletAddress: SignerWithAddress; // Treasury wallet

  // Contracts
  let token: Contract;
  let dividendModule: DividendCheckpoint;
  let dividendToken: Contract; // ERC20 token used for dividends
  
  // Test values
  const dividendAmount = ethers.utils.parseEther("1000");
  const maturityTime = Math.floor(Date.now() / 1000) + 100; // 100 seconds in the future
  const expiryTime = Math.floor(Date.now() / 1000) + 10000; // 10000 seconds in the future
  const dividendName = ethers.utils.formatBytes32String("Q1 Dividend");

  beforeEach(async function () {
    // Deploy the full suite fixture
    const fixture = await loadFixture(deployFullSuiteFixture);
    
    // Get signers
    [deployer, tokenIssuer, tokenAgent, walletAddress] = await ethers.getSigners();
    aliceWallet = fixture.accounts.aliceWallet;
    bobWallet = fixture.accounts.bobWallet;
    charlieWallet = fixture.accounts.charlieWallet;
    
    // Get token from the fixture
    token = fixture.suite.token;
    
    // Deploy a simple ERC20 token for dividend distribution
    const TestERC20Factory = await ethers.getContractFactory("TestERC20");
    dividendToken = await TestERC20Factory.deploy("Dividend Token", "DIV");
    await dividendToken.deployed();
    
    // Mint dividend tokens to the issuer for distribution
    await dividendToken.connect(tokenIssuer).mint(tokenIssuer.address, ethers.utils.parseEther("10000"));
    
    // Deploy the Dividend module
    const DividendFactory = await ethers.getContractFactory("DividendCheckpoint");
    dividendModule = await DividendFactory.deploy(token.address) as DividendCheckpoint;
    await dividendModule.deployed();
    
    // Set up roles and configure the dividend module
    await dividendModule.connect(deployer).setWallet(walletAddress.address);
    
    // Add admin role to tokenIssuer and operator role to tokenAgent 
    await dividendModule.connect(deployer).addAgent(tokenIssuer.address);
    await dividendModule.connect(deployer).addAgent(tokenAgent.address);
    
    // Pre-approve dividendToken for the module to spend
    await dividendToken.connect(tokenIssuer).approve(
      dividendModule.address, ethers.utils.parseEther("10000")
    );
  });

  describe("Module Initialization", function () {
    it("should be correctly initialized with the security token", async function () {
      expect(await dividendModule.securityToken()).to.equal(token.address);
    });

    it("should have the wallet address set correctly", async function () {
      expect(await dividendModule.wallet()).to.equal(walletAddress.address);
    });

    it("should have the agent role set up correctly", async function () {
      expect(await dividendModule.isAgent(tokenAgent.address)).to.equal(true);
    });
  });

  describe("Dividend Creation", function () {
    it("should create a dividend with default excluded addresses", async function () {
      // Create a dividend
      await expect(
        dividendModule.connect(tokenIssuer).createDividend(
          maturityTime,
          expiryTime,
          dividendToken.address,
          dividendAmount,
          dividendName
        )
      ).to.emit(dividendModule, "DividendDeposited");
        
      // Verify the dividend was created with the correct parameters
      const dividendData = await dividendModule.getDividendData(0);
      expect(dividendData.maturity).to.equal(maturityTime);
      expect(dividendData.expiry).to.equal(expiryTime);
      expect(dividendData.amount).to.equal(dividendAmount);
      expect(dividendData.name).to.equal(dividendName);
    });
    
    it("should create a dividend with custom excluded addresses", async function () {
      // Set excluded addresses
      await dividendModule.connect(deployer).setDefaultExcluded([charlieWallet.address]);
      
      // Create a dividend
      await dividendModule.connect(tokenIssuer).createDividend(
        maturityTime,
        expiryTime,
        dividendToken.address,
        dividendAmount,
        dividendName
      );
      
      // Verify the excluded address cannot claim
      expect(await dividendModule.isExcluded(charlieWallet.address, 0)).to.equal(true);
    });
    
    it("should fail to create a dividend with invalid parameters", async function () {
      // Invalid maturity (expiry before maturity)
      await expect(
        dividendModule.connect(tokenIssuer).createDividend(
          expiryTime,
          maturityTime,
          dividendToken.address,
          dividendAmount,
          dividendName
        )
      ).to.be.revertedWith("Expiry before maturity");
      
      // Invalid token address
      await expect(
        dividendModule.connect(tokenIssuer).createDividend(
          maturityTime,
          expiryTime,
          ethers.constants.AddressZero,
          dividendAmount,
          dividendName
        )
      ).to.be.revertedWith("Invalid token address");
      
      // Invalid amount (zero)
      await expect(
        dividendModule.connect(tokenIssuer).createDividend(
          maturityTime,
          expiryTime,
          dividendToken.address,
          0,
          dividendName
        )
      ).to.be.revertedWith("Zero dividend amount");
      
      // Invalid name (empty)
      await expect(
        dividendModule.connect(tokenIssuer).createDividend(
          maturityTime,
          expiryTime,
          dividendToken.address,
          dividendAmount,
          ethers.constants.HashZero
        )
      ).to.be.revertedWith("Empty name");
    });
  });

  describe("Withholding Tax Configuration", function () {
    it("should set withholding tax rates for individual investors", async function () {
      // Set withholding taxes (10% for Alice, 20% for Bob)
      const aliceTax = ethers.utils.parseEther("0.1"); // 10%
      const bobTax = ethers.utils.parseEther("0.2");   // 20%
      
      await expect(
        dividendModule.connect(deployer).setWithholding(
          [aliceWallet.address, bobWallet.address],
          [aliceTax, bobTax]
        )
      ).to.emit(dividendModule, "SetWithholding")
        .withArgs([aliceWallet.address, bobWallet.address], [aliceTax, bobTax]);
      
      // Verify the withholding tax rates were set correctly
      expect(await dividendModule.withholdingTax(aliceWallet.address)).to.equal(aliceTax);
      expect(await dividendModule.withholdingTax(bobWallet.address)).to.equal(bobTax);
    });
    
    it("should set the same withholding tax rate for multiple investors", async function () {
      // Set the same withholding tax (15%) for all investors
      const tax = ethers.utils.parseEther("0.15"); // 15%
      
      await expect(
        dividendModule.connect(deployer).setWithholdingFixed(
          [aliceWallet.address, bobWallet.address, charlieWallet.address],
          tax
        )
      ).to.emit(dividendModule, "SetWithholdingFixed")
        .withArgs([aliceWallet.address, bobWallet.address, charlieWallet.address], tax);
      
      // Verify the withholding tax rates were set correctly
      expect(await dividendModule.withholdingTax(aliceWallet.address)).to.equal(tax);
      expect(await dividendModule.withholdingTax(bobWallet.address)).to.equal(tax);
      expect(await dividendModule.withholdingTax(charlieWallet.address)).to.equal(tax);
    });
    
    it("should fail to set invalid withholding tax rates", async function () {
      // Invalid tax rate (> 100%)
      const invalidTax = ethers.utils.parseEther("1.1"); // 110%
      
      await expect(
        dividendModule.connect(deployer).setWithholding(
          [aliceWallet.address],
          [invalidTax]
        )
      ).to.be.revertedWith("Incorrect withholding tax");
      
      // Mismatched input lengths
      await expect(
        dividendModule.connect(deployer).setWithholding(
          [aliceWallet.address, bobWallet.address],
          [ethers.utils.parseEther("0.1")]
        )
      ).to.be.revertedWith("Mismatched input lengths");
    });
  });

  describe("Dividend Claiming", function () {
    beforeEach(async function () {
      // Mint some tokens to Alice and Bob for testing
      await token.connect(tokenAgent).mint(aliceWallet.address, ethers.utils.parseEther("500"));
      await token.connect(tokenAgent).mint(bobWallet.address, ethers.utils.parseEther("500"));
      
      // Create a mature dividend
      await dividendModule.connect(tokenIssuer).createDividend(
        Math.floor(Date.now() / 1000) - 50, // Mature (in the past)
        expiryTime,
        dividendToken.address,
        dividendAmount,
        dividendName
      );
    });
    
    it("should allow investors to claim dividends", async function () {
      // Initial balance
      const initialBalance = await dividendToken.balanceOf(aliceWallet.address);
      
      // Alice claims her dividend
      await expect(
        dividendModule.connect(aliceWallet).pullDividendPayment(0)
      ).to.emit(dividendModule, "DividendClaimed");
      
      // Final balance
      const finalBalance = await dividendToken.balanceOf(aliceWallet.address);
      
      // Verify Alice received her dividend
      expect(finalBalance.sub(initialBalance)).to.be.gt(0);
      
      // Verify the dividend is marked as claimed for Alice
      expect(await dividendModule.isClaimed(aliceWallet.address, 0)).to.equal(true);
    });
    
    it("should apply withholding tax when claiming", async function () {
      // Set withholding tax for Alice (10%)
      await dividendModule.connect(deployer).setWithholding(
        [aliceWallet.address],
        [ethers.utils.parseEther("0.1")] // 10%
      );
      
      // Initial balance
      const initialBalance = await dividendToken.balanceOf(aliceWallet.address);
      
      // Alice claims her dividend
      await dividendModule.connect(aliceWallet).pullDividendPayment(0);
      
      // Final balance
      const finalBalance = await dividendToken.balanceOf(aliceWallet.address);
      
      // Calculate expected dividend amount
      const aliceTokens = await token.balanceOf(aliceWallet.address);
      const totalSupply = await token.totalSupply();
      const expectedDividend = dividendAmount.mul(aliceTokens).div(totalSupply);
      const expectedWithheld = expectedDividend.mul(ethers.utils.parseEther("0.1")).div(ethers.utils.parseEther("1"));
      const expectedReceived = expectedDividend.sub(expectedWithheld);
      
      // Verify Alice received her dividend minus withholding tax
      expect(finalBalance.sub(initialBalance)).to.be.closeTo(
        expectedReceived,
        ethers.utils.parseEther("0.01") // Allow small rounding error
      );
    });
    
    it("should prevent claiming twice", async function () {
      // Alice claims her dividend
      await dividendModule.connect(aliceWallet).pullDividendPayment(0);
      
      // Try to claim again
      await expect(
        dividendModule.connect(aliceWallet).pullDividendPayment(0)
      ).to.be.revertedWith("Dividend already claimed");
    });
    
    it("should prevent claiming immature dividends", async function () {
      // Create a future dividend
      await dividendModule.connect(tokenIssuer).createDividend(
        maturityTime, // Not mature yet
        expiryTime,
        dividendToken.address,
        dividendAmount,
        ethers.utils.formatBytes32String("Future Dividend")
      );
      
      // Try to claim immature dividend
      await expect(
        dividendModule.connect(aliceWallet).pullDividendPayment(1)
      ).to.be.revertedWith("Dividend not mature yet");
    });
    
    it("should prevent claiming expired dividends", async function () {
      // Create a dividend with short expiry
      await dividendModule.connect(tokenIssuer).createDividend(
        Math.floor(Date.now() / 1000) - 100, // Mature (in the past)
        Math.floor(Date.now() / 1000) + 50,  // Will expire soon
        dividendToken.address,
        dividendAmount,
        ethers.utils.formatBytes32String("Short Dividend")
      );
      
      // Advance time to after expiry
      await ethers.provider.send("evm_increaseTime", [100]); // 100 seconds
      await ethers.provider.send("evm_mine", []);
      
      // Try to claim expired dividend
      await expect(
        dividendModule.connect(aliceWallet).pullDividendPayment(1)
      ).to.be.revertedWith("Dividend has expired");
    });
    
    it("should prevent excluded addresses from claiming", async function () {
      // Since we can't mint tokens to Charlie without identity verification,
      // let's modify our test to use an address that can get tokens
      // We'll use Alice for tokens, but exclude her from this specific dividend
      
      // Create a dividend with Alice excluded
      await dividendModule.connect(tokenIssuer).createDividendWithExclusions(
        Math.floor(Date.now() / 1000) - 50, // Mature (in the past)
        expiryTime,
        dividendToken.address,
        dividendAmount,
        [aliceWallet.address], // Exclude Alice instead of Charlie
        ethers.utils.formatBytes32String("Excluded Dividend")
      );
      
      // Try to claim as excluded address
      await expect(
        dividendModule.connect(aliceWallet).pullDividendPayment(1)
      ).to.be.revertedWith("Address is excluded from dividend");
    });
  });

  describe("Dividend Reclaiming", function () {
    beforeEach(async function () {
      // Create a dividend with short expiry
      await dividendModule.connect(tokenIssuer).createDividend(
        Math.floor(Date.now() / 1000) - 100, // Mature (in the past)
        Math.floor(Date.now() / 1000) + 50,  // Will expire soon
        dividendToken.address,
        dividendAmount,
        dividendName
      );
    });
    
    it("should allow reclaiming expired dividends", async function () {
      // Advance time to after expiry
      await ethers.provider.send("evm_increaseTime", [100]); // 100 seconds
      await ethers.provider.send("evm_mine", []);
      
      // Initial wallet balance
      const initialWalletBalance = await dividendToken.balanceOf(walletAddress.address);
      
      // Reclaim dividend
      await expect(
        dividendModule.connect(tokenAgent).reclaimDividend(0)
      ).to.emit(dividendModule, "DividendReclaimed");
      
      // Final wallet balance
      const finalWalletBalance = await dividendToken.balanceOf(walletAddress.address);
      
      // Verify wallet received the reclaimed amount
      expect(finalWalletBalance.sub(initialWalletBalance)).to.equal(dividendAmount);
    });
    
    it("should prevent reclaiming non-expired dividends", async function () {
      // Try to reclaim non-expired dividend
      await expect(
        dividendModule.connect(tokenAgent).reclaimDividend(0)
      ).to.be.revertedWith("Dividend not expired");
    });
    
    it("should prevent reclaiming already reclaimed dividends", async function () {
      // Advance time to after expiry
      await ethers.provider.send("evm_increaseTime", [100]); // 100 seconds
      await ethers.provider.send("evm_mine", []);
      
      // Reclaim dividend
      await dividendModule.connect(tokenAgent).reclaimDividend(0);
      
      // Try to reclaim again
      await expect(
        dividendModule.connect(tokenAgent).reclaimDividend(0)
      ).to.be.revertedWith("Already reclaimed");
    });
  });

  describe("Withholding Tax Withdrawal", function () {
    beforeEach(async function () {
      // Set withholding tax for all investors (10%)
      await dividendModule.connect(deployer).setWithholdingFixed(
        [aliceWallet.address, bobWallet.address],
        ethers.utils.parseEther("0.1") // 10%
      );
      
      // Create a dividend
      await dividendModule.connect(tokenIssuer).createDividend(
        Math.floor(Date.now() / 1000) - 50, // Mature (in the past)
        expiryTime,
        dividendToken.address,
        dividendAmount,
        dividendName
      );
      
      // Alice and Bob claim their dividends (withholding tax will be collected)
      await dividendModule.connect(aliceWallet).pullDividendPayment(0);
      await dividendModule.connect(bobWallet).pullDividendPayment(0);
    });
    
    it("should allow withdrawing withheld tax", async function () {
      // Initial wallet balance
      const initialWalletBalance = await dividendToken.balanceOf(walletAddress.address);
      
      // Withdraw withheld tax
      await expect(
        dividendModule.connect(tokenAgent).withdrawWithholding(0)
      ).to.emit(dividendModule, "DividendWithholdingWithdrawn");
      
      // Final wallet balance
      const finalWalletBalance = await dividendToken.balanceOf(walletAddress.address);
      
      // Calculate expected withheld amount
      const dividendData = await dividendModule.getDividendData(0);
      const expectedWithheldAmount = dividendData.amount.mul(ethers.utils.parseEther("0.1")).div(ethers.utils.parseEther("1"));        
      
      // Verify withheld amount was transferred to wallet
      expect(finalWalletBalance.sub(initialWalletBalance)).to.be.closeTo(
        expectedWithheldAmount, 
        ethers.utils.parseEther("0.01") // Allow small rounding error
      );
    });
    
    it("should prevent withdrawing already withdrawn tax", async function () {
      // Withdraw withheld tax
      await dividendModule.connect(tokenAgent).withdrawWithholding(0);
      
      // Initial wallet balance after first withdrawal
      const initialWalletBalance = await dividendToken.balanceOf(walletAddress.address);
      
      // Try to withdraw again
      await dividendModule.connect(tokenAgent).withdrawWithholding(0);
      
      // Final wallet balance
      const finalWalletBalance = await dividendToken.balanceOf(walletAddress.address);
      
      // No additional tokens should be transferred
      expect(finalWalletBalance).to.equal(initialWalletBalance);
    });
  });
  
  describe("Dividend Information", function () {
    beforeEach(async function () {
      // Create multiple dividends
      await dividendModule.connect(tokenIssuer).createDividend(
        maturityTime,
        expiryTime,
        dividendToken.address,
        dividendAmount,
        ethers.utils.formatBytes32String("Dividend 1")
      );
      
      await dividendModule.connect(tokenIssuer).createDividend(
        maturityTime + 100,
        expiryTime + 100,
        dividendToken.address,
        dividendAmount.mul(2),
        ethers.utils.formatBytes32String("Dividend 2")
      );
    });
    
    it("should return correct dividend data", async function () {
      const data = await dividendModule.getDividendData(1);
      
      expect(data.maturity).to.equal(maturityTime + 100);
      expect(data.expiry).to.equal(expiryTime + 100);
      expect(data.amount).to.equal(dividendAmount.mul(2));
      expect(data.name).to.equal(ethers.utils.formatBytes32String("Dividend 2"));
    });
    
    it("should return all dividends data", async function () {
      const allData = await dividendModule.getDividendsData();
      
      expect(allData.createds.length).to.equal(2);
      expect(allData.maturitys.length).to.equal(2);
      expect(allData.expirys.length).to.equal(2);
      expect(allData.amounts.length).to.equal(2);
      expect(allData.names.length).to.equal(2);
      expect(allData.tokens.length).to.equal(2);
      
      expect(allData.amounts[0]).to.equal(dividendAmount);
      expect(allData.amounts[1]).to.equal(dividendAmount.mul(2));
      
      expect(allData.names[0]).to.equal(ethers.utils.formatBytes32String("Dividend 1"));
      expect(allData.names[1]).to.equal(ethers.utils.formatBytes32String("Dividend 2"));
      
      expect(allData.tokens[0]).to.equal(dividendToken.address);
      expect(allData.tokens[1]).to.equal(dividendToken.address);
    });
    
    it("should return dividend progress information", async function () {
      // Create a dividend that is immediately mature
      await dividendModule.connect(tokenIssuer).createDividend(
        Math.floor(Date.now() / 1000) - 100, // Mature (in the past)
        expiryTime,
        dividendToken.address,
        dividendAmount,
        ethers.utils.formatBytes32String("Progress Test Dividend")
      );
      
      // First mint tokens to Alice
      if (!await token.balanceOf(aliceWallet.address)) {
        await token.connect(tokenAgent).mint(aliceWallet.address, ethers.utils.parseEther("500"));
      }
      
      // Now make Alice claim this dividend
      await dividendModule.connect(aliceWallet).pullDividendPayment(2); // This should be the 3rd dividend
      
      // Get progress information
      const progress = await dividendModule.getDividendProgress(2);
      
      // Verify progress information
      expect(progress.investors.length).to.be.greaterThan(0);
    });
    
    it("should update dividend dates", async function () {
      const newMaturity = maturityTime + 200;
      const newExpiry = expiryTime + 200;
      
      await expect(
        dividendModule.connect(deployer).updateDividendDates(0, newMaturity, newExpiry)
      ).to.emit(dividendModule, "UpdateDividendDates");
      
      const data = await dividendModule.getDividendData(0);
      expect(data.maturity).to.equal(newMaturity);
      expect(data.expiry).to.equal(newExpiry);
    });
    
    it("should fail to update expired dividends", async function () {
      // Create a dividend with short expiry
      await dividendModule.connect(tokenIssuer).createDividend(
        Math.floor(Date.now() / 1000) - 100, // Mature (in the past)
        Math.floor(Date.now() / 1000) + 50,  // Will expire soon
        dividendToken.address,
        dividendAmount,
        ethers.utils.formatBytes32String("Short Dividend")
      );
      
      // Advance time to after expiry
      await ethers.provider.send("evm_increaseTime", [100]); // 100 seconds
      await ethers.provider.send("evm_mine", []);
      
      // Try to update expired dividend
      await expect(
        dividendModule.connect(deployer).updateDividendDates(
          2, // The third dividend we just created
          maturityTime, 
          expiryTime
        )
      ).to.be.revertedWith("Dividend already expired");
    });
  });

  describe("Access Control", function () {
    it("should restrict dividend creation to admins", async function () {
      await expect(
        dividendModule.connect(aliceWallet).createDividend(
          maturityTime,
          expiryTime,
          dividendToken.address,
          dividendAmount,
          dividendName
        )
      ).to.be.revertedWith("Only admin can call");
    });
    
    it("should restrict reclaiming dividends to operators", async function () {
      // Create a dividend with future expiry
      await dividendModule.connect(tokenIssuer).createDividend(
        Math.floor(Date.now() / 1000) - 100, // Mature (in the past)
        Math.floor(Date.now() / 1000) + 1000,  // NOT expired (in the future)
        dividendToken.address,
        dividendAmount,
        dividendName
      );
      
      // Force expiry for testing
      await ethers.provider.send("evm_increaseTime", [2000]); // Fast forward 2000 seconds
      await ethers.provider.send("evm_mine", []);
      
      // Now attempt to reclaim as Alice (non-operator)
      await expect(
        dividendModule.connect(aliceWallet).reclaimDividend(0)
      ).to.be.revertedWith("Only operator can call");
    });
    
    it("should allow anyone to claim their dividends", async function () {
      // Create a mature dividend
      await dividendModule.connect(tokenIssuer).createDividend(
        Math.floor(Date.now() / 1000) - 100, // Mature (in the past)
        expiryTime,
        dividendToken.address,
        dividendAmount,
        dividendName
      );
      
      // Alice should be able to claim
      await expect(
        dividendModule.connect(aliceWallet).pullDividendPayment(0)
      ).to.not.be.reverted;
    });
  });
});
