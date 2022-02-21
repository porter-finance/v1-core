import { BigNumber } from "ethers";
import { expect } from "chai";
import { TestERC20 } from "../typechain";
import { SimpleBond } from "../typechain";
import { CollateralData, getEventArgumentsFromTransaction } from "./utilities";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { bondFactoryFixture, collateralTokenFixture } from "./shared/fixtures";

// https://ethereum-waffle.readthedocs.io/en/latest/fixtures.html
// import from waffle since we are using hardhat: https://hardhat.org/plugins/nomiclabs-hardhat-waffle.html#environment-extensions
const { ethers, waffle } = require("hardhat");
const { loadFixture } = waffle;

describe("BondFactoryClone", async () => {
  // will need updating from the contract if the enum changes
  const BondStanding = {
    GOOD: 0,
    DEFAULTED: 1,
    PAID: 2,
    REDEEMED: 3,
  };

  // 3 years from now, in seconds
  const maturityDate = Math.round(
    new Date(new Date().setFullYear(new Date().getFullYear() + 3)).getTime() /
      1000
  );

  // A realistic number for this is like 2m
  const totalBondSupply = 12500;
  const bondShares = 1000;

  const name = "My Token";
  const symbol = "MTKN";
  let bond: SimpleBond;
  let owner: SignerWithAddress;
  let issuer: SignerWithAddress;
  let payee: SignerWithAddress;
  let eve: SignerWithAddress;
  let collateralData: CollateralData;
  let collateralToken: TestERC20;

  // no args because of gh issue:
  // https://github.com/nomiclabs/hardhat/issues/849#issuecomment-860576796
  async function fixture() {
    const { factory } = await bondFactoryFixture();
    ({ collateralData, collateralToken } = await collateralTokenFixture());

    const [owner, issuer] = await ethers.getSigners();

    const tx1 = await factory.createBond(
      name,
      symbol,
      totalBondSupply,
      maturityDate,
      owner.address,
      issuer.address,
      collateralData.collateralAddress,
      BigNumber.from(150),
      false,
      ethers.constants.AddressZero,
      BigNumber.from(1250)
    );

    const [newBondAddress] = await getEventArgumentsFromTransaction(
      tx1,
      "BondCreated"
    );

    const bond = await ethers.getContractAt(
      "SimpleBond",
      newBondAddress,
      owner
    );

    // Handing out some shares, should be done on the Auction level
    await bond.transfer(issuer.address, bondShares);

    return { bond };
  }

  beforeEach(async () => {
    [owner, issuer, payee, eve] = await ethers.getSigners();
    ({ bond } = await loadFixture(fixture));
  });

  describe("basic contract function", async () => {
    it("should have total supply less bond issuance in owner account", async function () {
      expect(await bond.balanceOf(owner.address)).to.be.equal(
        totalBondSupply - bondShares
      );
    });
    it("should have bond issuance in issuer address", async function () {
      expect(await bond.balanceOf(issuer.address)).to.be.equal(bondShares);
    });

    it("should be owner", async function () {
      expect(await bond.owner()).to.be.equal(owner.address);
    });

    it("should return total value for an account", async function () {
      expect(await bond.connect(payee).balanceOf(issuer.address)).to.be.equal(
        bondShares
      );
    });

    it("should return payment due date", async function () {
      expect(await bond.connect(payee).maturityDate()).to.be.equal(
        maturityDate
      );
    });
  });

  describe("bond standing", async () => {
    it("should be default to GOOD", async function () {
      expect(await bond.connect(payee).currentBondStanding()).to.be.equal(
        BondStanding.GOOD
      );
    });

    it("should allow setter from owner", async function () {
      expect(await bond.currentBondStanding()).to.be.equal(BondStanding.GOOD);

      await bond.setBondStanding(BondStanding.PAID);

      expect(await bond.currentBondStanding()).to.be.equal(BondStanding.PAID);
    });

    it("should emit an event on setting", async function () {
      expect(await bond.currentBondStanding()).to.be.equal(BondStanding.GOOD);

      expect(await bond.setBondStanding(BondStanding.PAID))
        .to.emit(bond, "BondStandingChange")
        .withArgs(BondStanding.GOOD, BondStanding.PAID);
    });

    it("should only set by owner", async function () {
      const payeeBond = await bond.connect(payee);

      expect(payeeBond.setBondStanding(BondStanding.PAID)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    // failing until hooked up with auction
    it("should repay and return REPAID", async function () {
      // quick check to make sure payTo has a bond issued
      expect(await bond.balanceOf(issuer.address)).to.be.equal(bondShares);

      // and that it's not already paid off
      expect(await bond.currentBondStanding()).to.be.equal(BondStanding.GOOD);

      // TODO: This should repay using auction contract
      // await auctionContract.repay(address)...
      expect(await bond.currentBondStanding()).to.be.equal(BondStanding.PAID);
    });
  });

  describe("core function", async () => {
    // failing until hooked up with auction
    it("should redeem bond at maturity", async function () {
      // Connect the pay account to this contract
      const payeeBond = bond.connect(payee);

      // quick check to make sure payTo has a bond issued
      expect(await payeeBond.balanceOf(issuer.address)).to.be.equal(bondShares);

      // and that it's not already paid off
      expect(await payeeBond.currentBondStanding()).to.be.equal(
        BondStanding.GOOD
      );
      // This should repay using auction contract
      // await auctionContract.repay(address)...
      expect(await payeeBond.currentBondStanding()).to.be.equal(
        BondStanding.PAID
      );

      // TODO: this should approve the token payment not the bond token?
      await payeeBond.approve(issuer.address, bondShares);

      // Pays 1:1 to the bond token
      await payee.sendTransaction({
        to: payeeBond.address,
        value: bondShares,
      });

      // Fast forward to expire
      await ethers.provider.send("evm_mine", [maturityDate]);

      const currentBal = await payee.getBalance();
      expect(await payeeBond.redeem(bondShares))
        .to.emit(payeeBond, "Redeem")
        .withArgs(bondShares);

      expect(await bond.setBondStanding(BondStanding.PAID))
        .to.emit(bond, "BondStandingChange")
        .withArgs(BondStanding.GOOD, BondStanding.PAID);

      // This is failing, likely because sendTransaction isn't sending value in
      // a format it's expecting? not sure
      expect(await payee.getBalance()).to.be.equal(currentBal.add(bondShares));

      expect(await payeeBond.currentBondStanding()).to.be.equal(3);
    });
  });

  describe("collateralize", async () => {
    it("deposits collateral", async () => {
      const amountToDeposit = 1000;
      await collateralToken
        .connect(issuer)
        .approve(bond.address, amountToDeposit);
      const { amount } = await getEventArgumentsFromTransaction(
        await bond.connect(issuer).collateralize(amountToDeposit),
        "CollateralDeposited"
      );
      expect(amount).to.be.equal(amountToDeposit);
    });
  });

  describe("repayment", async () => {
    it("deposits repayment", async () => {
      const { amount } = await getEventArgumentsFromTransaction(
        await bond.connect(issuer).repay(100),
        "RepaymentDeposited"
      );
      expect(amount).to.equal(100);
    });
    it("bars unauthorized access", async () => {
      // check revert from non-bond signer
      await expect(bond.connect(eve).repay(100)).to.be.reverted;

      // check revert with specific error name
      await expect(bond.connect(eve).repay(100)).to.be.revertedWith(
        "OnlyIssuerOfBondMayCallThisFunction"
      );
    });
  });
});
