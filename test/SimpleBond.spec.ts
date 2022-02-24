import { BigNumber } from "ethers";
import { expect } from "chai";
import { TestERC20, SimpleBond } from "../typechain";
import { getEventArgumentsFromTransaction } from "./utilities";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  bondFactoryFixture,
  collateralTokenFixture,
  borrowingTokenFixture,
} from "./shared/fixtures";

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

  let bond: SimpleBond;
  let owner: SignerWithAddress;
  let issuer: SignerWithAddress;
  let bondHolder: SignerWithAddress;
  let attacker: SignerWithAddress;
  let collateralToken: TestERC20;
  let borrowingToken: TestERC20;
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
    ({ collateralToken } = await collateralTokenFixture());
    ({ borrowingToken } = await borrowingTokenFixture());
    const [owner, issuer] = await ethers.getSigners();

    const bond = await getBondContract(
      factory.createBond(
        BondConfig.totalBondSupply,
        maturityDate,
        owner.address,
        issuer.address,
        collateralToken.address,
        BigNumber.from(BondConfig.collateralizationRatio),
        false,
        BigNumber.from(BondConfig.convertibilityRatio),
        borrowingToken.address,
        BigNumber.from(BondConfig.totalBondSupply)
      )
    );

    return { bond };
  }

  beforeEach(async () => {
    [owner, issuer, bondHolder, attacker] = await ethers.getSigners();
    ({ bond } = await loadFixture(fixture));
  });

  describe("creation", async () => {
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
    it("should have a name", async () => {
      expect(await bond.name()).to.be.equal("SimpleBond");
    });
  });

  describe("redemption", async () => {
    it("should redeem bond at maturity", async function () {
      const collateralToDeposit =
        (BondConfig.totalBondSupply * BondConfig.collateralizationRatio) / 100;
      const sharesToSellToBondHolder = 100;
      await collateralToken
        .connect(issuer)
        .approve(bond.address, collateralToDeposit);
      await bond.connect(issuer).collateralize(collateralToDeposit);
      await bond.connect(issuer).mint(BondConfig.totalBondSupply);
      await bond
        .connect(issuer)
        .transfer(bondHolder.address, sharesToSellToBondHolder);
      await borrowingToken
        .connect(issuer)
        .approve(bond.address, BondConfig.totalBondSupply);
      await bond.connect(issuer).repay(BondConfig.totalBondSupply);
      // Fast forward to expire
      await ethers.provider.send("evm_mine", [maturityDate]);
      await bond
        .connect(bondHolder)
        .approve(bond.address, sharesToSellToBondHolder);

      expect(await bond.balanceOf(bondHolder.address)).to.be.equal(
        sharesToSellToBondHolder
      );
      await bond.connect(bondHolder).redeem(sharesToSellToBondHolder);
      expect(await bond.balanceOf(bondHolder.address)).to.be.equal(0);
      expect(await borrowingToken.balanceOf(bondHolder.address)).to.be.equal(
        sharesToSellToBondHolder
      );
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
    let collateralToWithdraw = 0;
    let tokensToBurn = 0;
    beforeEach(async () => {
      const collateralToDeposit = 1000;
      const tokensToMint =
        collateralToDeposit /
        Math.floor(BondConfig.collateralizationRatio / 100);
      await collateralToken
        .connect(issuer)
        .approve(bond.address, collateralToDeposit);
      await bond.connect(issuer).collateralize(collateralToDeposit);
      await bond.connect(issuer).mint(tokensToMint);
      collateralToWithdraw = collateralToDeposit;
      tokensToBurn = tokensToMint;
    });
    it("withdraws collateral", async () => {
      await expect(
        bond.connect(issuer).uncollateralize(collateralToWithdraw, tokensToBurn)
      ).to.emit(bond, "CollateralWithdrawn");
    });
    it("reverts when called by non-issuer", async () => {
      await expect(
        bond
          .connect(attacker)
          .uncollateralize(collateralToWithdraw, tokensToBurn)
      ).to.be.revertedWith("OnlyIssuerOfBondMayCallThisFunction");
    });
    it("reverts on zero amount", async () => {
      await expect(
        bond.connect(issuer).uncollateralize(0, 0)
      ).to.be.revertedWith("ZeroUncollateralizationAmount");
    });
    it("fails when withdrawing too much collateral", async () => {
      await expect(
        bond
          .connect(issuer)
          .uncollateralize(collateralToWithdraw + 1, tokensToBurn)
      ).to.be.revertedWith("CollateralInContractInsufficientToCoverWithdraw");
    });
    it("fails when withdrawing the wrong ratio of collateral to burnt tokens", async () => {
      await expect(
        bond
          .connect(issuer)
          .uncollateralize(collateralToWithdraw, tokensToBurn - 1)
      ).to.be.revertedWith("InusfficientCollateralToCoverTokenSupply");
    });
    it("fails when burning exceeds available tokens", async () => {
      await expect(
        bond
          .connect(issuer)
          .uncollateralize(collateralToWithdraw, tokensToBurn + 1)
      ).to.be.revertedWith("ERC20: burn amount exceeds balance");
    });
  });

  describe("repayment", async () => {
    it("accepts partial repayment", async () => {
      await borrowingToken
        .connect(issuer)
        .approve(bond.address, BondConfig.totalBondSupply);
      await expect(
        bond.connect(issuer).repay(BondConfig.totalBondSupply / 2)
      ).to.emit(bond, "RepaymentDeposited");
      await expect(
        bond.connect(issuer).repay(BondConfig.totalBondSupply / 2)
      ).to.emit(bond, "RepaymentInFull");
    });
    it("accepts repayment", async () => {
      await borrowingToken
        .connect(issuer)
        .approve(bond.address, BondConfig.totalBondSupply);
      await expect(
        bond.connect(issuer).repay(BondConfig.totalBondSupply)
      ).to.emit(bond, "RepaymentInFull");
    });
    it("fails if already repaid", async () => {
      await borrowingToken
        .connect(issuer)
        .approve(bond.address, BondConfig.totalBondSupply);
      await bond.connect(issuer).repay(BondConfig.totalBondSupply);
      await expect(
        bond.connect(issuer).repay(BondConfig.totalBondSupply)
      ).to.be.revertedWith("RepaymentMet");
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
        ({ collateralToken } = await collateralTokenFixture());

        const [owner, issuer] = await ethers.getSigners();

        const convertibleBond = await getBondContract(
          factory.createBond(
            BondConfig.totalBondSupply,
            maturityDate,
            owner.address,
            issuer.address,
            collateralToken.address,
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
        ({ collateralToken } = await collateralTokenFixture());

        const [owner, issuer] = await ethers.getSigners();

        const nonConvertibleBond = await getBondContract(
          factory.createBond(
            BondConfig.totalBondSupply,
            maturityDate,
            owner.address,
            issuer.address,
            collateralToken.address,
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
