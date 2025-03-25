import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { SecureSwap, TestERC20 } from "../../typechain-types";

// Helper function for EIP-712 signatures
async function signEIP712(
  domain: any,
  types: any,
  value: any,
  signer: SignerWithAddress
): Promise<string> {
  // Use the internal _signTypedData method from ethers.js
  // This creates a signature compatible with EIP-712
  return await signer._signTypedData(domain, types, value);
}

// Helper function to sign orders with EIP-712
async function signOrderEIP712(
  contract: SecureSwap,
  signer: SignerWithAddress,
  order: any
) {
  // Get domain data
  const domain = {
    name: "SecureSwap",
    version: "1.0",
    chainId: (await ethers.provider.getNetwork()).chainId,
    verifyingContract: contract.address
  };

  // Define types for EIP-712
  const types = {
    Order: [
      { name: "maker", type: "address" },
      { name: "makerToken", type: "address" },
      { name: "makerAmount", type: "uint256" },
      { name: "taker", type: "address" },
      { name: "takerToken", type: "address" },
      { name: "takerAmount", type: "uint256" },
      { name: "makerNonce", type: "uint256" },
      { name: "takerNonce", type: "uint256" },
      { name: "expiry", type: "uint256" }
    ]
  };

  // Sign typed data according to EIP-712
  return await signer._signTypedData(domain, types, order);
}

