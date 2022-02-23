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
  let bond: SimpleBond;
  let owner: SignerWithAddress;
  let issuer: SignerWithAddress;
  let bondHolder: SignerWithAddress;
  let attacker: SignerWithAddress;
  let collateralData: CollateralData;
  let collateralToken: TestERC20;
  const BondConfig = {
    totalBondSupply: 2000000,
    collateralizationRatio: 200,
    convertibilityRatio: 50,
  };
  const getBondContract = async (tx: Promise<any>) => {
    const [owner] = await ethers.getSigners();
    const [newBondAddress] = await getEventArgumentsFromTransaction(
      await tx,
      "BondCreated"
    );

    return await ethers.getContractAt("SimpleBond", newBondAddress, owner);
  };
  // no args because of gh issue:
  // https://github.com/nomiclabs/hardhat/issues/849#issuecomment-860576796
  async function fixture() {
    const { factory } = await bondFactoryFixture();
    ({ collateralData, collateralToken } = await collateralTokenFixture());

    const [owner, issuer] = await ethers.getSigners();

    const bond = await getBondContract(
      factory.createBond(
        BondConfig.totalBondSupply,
        maturityDate,
        owner.address,
        issuer.address,
        collateralData.collateralAddress,
        BigNumber.from(BondConfig.collateralizationRatio),
        false,
        BigNumber.from(BondConfig.convertibilityRatio),
        ethers.constants.AddressZero,
        BigNumber.from(BondConfig.totalBondSupply)
      )
    );

    return { bond };
  }

  beforeEach(async () => {
    [owner, issuer, bondHolder, attacker] = await ethers.getSigners();
    ({ bond } = await loadFixture(fixture));
  });

  describe("basic contract function", async () => {
    it("should have no minted coins", async function () {
      expect(await bond.balanceOf(owner.address)).to.be.equal(0);
    });

    it("should be owner", async function () {
      expect(await bond.owner()).to.be.equal(owner.address);
    });

    it("should return total value for an account", async function () {
      expect(
        await bond.connect(bondHolder).balanceOf(issuer.address)
      ).to.be.equal(0);
    });

    it("should return payment due date", async function () {
      expect(await bond.connect(bondHolder).maturityDate()).to.be.equal(
        maturityDate
      );
    });
  });

  // todo: we might want to mock these states and check the standing of the bond
  // instead of trying to manipulate the state via deposits/redemptions, etc.
  describe("bond standing", async () => {
    it("should be default to GOOD", async function () {
      expect(await bond.connect(bondHolder).currentBondStanding()).to.be.equal(
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
      const bondHolderBond = await bond.connect(bondHolder);

      expect(
        bondHolderBond.setBondStanding(BondStanding.PAID)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    // failing until hooked up with auction
    it("should repay and return REPAID", async function () {
      // quick check to make sure payTo has a bond issued
      expect(await bond.balanceOf(issuer.address)).to.be.equal(0);

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
      const bondHolderBond = bond.connect(bondHolder);

      // quick check to make sure payTo has a bond issued
      expect(await bondHolderBond.balanceOf(issuer.address)).to.be.equal(0);

      // and that it's not already paid off
      expect(await bondHolderBond.currentBondStanding()).to.be.equal(
        BondStanding.GOOD
      );
      // This should repay using auction contract
      // await auctionContract.repay(address)...
      expect(await bondHolderBond.currentBondStanding()).to.be.equal(
        BondStanding.PAID
      );

      // TODO: this should approve the token payment not the bond token?
      await bondHolderBond.approve(issuer.address, 0);

      // Pays 1:1 to the bond token
      await bondHolder.sendTransaction({
        to: bondHolderBond.address,
        value: 0,
      });

      // Fast forward to expire
      await ethers.provider.send("evm_mine", [maturityDate]);

      const currentBal = await bondHolder.getBalance();
      expect(await bondHolderBond.redeem(0))
        .to.emit(bondHolderBond, "Redeem")
        .withArgs(0);

      expect(await bond.setBondStanding(BondStanding.PAID))
        .to.emit(bond, "BondStandingChange")
        .withArgs(BondStanding.GOOD, BondStanding.PAID);

      // This is failing, likely because sendTransaction isn't sending value in
      // a format it's expecting? not sure
      expect(await bondHolder.getBalance()).to.be.equal(currentBal.add(0));

      expect(await bondHolderBond.currentBondStanding()).to.be.equal(3);
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
    it("reverts when insufficient allowance", async () => {
      const amountToDeposit = 1000;
      await expect(
        bond.connect(attacker).collateralize(amountToDeposit)
      ).to.be.revertedWith("insufficient allowance");
    });
    it("reverts on zero amount", async () => {
      await expect(bond.connect(issuer).collateralize(0)).to.be.revertedWith(
        "ZeroCollateralizationAmount"
      );
    });
  });

  describe("uncollateralize", async () => {
    it("withdraws collateral", async () => {
      const amountToWithdraw = 1000;
      await collateralToken
        .connect(issuer)
        .approve(bond.address, amountToWithdraw);
      const { amount } = await getEventArgumentsFromTransaction(
        await bond.connect(issuer).collateralize(amountToWithdraw),
        "CollateralWithdrawn"
      );
      expect(amount).to.be.equal(amountToWithdraw);
    });
    it("reverts when insufficient allowance", async () => {
      const amountToDeposit = 1000;
      await expect(
        bond.connect(attacker).collateralize(amountToDeposit)
      ).to.be.revertedWith("insufficient allowance");
    });
    it("reverts on zero amount", async () => {
      await expect(bond.connect(issuer).collateralize(0)).to.be.revertedWith(
        "ZeroCollateralizationAmount"
      );
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
      await expect(bond.connect(attacker).repay(100)).to.be.reverted;

      // check revert with specific error name
      await expect(bond.connect(attacker).repay(100)).to.be.revertedWith(
        "OnlyIssuerOfBondMayCallThisFunction"
      );
    });
  });

  describe("minting", async () => {
    it("mints up to collateral depositted", async () => {
      const collateralToDeposit = 1000;
      const tokensToMint =
        collateralToDeposit /
        Math.floor(BondConfig.collateralizationRatio / 100);
      await collateralToken
        .connect(issuer)
        .approve(bond.address, collateralToDeposit);
      await bond.connect(issuer).collateralize(collateralToDeposit);
      await expect(bond.connect(issuer).mint(tokensToMint)).to.not.be.reverted;
    });
    it("mints tokens while collateral covers mint amount", async () => {
      const collateralToDeposit = 1000;
      const tokensToMint =
        collateralToDeposit /
        Math.floor(BondConfig.collateralizationRatio / 100);
      await collateralToken
        .connect(issuer)
        .approve(bond.address, collateralToDeposit);
      await bond.connect(issuer).collateralize(collateralToDeposit);

      await expect(bond.connect(issuer).mint(tokensToMint / 2)).to.not.be
        .reverted;
      await expect(bond.connect(issuer).mint(tokensToMint / 2)).to.not.be
        .reverted;
    });
    it("fails to mint tokens not covered by collateral", async () => {
      const collateralToDeposit = 1000;
      const tokensToMint =
        collateralToDeposit /
        Math.floor(BondConfig.collateralizationRatio / 100);
      await collateralToken
        .connect(issuer)
        .approve(bond.address, collateralToDeposit);
      await bond.connect(issuer).collateralize(collateralToDeposit);

      await expect(bond.connect(issuer).mint(tokensToMint)).to.not.be.reverted;
      await expect(bond.connect(issuer).mint(tokensToMint)).to.be.revertedWith(
        "InusfficientCollateralToCoverTokenSupply"
      );
    });

    it("fails to mint more than max supply", async () => {
      const collateralToDeposit =
        ((BondConfig.totalBondSupply + 1) * BondConfig.collateralizationRatio) /
        100;
      const tokensToMint = BondConfig.totalBondSupply + 1;
      await collateralToken
        .connect(issuer)
        .approve(bond.address, collateralToDeposit);
      await bond.connect(issuer).collateralize(collateralToDeposit);
      await expect(bond.connect(issuer).mint(tokensToMint)).to.be.revertedWith(
        "BondSupplyExceeded"
      );
    });
    it("fails to mint if not all tokens owned by issuer", async () => {
      const collateralToDeposit = 1000;
      const tokensToMint =
        collateralToDeposit /
        Math.floor(BondConfig.collateralizationRatio / 100);
      await collateralToken
        .connect(issuer)
        .approve(bond.address, collateralToDeposit);
      await bond.connect(issuer).collateralize(collateralToDeposit);

      await expect(bond.connect(issuer).mint(tokensToMint / 2)).to.not.be
        .reverted;

      await bond.connect(issuer).transfer(owner.address, 1);

      await expect(
        bond.connect(issuer).mint(tokensToMint / 2)
      ).to.be.revertedWith("NoMintAfterIssuance");
    });
  });
  describe("conversion", async () => {
    let tokensMinted = 0;
    describe("convertible bonds", async () => {
      let convertibleBond: SimpleBond;
      async function fixture() {
        const { factory } = await bondFactoryFixture();
        ({ collateralData, collateralToken } = await collateralTokenFixture());

        const [owner, issuer] = await ethers.getSigners();

        const convertibleBond = await getBondContract(
          factory.createBond(
            BondConfig.totalBondSupply,
            maturityDate,
            owner.address,
            issuer.address,
            collateralData.collateralAddress,
            BigNumber.from(BondConfig.collateralizationRatio),
            true,
            BigNumber.from(BondConfig.convertibilityRatio),
            ethers.constants.AddressZero,
            BigNumber.from(BondConfig.totalBondSupply)
          )
        );

        return { convertibleBond };
      }
      beforeEach(async () => {
        ({ convertibleBond } = await fixture());
        const tokensToMint = 1000;
        const collateralToDeposit =
          (tokensToMint * BondConfig.collateralizationRatio) / 100;
        await collateralToken
          .connect(issuer)
          .approve(convertibleBond.address, collateralToDeposit);
        await convertibleBond
          .connect(issuer)
          .collateralize(collateralToDeposit);
        await expect(convertibleBond.connect(issuer).mint(tokensToMint)).to.not
          .be.reverted;
        tokensMinted = tokensToMint;
        await convertibleBond
          .connect(issuer)
          .transfer(bondHolder.address, tokensToMint);
      });
      it("converts bond amount into collateral at convertibilityRatio", async () => {
        const amountOfBondsConverted = tokensMinted;
        const amountOfCollateralReceived =
          amountOfBondsConverted * (BondConfig.convertibilityRatio / 100);
        await convertibleBond
          .connect(bondHolder)
          .approve(convertibleBond.address, amountOfBondsConverted);
        expect(
          await convertibleBond
            .connect(bondHolder)
            .convert(amountOfBondsConverted)
        )
          .to.emit(convertibleBond, "Converted")
          .withArgs(
            bondHolder.address,
            amountOfBondsConverted,
            amountOfCollateralReceived
          );
        expect(await collateralToken.balanceOf(bondHolder.address)).to.eq(
          amountOfCollateralReceived
        );
      });
    });
    describe("non-convertible bonds", async () => {
      let nonConvertibleBond: SimpleBond;
      async function fixture() {
        const { factory } = await bondFactoryFixture();
        ({ collateralData, collateralToken } = await collateralTokenFixture());

        const [owner, issuer] = await ethers.getSigners();

        const nonConvertibleBond = await getBondContract(
          factory.createBond(
            BondConfig.totalBondSupply,
            maturityDate,
            owner.address,
            issuer.address,
            collateralData.collateralAddress,
            BigNumber.from(BondConfig.collateralizationRatio),
            false,
            BigNumber.from(BondConfig.convertibilityRatio),
            ethers.constants.AddressZero,
            BigNumber.from(BondConfig.totalBondSupply)
          )
        );

        return { nonConvertibleBond };
      }
      beforeEach(async () => {
        ({ nonConvertibleBond } = await fixture());
        const collateralToDeposit = 1000;
        const tokensToMint =
          collateralToDeposit /
          Math.floor(BondConfig.collateralizationRatio / 100);
        await collateralToken
          .connect(issuer)
          .approve(nonConvertibleBond.address, collateralToDeposit);
        await nonConvertibleBond
          .connect(issuer)
          .collateralize(collateralToDeposit);
        await expect(nonConvertibleBond.connect(issuer).mint(tokensToMint)).to
          .not.be.reverted;
        tokensMinted = tokensToMint;
        await nonConvertibleBond
          .connect(issuer)
          .transfer(bondHolder.address, tokensToMint);
      });
      it("fails to convert if bond is not convertible", async () => {
        await expect(
          nonConvertibleBond.connect(issuer).convert(1000)
        ).to.be.revertedWith("NotConvertible");
      });
    });
  });
});
