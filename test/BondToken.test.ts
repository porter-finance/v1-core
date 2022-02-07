import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BondToken__factory, BondToken } from "../typechain";

describe("Token contract", function () {
  let bondToken: BondToken;
  let owner: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addr2: SignerWithAddress;
  let addrs: SignerWithAddress[];

  beforeEach(async function () {
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

    const bondTokenFactory = (await ethers.getContractFactory(
      "BondToken",
      owner
    )) as BondToken__factory;
    const totalSupply = (10 ** 9).toString();
    bondToken = await bondTokenFactory.deploy(
      ethers.utils.parseEther(totalSupply),
      "Porter Bond Test Token",
      "PBOND"
    );
  });

  describe("Deployment", function () {
    it("Should assign the total supply of tokens to the owner", async function () {
      const ownerBalance = await bondToken.balanceOf(owner.address);
      expect(await bondToken.totalSupply()).to.equal(ownerBalance);
    });
  });

  describe("Transactions", function () {
    it("Should transfer tokens between accounts", async function () {
      // Transfer 50 tokens from owner to addr1
      await bondToken.transfer(addr1.address, 50);
      const addr1Balance = await bondToken.balanceOf(addr1.address);
      expect(addr1Balance).to.equal(50);

      // Transfer 50 tokens from addr1 to addr2
      // We use .connect(signer) to send a transaction from another account
      await bondToken.connect(addr1).transfer(addr2.address, 50);
      const addr2Balance = await bondToken.balanceOf(addr2.address);
      expect(addr2Balance).to.equal(50);
    });

    it("Should fail if sender doesn’t have enough tokens", async function () {
      const initialOwnerBalance = await bondToken.balanceOf(owner.address);

      // Try to send 1 token from addr1 (0 tokens) to owner (1000 tokens).
      // `require` will evaluate false and revert the transaction.
      await expect(
        bondToken.connect(addr1).transfer(owner.address, 1)
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");

      // Owner balance shouldn't have changed.
      expect(await bondToken.balanceOf(owner.address)).to.equal(
        initialOwnerBalance
      );
    });

    it("Should update balances after transfers", async function () {
      const initialOwnerBalance = await bondToken.balanceOf(owner.address);

      // Transfer 100 tokens from owner to addr1.
      await bondToken.transfer(addr1.address, 100);

      // Transfer another 50 tokens from owner to addr2.
      await bondToken.transfer(addr2.address, 50);

      // Check balances.
      const finalOwnerBalance = await bondToken.balanceOf(owner.address);
      expect(finalOwnerBalance).to.equal(initialOwnerBalance.sub(150));

      const addr1Balance = await bondToken.balanceOf(addr1.address);
      expect(addr1Balance).to.equal(100);

      const addr2Balance = await bondToken.balanceOf(addr2.address);
      expect(addr2Balance).to.equal(50);
    });
  });
});
