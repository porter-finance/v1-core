import { BigNumber, utils, BytesLike } from "ethers";
import { expect } from "chai";
import { TestERC20, SimpleBond, BondFactoryClone } from "../typechain";
import { getBondContract, getEventArgumentsFromTransaction } from "./utilities";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { bondFactoryFixture, tokenFixture } from "./shared/fixtures";
import { BondConfigType } from "./interfaces";

// https://ethereum-waffle.readthedocs.io/en/latest/fixtures.html
// import from waffle since we are using hardhat: https://hardhat.org/plugins/nomiclabs-hardhat-waffle.html#environment-extensions
const { ethers, waffle } = require("hardhat");
const { loadFixture } = waffle;

const BondStanding = {
  GOOD: 0,
  DEFAULTED: 1,
  PAID: 2,
  REDEEMED: 3,
};
const ONE = utils.parseUnits("1", 18);
// 3 years from now, in seconds
const maturityDate = Math.round(
  new Date(new Date().setFullYear(new Date().getFullYear() + 3)).getTime() /
    1000
);

const BondConfig: BondConfigType = {
  targetBondSupply: utils.parseUnits("50000000", 18), // 50 million bonds
  collateralToken: "",
  collateralRatio: BigNumber.from(0),
  convertibilityRatio: BigNumber.from(0),
  maturityDate,
  maxSupply: utils.parseUnits("50000000", 18),
};

const ConvertibleBondConfig: BondConfigType = {
  targetBondSupply: utils.parseUnits("50000000", 18), // 50 million bonds
  collateralToken: "",
  collateralRatio: BigNumber.from(0),
  convertibilityRatio: BigNumber.from(0),
  maturityDate,
  maxSupply: utils.parseUnits("50000000", 18),
};