describe("SecureSwap", function () {
  async function deploySecureSwapFixture() {
    // Get signers
    const [owner, maker, taker, relayer, feeCollector] = await ethers.getSigners();

    // Deploy test tokens
    const tokenFactory = await ethers.getContractFactory("TestERC20");
    const tokenA = await tokenFactory.deploy("TokenA", "TKA");
    const tokenB = await tokenFactory.deploy("TokenB", "TKB");

    // Deploy SecureSwap contract
    const secureSwapFactory = await ethers.getContractFactory("SecureSwap");
    const secureSwap = await secureSwapFactory.deploy();

    // Mint tokens to maker and taker
    const mintAmount = ethers.utils.parseEther("1000");
    await tokenA.mint(maker.address, mintAmount);
    await tokenB.mint(taker.address, mintAmount);

    // Set fees
    await secureSwap.modifyFee(
      tokenA.address,
      tokenB.address,
      200, // 2% fee for token A
      300, // 3% fee for token B
      4,   // base 10^4 (so 2% = 200/10^4)
      feeCollector.address,
      feeCollector.address
    );

    return { secureSwap, tokenA, tokenB, owner, maker, taker, relayer, feeCollector };
  }

  describe("DVD Transfer", function () {
    it("Should allow standard DVD transfers", async function () {
      const { secureSwap, tokenA, tokenB, maker, taker } = await loadFixture(deploySecureSwapFixture);
      
      // Using smaller amounts to avoid fee overflow
      const makerAmount = ethers.utils.parseEther("10");
      const takerAmount = ethers.utils.parseEther("20");
      
      // Approve tokens
      await tokenA.connect(maker).approve(secureSwap.address, makerAmount);
      await tokenB.connect(taker).approve(secureSwap.address, takerAmount);
      
      // Initiate transfer
      await secureSwap.connect(maker).initiateDVDTransfer(
        tokenA.address,
        makerAmount,
        taker.address,
        tokenB.address,
        takerAmount
      );

      // Get the transfer ID (nonce is 0)
      const transferID = await secureSwap.calculateTransferID(
        0,
        maker.address,
        tokenA.address,
        makerAmount,
        taker.address,
        tokenB.address,
        takerAmount
      );
      
      // Execute transfer
      await secureSwap.connect(taker).takeDVDTransfer(transferID);
      
      // Check balances
      expect(await tokenA.balanceOf(taker.address)).to.equal(makerAmount.mul(98).div(100)); // 2% fee
      expect(await tokenB.balanceOf(maker.address)).to.equal(takerAmount.mul(97).div(100)); // 3% fee
    });
  });

  describe("Signed Orders", function () {
    it("Should execute orders with valid EIP-712 signatures from maker and taker", async function () {
      const { secureSwap, tokenA, tokenB, maker, taker, relayer, feeCollector } = await loadFixture(deploySecureSwapFixture);
      
      const makerAmount = ethers.utils.parseEther("50");
      const takerAmount = ethers.utils.parseEther("100");
      const makerNonce = 1;
      const takerNonce = 1;
      const expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      
      // Create the order
      const order = {
        maker: maker.address,
        makerToken: tokenA.address,
        makerAmount: makerAmount,
        taker: taker.address,
        takerToken: tokenB.address,
        takerAmount: takerAmount,
        makerNonce: makerNonce,
        takerNonce: takerNonce,
        expiry: expiry
      };
      
      // Set up domain separator for EIP-712
      const domain = {
        name: "SecureSwap",
        version: "1.0",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: secureSwap.address
      };
      
      // Define types for EIP-712
      const types = {
        Order: [
          { name: "maker", type: "address" },
          { name: "makerToken", type: "address" },
          { name: "makerAmount", type: "uint256" },
          { name: "taker", type: "address" },
          { name: "takerToken", type: "address" },
          { name: "takerAmount", type: "uint256" },
          { name: "makerNonce", type: "uint256" },
          { name: "takerNonce", type: "uint256" },
          { name: "expiry", type: "uint256" }
        ]
      };
      
      // Sign using EIP-712
      const makerSignature = await signEIP712(domain, types, order, maker);
      const takerSignature = await signEIP712(domain, types, order, taker);
      
      // Get the order hash for verification in events
      const orderHash = await secureSwap.hashOrder(order);

      // Approve tokens
      await tokenA.connect(maker).approve(secureSwap.address, makerAmount);
      await tokenB.connect(taker).approve(secureSwap.address, takerAmount);
      
      // Check balances before
      const makerTokenABefore = await tokenA.balanceOf(maker.address);
      const takerTokenBBefore = await tokenB.balanceOf(taker.address);
      const makerTokenBBefore = await tokenB.balanceOf(maker.address);
      const takerTokenABefore = await tokenA.balanceOf(taker.address);
      
      // Execute the order through the relayer
      await secureSwap.connect(relayer).executeSignedOrder(
        order,
        makerSignature,
        takerSignature
      );
      
      // Calculate expected fees
      const makerFee = makerAmount.mul(200).div(10000); // 2% fee
      const takerFee = takerAmount.mul(300).div(10000); // 3% fee
      
      // Check balances after
      expect(await tokenA.balanceOf(maker.address)).to.equal(makerTokenABefore.sub(makerAmount));
      expect(await tokenB.balanceOf(taker.address)).to.equal(takerTokenBBefore.sub(takerAmount));
      expect(await tokenA.balanceOf(taker.address)).to.equal(takerTokenABefore.add(makerAmount.sub(makerFee)));
      expect(await tokenB.balanceOf(maker.address)).to.equal(makerTokenBBefore.add(takerAmount.sub(takerFee)));
      expect(await tokenA.balanceOf(feeCollector.address)).to.equal(makerFee);
      expect(await tokenB.balanceOf(feeCollector.address)).to.equal(takerFee);
      
      // Check that nonces are used
      expect(await secureSwap.usedNonces(maker.address, makerNonce)).to.be.true;
      expect(await secureSwap.usedNonces(taker.address, takerNonce)).to.be.true;
    });

    it("Should reject orders with expired timestamps", async function () {
      const { secureSwap, tokenA, tokenB, maker, taker, relayer } = await loadFixture(deploySecureSwapFixture);
      
      const makerAmount = ethers.utils.parseEther("50");
      const takerAmount = ethers.utils.parseEther("100");
      const makerNonce = 2;
      const takerNonce = 2;
      const expiry = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago (expired)
      
      // Create the order
      const order = {
        maker: maker.address,
        makerToken: tokenA.address,
        makerAmount: makerAmount,
        taker: taker.address,
        takerToken: tokenB.address,
        takerAmount: takerAmount,
        makerNonce: makerNonce,
        takerNonce: takerNonce,
        expiry: expiry
      };
      
      // Get the order hash
      const orderHash = await secureSwap.hashOrder(order);
      
      // Sign the order hash
      const makerSignature = await maker.signMessage(ethers.utils.arrayify(
        ethers.utils.solidityKeccak256(
          ["string", "bytes32"],
          ["\x19Ethereum Signed Message:\n32", orderHash]
        )
      ));
      
      const takerSignature = await taker.signMessage(ethers.utils.arrayify(
        ethers.utils.solidityKeccak256(
          ["string", "bytes32"],
          ["\x19Ethereum Signed Message:\n32", orderHash]
        )
      ));

      // Approve tokens
      await tokenA.connect(maker).approve(secureSwap.address, makerAmount);
      await tokenB.connect(taker).approve(secureSwap.address, takerAmount);
      
      // Execute the order through the relayer (should fail)
      await expect(secureSwap.connect(relayer).executeSignedOrder(
        order,
        makerSignature,
        takerSignature
      )).to.be.revertedWith("Order expired");
    });

    it("Should prevent replay attacks by using nonces", async function () {
      const { secureSwap, tokenA, tokenB, maker, taker, relayer } = await loadFixture(deploySecureSwapFixture);
      
      const makerAmount = ethers.utils.parseEther("50");
      const takerAmount = ethers.utils.parseEther("100");
      const makerNonce = 3;
      const takerNonce = 3;
      const expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      
      // Create the order
      const order = {
        maker: maker.address,
        makerToken: tokenA.address,
        makerAmount: makerAmount,
        taker: taker.address,
        takerToken: tokenB.address,
        takerAmount: takerAmount,
        makerNonce: makerNonce,
        takerNonce: takerNonce,
        expiry: expiry
      };
      
      // Set up domain separator for EIP-712
      const domain = {
        name: "SecureSwap",
        version: "1.0",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: secureSwap.address
      };
      
      // Define types for EIP-712
      const types = {
        Order: [
          { name: "maker", type: "address" },
          { name: "makerToken", type: "address" },
          { name: "makerAmount", type: "uint256" },
          { name: "taker", type: "address" },
          { name: "takerToken", type: "address" },
          { name: "takerAmount", type: "uint256" },
          { name: "makerNonce", type: "uint256" },
          { name: "takerNonce", type: "uint256" },
          { name: "expiry", type: "uint256" }
        ]
      };
      
      // Sign with EIP-712
      const makerSignature = await signEIP712(domain, types, order, maker);
      const takerSignature = await signEIP712(domain, types, order, taker);

      // Approve tokens
      await tokenA.connect(maker).approve(secureSwap.address, makerAmount.mul(2));
      await tokenB.connect(taker).approve(secureSwap.address, takerAmount.mul(2));
      
      // Execute the order first time (should succeed)
      await secureSwap.connect(relayer).executeSignedOrder(
        order,
        makerSignature,
        takerSignature
      );
      
      // Execute the order second time (should fail due to used nonces)
      await expect(secureSwap.connect(relayer).executeSignedOrder(
        order,
        makerSignature,
        takerSignature
      )).to.be.revertedWith("Maker nonce already used");
    });

    it("Should allow maker to cancel an order", async function () {
      const { secureSwap, tokenA, tokenB, maker, taker, relayer } = await loadFixture(deploySecureSwapFixture);
      
      const makerAmount = ethers.utils.parseEther("50");
      const takerAmount = ethers.utils.parseEther("100");
      const makerNonce = 4;
      const takerNonce = 4;
      const expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      
      // Create the order
      const order = {
        maker: maker.address,
        makerToken: tokenA.address,
        makerAmount: makerAmount,
        taker: taker.address,
        takerToken: tokenB.address,
        takerAmount: takerAmount,
        makerNonce: makerNonce,
        takerNonce: takerNonce,
        expiry: expiry
      };
      
      // Set up domain separator for EIP-712
      const domain = {
        name: "SecureSwap",
        version: "1.0",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: secureSwap.address
      };
      
      // Define types for EIP-712
      const types = {
        Order: [
          { name: "maker", type: "address" },
          { name: "makerToken", type: "address" },
          { name: "makerAmount", type: "uint256" },
          { name: "taker", type: "address" },
          { name: "takerToken", type: "address" },
          { name: "takerAmount", type: "uint256" },
          { name: "makerNonce", type: "uint256" },
          { name: "takerNonce", type: "uint256" },
          { name: "expiry", type: "uint256" }
        ]
      };
      
      // Sign using EIP-712
      const makerSignature = await signEIP712(domain, types, order, maker);
      const takerSignature = await signEIP712(domain, types, order, taker);
      
      // Get the order hash for verification
      const orderHash = await secureSwap.hashOrder(order);
      
      // Cancel the order
      await secureSwap.connect(maker).cancelSignedOrder(order, makerSignature);
      
      // Approve tokens
      await tokenA.connect(maker).approve(secureSwap.address, makerAmount);
      await tokenB.connect(taker).approve(secureSwap.address, takerAmount);
      
      // Execute the order (should fail due to cancelled order)
      await expect(secureSwap.connect(relayer).executeSignedOrder(
        order,
        makerSignature,
        takerSignature
      )).to.be.revertedWith("Maker nonce already used");
      
      // Verify the nonce has been marked as used
      expect(await secureSwap.usedNonces(maker.address, makerNonce)).to.be.true;
    });

    it("Should allow taker to cancel an order", async function () {
      const { secureSwap, tokenA, tokenB, maker, taker, relayer } = await loadFixture(deploySecureSwapFixture);
      
      const makerAmount = ethers.utils.parseEther("50");
      const takerAmount = ethers.utils.parseEther("100");
      const makerNonce = 5;
      const takerNonce = 5;
      const expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      
      // Create the order
      const order = {
        maker: maker.address,
        makerToken: tokenA.address,
        makerAmount: makerAmount,
        taker: taker.address,
        takerToken: tokenB.address,
        takerAmount: takerAmount,
        makerNonce: makerNonce,
        takerNonce: takerNonce,
        expiry: expiry
      };
      
      // Set up domain separator for EIP-712
      const domain = {
        name: "SecureSwap",
        version: "1.0",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: secureSwap.address
      };
      
      // Define types for EIP-712
      const types = {
        Order: [
          { name: "maker", type: "address" },
          { name: "makerToken", type: "address" },
          { name: "makerAmount", type: "uint256" },
          { name: "taker", type: "address" },
          { name: "takerToken", type: "address" },
          { name: "takerAmount", type: "uint256" },
          { name: "makerNonce", type: "uint256" },
          { name: "takerNonce", type: "uint256" },
          { name: "expiry", type: "uint256" }
        ]
      };
      
      // Sign with EIP-712
      const makerSignature = await signEIP712(domain, types, order, maker);
      const takerSignature = await signEIP712(domain, types, order, taker);

      // Cancel the order
      await secureSwap.connect(taker).cancelSignedOrder(order, takerSignature);
      
      // Approve tokens
      await tokenA.connect(maker).approve(secureSwap.address, makerAmount);
      await tokenB.connect(taker).approve(secureSwap.address, takerAmount);
      
      // Execute the order (should fail due to cancelled order)
      await expect(secureSwap.connect(relayer).executeSignedOrder(
        order,
        makerSignature,
        takerSignature
      )).to.be.revertedWith("Taker nonce already used");
      
      // Verify the nonce has been marked as used
      expect(await secureSwap.usedNonces(taker.address, takerNonce)).to.be.true;
    });

    it("Should reject orders with invalid maker signature", async function () {
      const { secureSwap, tokenA, tokenB, maker, taker, relayer, owner } = await loadFixture(deploySecureSwapFixture);
      
      const makerAmount = ethers.utils.parseEther("50");
      const takerAmount = ethers.utils.parseEther("100");
      const makerNonce = 6;
      const takerNonce = 6;
      const expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      
      // Create the order
      const order = {
        maker: maker.address,
        makerToken: tokenA.address,
        makerAmount: makerAmount,
        taker: taker.address,
        takerToken: tokenB.address,
        takerAmount: takerAmount,
        makerNonce: makerNonce,
        takerNonce: takerNonce,
        expiry: expiry
      };
      
      // Set up domain separator for EIP-712
      const domain = {
        name: "SecureSwap",
        version: "1.0",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: secureSwap.address
      };
      
      // Define types for EIP-712
      const types = {
        Order: [
          { name: "maker", type: "address" },
          { name: "makerToken", type: "address" },
          { name: "makerAmount", type: "uint256" },
          { name: "taker", type: "address" },
          { name: "takerToken", type: "address" },
          { name: "takerAmount", type: "uint256" },
          { name: "makerNonce", type: "uint256" },
          { name: "takerNonce", type: "uint256" },
          { name: "expiry", type: "uint256" }
        ]
      };
      
      // Sign with wrong signer (owner instead of maker)
      const invalidMakerSignature = await signEIP712(domain, types, order, owner);
      const takerSignature = await signEIP712(domain, types, order, taker);

      // Approve tokens
      await tokenA.connect(maker).approve(secureSwap.address, makerAmount);
      await tokenB.connect(taker).approve(secureSwap.address, takerAmount);
      
      // Execute the order (should fail due to invalid maker signature)
      await expect(secureSwap.connect(relayer).executeSignedOrder(
        order,
        invalidMakerSignature,
        takerSignature
      )).to.be.revertedWith("Invalid maker signature");
    });

    it("Should reject orders with invalid taker signature", async function () {
      const { secureSwap, tokenA, tokenB, maker, taker, relayer, owner } = await loadFixture(deploySecureSwapFixture);
      
      const makerAmount = ethers.utils.parseEther("50");
      const takerAmount = ethers.utils.parseEther("100");
      const makerNonce = 7;
      const takerNonce = 7;
      const expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      
      // Create the order
      const order = {
        maker: maker.address,
        makerToken: tokenA.address,
        makerAmount: makerAmount,
        taker: taker.address,
        takerToken: tokenB.address,
        takerAmount: takerAmount,
        makerNonce: makerNonce,
        takerNonce: takerNonce,
        expiry: expiry
      };
      
      // Set up domain separator for EIP-712
      const domain = {
        name: "SecureSwap",
        version: "1.0",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: secureSwap.address
      };
      
      // Define types for EIP-712
      const types = {
        Order: [
          { name: "maker", type: "address" },
          { name: "makerToken", type: "address" },
          { name: "makerAmount", type: "uint256" },
          { name: "taker", type: "address" },
          { name: "takerToken", type: "address" },
          { name: "takerAmount", type: "uint256" },
          { name: "makerNonce", type: "uint256" },
          { name: "takerNonce", type: "uint256" },
          { name: "expiry", type: "uint256" }
        ]
      };
      
      // Valid maker signature
      const makerSignature = await signEIP712(domain, types, order, maker);
      
      // Invalid taker signature (signed by owner instead of taker)
      const invalidTakerSignature = await signEIP712(domain, types, order, owner);

      // Approve tokens
      await tokenA.connect(maker).approve(secureSwap.address, makerAmount);
      await tokenB.connect(taker).approve(secureSwap.address, takerAmount);
      
      // Execute the order (should fail due to invalid taker signature)
      await expect(secureSwap.connect(relayer).executeSignedOrder(
        order,
        makerSignature,
        invalidTakerSignature
      )).to.be.revertedWith("Invalid taker signature");
    });

    it("Should fail if maker has insufficient balance", async function () {
      const { secureSwap, tokenA, tokenB, maker, taker, relayer } = await loadFixture(deploySecureSwapFixture);
      
      // Amount exceeds balance
      const makerAmount = ethers.utils.parseEther("2000"); // More than the 1000 minted
      const takerAmount = ethers.utils.parseEther("100");
      const makerNonce = 8;
      const takerNonce = 8;
      const expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      
      // Create the order
      const order = {
        maker: maker.address,
        makerToken: tokenA.address,
        makerAmount: makerAmount,
        taker: taker.address,
        takerToken: tokenB.address,
        takerAmount: takerAmount,
        makerNonce: makerNonce,
        takerNonce: takerNonce,
        expiry: expiry
      };
      
      // Set up domain separator for EIP-712
      const domain = {
        name: "SecureSwap",
        version: "1.0",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: secureSwap.address
      };
      
      // Define types for EIP-712
      const types = {
        Order: [
          { name: "maker", type: "address" },
          { name: "makerToken", type: "address" },
          { name: "makerAmount", type: "uint256" },
          { name: "taker", type: "address" },
          { name: "takerToken", type: "address" },
          { name: "takerAmount", type: "uint256" },
          { name: "makerNonce", type: "uint256" },
          { name: "takerNonce", type: "uint256" },
          { name: "expiry", type: "uint256" }
        ]
      };
      
      // Sign with EIP-712
      const makerSignature = await signEIP712(domain, types, order, maker);
      const takerSignature = await signEIP712(domain, types, order, taker);

      // Approve tokens (even though balance is insufficient)
      await tokenA.connect(maker).approve(secureSwap.address, makerAmount);
      await tokenB.connect(taker).approve(secureSwap.address, takerAmount);
      
      // Execute the order (should fail due to insufficient balance)
      await expect(secureSwap.connect(relayer).executeSignedOrder(
        order,
        makerSignature,
        takerSignature
      )).to.be.revertedWith("Maker: insufficient balance");
    });

    it("Should emit correct event when executing a signed order", async function () {
      const { secureSwap, tokenA, tokenB, maker, taker, relayer } = await loadFixture(deploySecureSwapFixture);
      
      const makerAmount = ethers.utils.parseEther("50");
      const takerAmount = ethers.utils.parseEther("100");
      const makerNonce = 10;
      const takerNonce = 10;
      const expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      
      // Create the order
      const order = {
        maker: maker.address,
        makerToken: tokenA.address,
        makerAmount: makerAmount,
        taker: taker.address,
        takerToken: tokenB.address,
        takerAmount: takerAmount,
        makerNonce: makerNonce,
        takerNonce: takerNonce,
        expiry: expiry
      };
      
      // Set up domain separator for EIP-712
      const domain = {
        name: "SecureSwap",
        version: "1.0",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: secureSwap.address
      };
      
      // Define types for EIP-712
      const types = {
        Order: [
          { name: "maker", type: "address" },
          { name: "makerToken", type: "address" },
          { name: "makerAmount", type: "uint256" },
          { name: "taker", type: "address" },
          { name: "takerToken", type: "address" },
          { name: "takerAmount", type: "uint256" },
          { name: "makerNonce", type: "uint256" },
          { name: "takerNonce", type: "uint256" },
          { name: "expiry", type: "uint256" }
        ]
      };
      
      // Sign with EIP-712
      const makerSignature = await signEIP712(domain, types, order, maker);
      const takerSignature = await signEIP712(domain, types, order, taker);
      
      // Get the order hash for event verification
      const orderHash = await secureSwap.hashOrder(order);

      // Approve tokens
      await tokenA.connect(maker).approve(secureSwap.address, makerAmount);
      await tokenB.connect(taker).approve(secureSwap.address, takerAmount);
      
      // Calculate expected fees
      const makerFee = makerAmount.mul(200).div(10000); // 2% fee
      const takerFee = takerAmount.mul(300).div(10000); // 3% fee
      
      // Execute the order and verify emitted event
      await expect(secureSwap.connect(relayer).executeSignedOrder(
        order,
        makerSignature,
        takerSignature
      )).to.emit(secureSwap, 'SignedOrderExecuted')
        .withArgs(
          orderHash,
          maker.address,
          tokenA.address,
          makerAmount,
          taker.address,
          tokenB.address,
          takerAmount,
          makerFee,
          takerFee
        );
    });
  });
});
