import { BigNumber, utils } from "ethers";
import { expect } from "chai";
import { BondFactory, TestERC20 } from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { bondFactoryFixture, tokenFixture } from "./shared/fixtures";
import { BondConfigType } from "./interfaces";
import {
  FIFTY_MILLION,
  THREE_YEARS_FROM_NOW_IN_SECONDS,
  ELEVEN_YEARS_FROM_NOW_IN_SECONDS,
} from "./constants";
import { getTargetCollateral } from "./utilities";

const { ethers } = require("hardhat");

const BondConfig: BondConfigType = {
  collateralRatio: BigNumber.from(0),
  convertibleRatio: BigNumber.from(0),
  maturityDate: THREE_YEARS_FROM_NOW_IN_SECONDS,
  maxSupply: utils.parseUnits(FIFTY_MILLION, 18),
};

describe("BondFactory", async () => {
  let factory: BondFactory;
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let collateralToken: TestERC20;
  let paymentToken: TestERC20;
  let ISSUER_ROLE: any;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();
    ({ factory } = await bondFactoryFixture());
    ({ collateralToken, paymentToken } = await (
      await tokenFixture([18])
    ).tokens[0]);
    ISSUER_ROLE = await factory.ISSUER_ROLE();
  });

  async function createBond(factory: BondFactory, params: any = {}) {
    const {
      maturityDate,
      paymentToken: payToken,
      collateralToken: collToken,
      collateralRatio,
      convertibleRatio,
      maxSupply,
    } = params;

    BondConfig.collateralRatio = utils.parseUnits("0.5", 18);
    BondConfig.convertibleRatio = utils.parseUnits("0.5", 18);
    const testMaturityDate = maturityDate || BondConfig.maturityDate;
    const testPaymentToken = payToken || paymentToken.address;
    const testCollateralToken = collToken || collateralToken.address;

    const testCollateralRatio = collateralRatio || BondConfig.collateralRatio;
    const testConvertibleRatio =
      convertibleRatio || BondConfig.convertibleRatio;
    const testMaxSupply = maxSupply || BondConfig.maxSupply;

    await collateralToken.approve(
      factory.address,
      getTargetCollateral(BondConfig)
    );
    return factory.createBond(
      "Bond",
      "LUG",
      testMaturityDate,
      testPaymentToken,
      testCollateralToken,
      testCollateralRatio,
      testConvertibleRatio,
      testMaxSupply
    );
  }

  // what mint tests do we need?
  // check that the correct amount of collateral is withdrawn

  describe.only("#createBond", async () => {
    it("should allow only approved issuers to create a bond", async () => {
      await expect(createBond(factory)).to.be.revertedWith(
        `AccessControl: account ${owner.address.toLowerCase()} is missing role ${ISSUER_ROLE}`
      );

      await factory.grantRole(ISSUER_ROLE, owner.address);

      await expect(createBond(factory)).to.emit(factory, "BondCreated");
    });

    it("should revert on less collateral than convertible ratio", async () => {
      await factory.grantRole(ISSUER_ROLE, owner.address);
      await expect(
        createBond(factory, {
          collateralRatio: utils.parseUnits(".25", 18),
          convertibleRatio: utils.parseUnits(".5", 18),
        })
      ).to.be.revertedWith("CollateralRatioLessThanConvertibleRatio");
    });

    it("should revert on too big of a token", async () => {
      await factory.grantRole(ISSUER_ROLE, owner.address);
      await expect(createBond(factory, {})).to.be.revertedWith(
        "CollateralRatioLessThanConvertibleRatio"
      );
    });

    describe("Should revert on invalid maturity date", async () => {
      it("should revert on a maturity date already passed", async () => {
        await factory.grantRole(ISSUER_ROLE, owner.address);
        await expect(
          createBond(factory, { maturityDate: BigNumber.from(1) })
        ).to.be.revertedWith("InvalidMaturityDate");
      });

      it("should revert on a maturity date current timestamp", async () => {
        if (!owner?.provider) {
          throw new Error("no provider");
        }
        const currentTimestamp = (await owner.provider.getBlock("latest"))
          .timestamp;

        await factory.grantRole(ISSUER_ROLE, owner.address);
        await expect(
          createBond(factory, { maturityDate: currentTimestamp })
        ).to.be.revertedWith("InvalidMaturityDate");
      });
      it("should revert on a maturity date 10 years in the future", async () => {
        await factory.grantRole(ISSUER_ROLE, owner.address);
        await expect(
          createBond(factory, {
            maturityDate: ELEVEN_YEARS_FROM_NOW_IN_SECONDS,
          })
        ).to.be.revertedWith("InvalidMaturityDate");
      });
    });

    it("should mint max supply to the caller", async () => {
      await factory.grantRole(ISSUER_ROLE, owner.address);
      await createBond(factory);
    });
    it("should not withdraw collateral for convert bonds", async () => {
      await factory.grantRole(ISSUER_ROLE, owner.address);
      const startingBalance = await collateralToken.balanceOf(owner.address);
      createBond(factory, { collateralRatio: 0, convertibleRatio: 0 });
      const endingBalance = await collateralToken.balanceOf(owner.address);
      expect(endingBalance).to.equal(startingBalance);
    });
    it("should withdraw the correct amount of collateral on creation", async () => {
      await factory.grantRole(ISSUER_ROLE, owner.address);
      const startingBalance = await collateralToken.balanceOf(owner.address);

      await createBond(factory, {});
      const endingBalance = await collateralToken.balanceOf(owner.address);
      const collateralTransfered = startingBalance.sub(endingBalance);
      // expect(collateralTransfered).to.equal(Bond)
    });

    it("should revert on a token without decimals", async () => {
      await factory.grantRole(ISSUER_ROLE, owner.address);
      await expect(
        createBond(factory, { collateralToken: factory.address })
      ).to.be.revertedWith("function selector was not recognized");

      // WIll there be an error  payment token is less?
    });

    it("should allow anyone to call createBond with allow list disabled", async () => {
      await expect(factory.setIsAllowListEnabled(false))
        .to.emit(factory, "AllowListEnabled")
        .withArgs(false);
      expect(await factory.isAllowListEnabled()).to.be.equal(false);
      await collateralToken.transfer(
        user.address,
        await collateralToken.balanceOf(owner.address)
      );
      collateralToken
        .connect(user)
        .approve(
          factory.address,
          await collateralToken.balanceOf(user.address)
        );
      await expect(createBond(factory.connect(user))).to.emit(
        factory,
        "BondCreated"
      );
    });
  });

  describe("grantRole", async () => {
    it("should fail if non owner tries to grantRole", async () => {
      await expect(factory.connect(user).grantRole(ISSUER_ROLE, owner.address))
        .to.be.reverted;
    });

    it("should emit event", async () => {
      await expect(factory.grantRole(ISSUER_ROLE, owner.address)).to.emit(
        factory,
        "RoleGranted"
      );
    });
  });
  describe("setIsAllowListEnabled", async () => {
    it("should fail if non owner tries to update allow list", async () => {
      await expect(factory.connect(user).setIsAllowListEnabled(false)).to.be
        .reverted;
    });
    it("should toggle allow list", async () => {
      expect(await factory.isAllowListEnabled()).to.be.equal(true);

      await expect(factory.setIsAllowListEnabled(false))
        .to.emit(factory, "AllowListEnabled")
        .withArgs(false);
      expect(await factory.isAllowListEnabled()).to.be.equal(false);
      await collateralToken.transfer(
        user.address,
        await collateralToken.balanceOf(owner.address)
      );
      collateralToken
        .connect(user)
        .approve(
          factory.address,
          await collateralToken.balanceOf(user.address)
        );
      await expect(createBond(factory.connect(user))).to.emit(
        factory,
        "BondCreated"
      );

      await expect(factory.setIsAllowListEnabled(true))
        .to.emit(factory, "AllowListEnabled")
        .withArgs(true);
      expect(await factory.isAllowListEnabled()).to.be.equal(true);
    });
  });
});