describe("SimpleBond", async () => {
  let bond: SimpleBond;
  let convertibleBond: SimpleBond;
  let owner: SignerWithAddress;
  let bondHolder: SignerWithAddress;
  let attacker: SignerWithAddress;
  let nativeToken: TestERC20;
  let attackingToken: TestERC20;
  let mockUSDCToken: TestERC20;
  let borrowingToken: TestERC20;
  let factory: BondFactoryClone;
  let withdrawRole: BytesLike;

  // no args because of gh issue:
  // https://github.com/nomiclabs/hardhat/issues/849#issuecomment-860576796
  async function fixture() {
    const { factory } = await bondFactoryFixture();
    const issuerRole = await factory.ISSUER_ROLE();

    await (await factory.grantRole(issuerRole, owner.address)).wait();

    const { nativeToken, attackingToken, mockUSDCToken, borrowingToken } =
      await tokenFixture();
    BondConfig.collateralToken = nativeToken.address;
    BondConfig.collateralRatio = utils.parseUnits("0.5", 18);
    BondConfig.convertibilityRatio = utils.parseUnits("0", 18);

    const bond = await getBondContract(
      factory.createBond(
        "SimpleBond",
        "LUG",
        owner.address,
        BondConfig.maturityDate,
        borrowingToken.address,
        BondConfig.collateralToken,
        BondConfig.collateralRatio,
        BondConfig.convertibilityRatio,
        BondConfig.maxSupply
      )
    );

    ConvertibleBondConfig.collateralToken = mockUSDCToken.address;
    ConvertibleBondConfig.collateralRatio = utils.parseUnits("0.5", 18);
    ConvertibleBondConfig.convertibilityRatio = utils.parseUnits("0.25", 18);
    const convertibleBond = await getBondContract(
      factory.createBond(
        "SimpleBond",
        "LUG",
        owner.address,
        ConvertibleBondConfig.maturityDate,
        borrowingToken.address,
        ConvertibleBondConfig.collateralToken,
        ConvertibleBondConfig.collateralRatio,
        ConvertibleBondConfig.convertibilityRatio,
        BondConfig.maxSupply
      )
    );

    return {
      bond,
      convertibleBond,
      nativeToken,
      attackingToken,
      mockUSDCToken,
      borrowingToken,
      factory,
    };
  }

  beforeEach(async () => {
    [owner, bondHolder, attacker] = await ethers.getSigners();
    ({
      bond,
      convertibleBond,
      nativeToken,
      attackingToken,
      mockUSDCToken,
      borrowingToken,
      factory,
    } = await loadFixture(fixture));
    withdrawRole = await bond.WITHDRAW_ROLE();
  });
  describe("configuration", async () => {
    it("should revert on less collateral than convertible", async () => {
      await expect(
        factory.createBond(
          "SimpleBond",
          "LUG",
          owner.address,
          BondConfig.maturityDate,
          borrowingToken.address,
          BondConfig.collateralToken,
          BondConfig.convertibilityRatio, // these are swapped
          BondConfig.collateralRatio, // these are swapped
          BondConfig.maxSupply
        )
      ).to.be.revertedWith("BackingRatioLessThanConvertibilityRatio");
    });
  });

  describe("creation", async () => {
    it("should have no minted coins", async function () {
      expect(await bond.balanceOf(owner.address)).to.be.equal(0);
      expect(await bond.balanceOf(bondHolder.address)).to.be.equal(0);
    });

    it("issuer has default admin role", async function () {
      expect(await bond.hasRole(await bond.DEFAULT_ADMIN_ROLE(), owner.address))
        .to.be.true;
    });

    it("default admin role is role admin for withdraw role", async function () {
      expect(
        await bond.hasRole(await bond.getRoleAdmin(withdrawRole), owner.address)
      ).to.be.true;
    });

    it("should return total value for an account", async function () {
      expect(
        await bond.connect(bondHolder).balanceOf(owner.address)
      ).to.be.equal(0);
    });

    it("should return public parameters", async function () {
      expect(await bond.maturityDate()).to.be.equal(BondConfig.maturityDate);
      expect(await bond.collateralToken()).to.be.equal(
        BondConfig.collateralToken
      );
      expect(await bond.backingRatio()).to.be.equal(BondConfig.collateralRatio);
      expect(await bond.convertibilityRatio()).to.be.equal(0);

      expect(await bond.borrowingToken()).to.be.equal(borrowingToken.address);
    });

    it("should have predefined ERC20 attributes", async () => {
      expect(await bond.name()).to.be.equal("SimpleBond");
      expect(await bond.symbol()).to.be.equal("LUG");
    });
  });

  describe("withdrawCollateral", async () => {
    beforeEach(async () => {
      const token = mockUSDCToken.attach(BondConfig.collateralToken);
      const amountToDeposit = BondConfig.targetBondSupply
        .mul(BondConfig.collateralRatio)
        .div(utils.parseUnits("1", 18));
      await token.approve(bond.address, amountToDeposit);
      await bond.mint(amountToDeposit);
    });

    it("owner can withdraw collateral", async () => {
      await expect(bond.withdrawCollateral(0)).to.be.revertedWith(
        "CollateralInContractInsufficientToCoverWithdraw"
      );
    });

    it("reverts when called by non-issuer", async () => {
      await expect(
        bond.connect(attacker).withdrawCollateral(0)
      ).to.be.revertedWith(
        `AccessControl: account ${attacker.address.toLowerCase()} is missing role ${withdrawRole}`
      );
    });

    it("granting and revoking withdraw role works correctly", async () => {
      await bond.grantRole(withdrawRole, attacker.address);
      await expect(
        bond.connect(attacker).withdrawCollateral(0)
      ).to.be.revertedWith("CollateralInContractInsufficientToCoverWithdraw");

      await bond.revokeRole(withdrawRole, attacker.address);
      await expect(
        bond.connect(attacker).withdrawCollateral(0)
      ).to.be.revertedWith(
        `AccessControl: account ${attacker.address.toLowerCase()} is missing role ${withdrawRole}`
      );
    });
  });

  describe("repayment", async () => {
    beforeEach(async () => {
      const token = mockUSDCToken.attach(BondConfig.collateralToken);
      const amountToDeposit = BondConfig.targetBondSupply
        .mul(BondConfig.collateralRatio)
        .div(utils.parseUnits("1", 18));
      await token.approve(bond.address, amountToDeposit);
      await expect(bond.mint(BondConfig.targetBondSupply)).to.not.be.reverted;
      await borrowingToken.approve(bond.address, BondConfig.targetBondSupply);
    });

    it("previews redeem accepts partial repayment", async () => {
      await Promise.all(
        [
          [0, 0],
          [
            BondConfig.targetBondSupply.div(4),
            BondConfig.targetBondSupply.div(4),
          ],
          [
            BondConfig.targetBondSupply.div(2),
            BondConfig.targetBondSupply.div(2),
          ],
          [BondConfig.targetBondSupply, BondConfig.targetBondSupply],
          [BondConfig.targetBondSupply.mul(2), BondConfig.targetBondSupply],
          [
            BondConfig.targetBondSupply.mul(200000000000),
            BondConfig.targetBondSupply,
          ],
        ].map(async ([repaymentAmount, previewRepayOutput]) => {
          expect(await bond.previewRepay(repaymentAmount)).to.equal(
            previewRepayOutput
          );
        })
      );
    });

    it("accepts partial repayment", async () => {
      await (await bond.repay(BondConfig.targetBondSupply.div(2))).wait();

      await expect(bond.repay(BondConfig.targetBondSupply.div(2))).to.emit(
        bond,
        "RepaymentInFull"
      );
    });

    it("accepts repayment", async () => {
      await expect(bond.repay(BondConfig.targetBondSupply)).to.emit(
        bond,
        "RepaymentInFull"
      );
    });

    it("fails if already repaid", async () => {
      await bond.repay(BondConfig.targetBondSupply);
      await expect(bond.repay(BondConfig.targetBondSupply)).to.be.revertedWith(
        "RepaymentMet"
      );
    });
  });
  describe("minting", async () => {
    let targetTokens: BigNumber;
    let amountToDeposit: BigNumber;
    beforeEach(async () => {
      targetTokens = BondConfig.targetBondSupply;
      amountToDeposit = BondConfig.targetBondSupply
        .mul(BondConfig.collateralRatio)
        .div(utils.parseUnits("1", 18));
      await mockUSDCToken
        .attach(BondConfig.collateralToken)
        .approve(bond.address, amountToDeposit);
    });

    it("previews mint valid", async () => {
      await Promise.all(
        [
          [0, BigNumber.from(0)],
          [
            BondConfig.targetBondSupply.div(4),
            BondConfig.collateralRatio
              .mul(BondConfig.targetBondSupply.div(4))
              .div(ONE),
          ],
          [
            BondConfig.targetBondSupply.div(2),
            BondConfig.collateralRatio
              .mul(BondConfig.targetBondSupply.div(2))
              .div(ONE),
          ],
          [
            BondConfig.targetBondSupply,
            BondConfig.collateralRatio
              .mul(BondConfig.targetBondSupply)
              .div(ONE),
          ],
        ].map(async ([mintAmount, collateralToDeposit], index) => {
          expect(await bond.previewMint(mintAmount), index.toString()).to.equal(
            collateralToDeposit
          );
        })
      );
    });

    it("mints up to collateral depositted", async () => {
      await expect(bond.mint(BondConfig.targetBondSupply)).to.not.be.reverted;
      expect(await bond.totalSupply()).to.equal(targetTokens);
    });

    it("cannot mint more than max supply", async () => {
      await expect(
        bond.mint(BondConfig.targetBondSupply.add(1))
      ).to.be.revertedWith("BondSupplyExceeded");
    });
  });

  describe("redemption", async () => {
    let sharesToSellToBondHolder: BigNumber;
    beforeEach(async () => {
      sharesToSellToBondHolder = utils.parseUnits("1000", 18);
      const token = mockUSDCToken.attach(BondConfig.collateralToken);
      const amountToDeposit = BondConfig.targetBondSupply
        .mul(BondConfig.collateralRatio)
        .div(utils.parseUnits("1", 18));
      await token.approve(bond.address, amountToDeposit);
      await bond.mint(amountToDeposit);
      await bond.transfer(bondHolder.address, sharesToSellToBondHolder);
      await borrowingToken.approve(bond.address, BondConfig.targetBondSupply);
    });
    it("should redeem bond at maturity for borrowing token", async function () {
      await bond.repay(BondConfig.targetBondSupply);
      // Fast forward to expire
      await ethers.provider.send("evm_mine", [BondConfig.maturityDate]);
      expect(await bond.state()).to.eq(BondStanding.PAID);
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
    it("should redeem bond at default for collateral token", async function () {
      const expectedCollateralToReceive = sharesToSellToBondHolder
        .mul(BondConfig.collateralRatio)
        .div(utils.parseUnits("1", 18));
      await ethers.provider.send("evm_mine", [BondConfig.maturityDate]);
      const {
        receiver,
        borrowingToken,
        collateralToken,
        amountOfBondsRedeemed,
        amountOfBorrowTokensReceived,
        amountOfCollateralReceived,
      } = await getEventArgumentsFromTransaction(
        await bond.connect(bondHolder).redeem(sharesToSellToBondHolder),
        "Redeem"
      );
      expect(receiver).to.equal(bondHolder.address);
      expect(collateralToken).to.equal(BondConfig.collateralToken);
      expect(amountOfBondsRedeemed).to.equal(sharesToSellToBondHolder);
      expect(amountOfBorrowTokensReceived).to.equal(0);
      expect(amountOfCollateralReceived).to.equal(expectedCollateralToReceive);

      expect(await bond.balanceOf(bondHolder.address)).to.be.equal(0);
      expect(
        await mockUSDCToken.attach(borrowingToken).balanceOf(bondHolder.address)
      ).to.be.equal(0);
      // this isn't necessarily USDC - it's attaching at the address specified
      // this is because the tokens are sorted and we can not be sure which token it is
      expect(
        await mockUSDCToken
          .attach(BondConfig.collateralToken)
          .balanceOf(bondHolder.address)
      ).to.be.equal(
        BondConfig.collateralRatio
          .mul(sharesToSellToBondHolder)
          .div(utils.parseUnits("1", 18))
      );
    });
  });

  describe("conversion", async () => {
    describe("convertible bonds", async () => {
      const tokensToConvert = ConvertibleBondConfig.targetBondSupply;
      beforeEach(async () => {
        const token = mockUSDCToken.attach(
          ConvertibleBondConfig.collateralToken
        );
        const amountToDeposit = ConvertibleBondConfig.targetBondSupply
          .mul(ConvertibleBondConfig.collateralRatio)
          .div(utils.parseUnits("1", 18));
        await token.approve(convertibleBond.address, amountToDeposit);
        await convertibleBond.mint(ConvertibleBondConfig.targetBondSupply);
        await convertibleBond.transfer(bondHolder.address, tokensToConvert);
      });
      it("previews convert", async () => {
        await Promise.all(
          [
            [0, 0],
            [
              BondConfig.targetBondSupply,
              BondConfig.convertibilityRatio
                .mul(BondConfig.targetBondSupply)
                .div(ONE),
            ],
            [
              BondConfig.targetBondSupply.div(2),
              BondConfig.convertibilityRatio
                .mul(BondConfig.targetBondSupply.div(2))
                .div(ONE),
            ],
          ].map(async ([convertAmount, assetsToReceive], index) => {
            expect(
              await bond.previewConvert(convertAmount),
              index.toString()
            ).to.equal(assetsToReceive);
          })
        );
      });
      it("converts bond amount into collateral at convertibilityRatio", async () => {
        const expectedCollateralToWithdraw = tokensToConvert
          .mul(ConvertibleBondConfig.convertibilityRatio)
          .div(utils.parseUnits("1", 18));
        await convertibleBond
          .connect(bondHolder)
          .approve(convertibleBond.address, tokensToConvert);
        const {
          convertorAddress,
          collateralToken,
          amountOfBondsConverted,
          amountOfCollateralReceived,
        } = await getEventArgumentsFromTransaction(
          await convertibleBond.connect(bondHolder).convert(tokensToConvert),
          "Converted"
        );
        expect(convertorAddress).to.equal(bondHolder.address);
        expect(collateralToken).to.equal(ConvertibleBondConfig.collateralToken);
        expect(amountOfBondsConverted).to.equal(tokensToConvert);
        expect(amountOfCollateralReceived).to.equal(
          expectedCollateralToWithdraw
        );
      });
    });
    describe("non-convertible bonds", async () => {
      it("fails to convert if bond is not convertible", async () => {
        await expect(
          bond.convert(BondConfig.targetBondSupply)
        ).to.be.revertedWith("ZeroAmount");
      });
    });
  });
  describe("sweep", async () => {
    it("removes a token from the contract", async () => {
      await attackingToken.connect(attacker).transfer(bond.address, 1000);
      await bond.sweep(attackingToken.address);
      expect(await attackingToken.balanceOf(owner.address)).to.be.equal(1000);
    });

    it("disallows removal of a collateral, borrowing, or itself", async () => {
      await expect(bond.sweep(bond.address)).to.be.revertedWith(
        "SweepDisallowedForToken"
      );
      await expect(bond.sweep(borrowingToken.address)).to.be.revertedWith(
        "SweepDisallowedForToken"
      );
      await expect(bond.sweep(nativeToken.address)).to.be.revertedWith(
        "SweepDisallowedForToken"
      );
    });
  });
});
