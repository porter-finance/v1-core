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
const ZERO = BigNumber.from(0);
const DECIMALS_TO_TEST = [1, 6, 18, 20, 24];
// 3 years from now, in seconds
const maturityDate = Math.round(
  new Date(new Date().setFullYear(new Date().getFullYear() + 3)).getTime() /
    1000
);

const BondConfig: BondConfigType = {
  targetBondSupply: utils.parseUnits("50000000", 18), // 50 million bonds
  collateralToken: "",
  collateralRatio: utils.parseUnits("0.5", 18),
  convertibilityRatio: ZERO,
  repaymentRatio: ONE,
  maturityDate,
  maxSupply: utils.parseUnits("50000000", 18),
};
const getTargetCollateral = (bondConfig: BondConfigType): BigNumber => {
  const { targetBondSupply, collateralRatio } = bondConfig;
  return targetBondSupply.mul(collateralRatio).div(ONE);
};
const ConvertibleBondConfig: BondConfigType = {
  targetBondSupply: utils.parseUnits("50000000", 18), // 50 million bonds
  collateralToken: "",
  collateralRatio: utils.parseUnits("0.5", 18),
  convertibilityRatio: utils.parseUnits("0.25", 18),
  repaymentRatio: ONE,
  maturityDate,
  maxSupply: utils.parseUnits("50000000", 18),
};

describe("SimpleBond", () => {
  let bond: SimpleBond;
  let convertibleBond: SimpleBond;
  let owner: SignerWithAddress;
  let bondHolder: SignerWithAddress;
  let attacker: SignerWithAddress;
  let nativeToken: TestERC20;
  let attackingToken: TestERC20;
  let mockUSDCToken: TestERC20;
  let repaymentToken: TestERC20;
  let factory: BondFactoryClone;
  let withdrawRole: BytesLike;
  let mintRole: BytesLike;
  let bonds: {
    bond: SimpleBond;
    convertibleBond: SimpleBond;
    decimals: number;
  }[];
  const getBond = ({
    convertible,
    decimals,
  }: {
    convertible: boolean;
    decimals: number;
  }): SimpleBond => {
    const foundBond = bonds.find((bond) => bond.decimals === decimals);
    if (!foundBond) {
      throw new Error(
        `No bond found for ${decimals} ${convertible ? "" : "non-"}convertible`
      );
    }
    if (convertible) {
      return foundBond.convertibleBond;
    }
    return foundBond.bond;
  };
  // no args because of gh issue:
  // https://github.com/nomiclabs/hardhat/issues/849#issuecomment-860576796
  async function fixture() {
    const { factory } = await bondFactoryFixture();
    const issuerRole = await factory.ISSUER_ROLE();

    await (await factory.grantRole(issuerRole, owner.address)).wait();

    const { nativeToken, attackingToken, mockUSDCToken, repaymentToken } =
      await tokenFixture();
    BondConfig.collateralToken = nativeToken.address;
    ConvertibleBondConfig.collateralToken = mockUSDCToken.address;
    // create convertible and non convertible bonds to use for testing with different decimals
    const bonds = await Promise.all(
      DECIMALS_TO_TEST.map(async (decimals: number) => {
        return {
          decimals,
          convertibleBond: await getBondContract(
            factory.createBond(
              "SimpleBond",
              "LUG",
              owner.address,
              ConvertibleBondConfig.maturityDate,
              repaymentToken.address,
              ConvertibleBondConfig.collateralToken,
              ConvertibleBondConfig.collateralRatio,
              ConvertibleBondConfig.convertibilityRatio,
              utils.parseUnits("1", decimals),
              BondConfig.maxSupply
            )
          ),
          bond: await getBondContract(
            factory.createBond(
              "SimpleBond",
              "LUG",
              owner.address,
              BondConfig.maturityDate,
              repaymentToken.address,
              BondConfig.collateralToken,
              BondConfig.collateralRatio,
              BondConfig.convertibilityRatio,
              utils.parseUnits("1", decimals),
              BondConfig.maxSupply
            )
          ),
        };
      })
    );
    return {
      bonds,
      nativeToken,
      attackingToken,
      mockUSDCToken,
      repaymentToken,
      factory,
    };
  }

  beforeEach(async () => {
    [owner, bondHolder, attacker] = await ethers.getSigners();
    ({
      bonds,
      nativeToken,
      attackingToken,
      mockUSDCToken,
      repaymentToken,
      factory,
    } = await loadFixture(fixture));

    bond = getBond({ convertible: false, decimals: 18 });
    convertibleBond = getBond({ convertible: true, decimals: 18 });
    withdrawRole = await bond.WITHDRAW_ROLE();
    mintRole = await bond.MINT_ROLE();
  });
  describe("configuration", async () => {
    it("should revert on less collateral than convertible", async () => {
      await expect(
        factory.createBond(
          "SimpleBond",
          "LUG",
          owner.address,
          BondConfig.maturityDate,
          repaymentToken.address,
          BondConfig.collateralToken,
          BondConfig.convertibilityRatio, // these are swapped
          BondConfig.collateralRatio, // these are swapped
          BondConfig.repaymentRatio,
          BondConfig.maxSupply
        )
      ).to.be.revertedWith("BackingRatioLessThanConvertibilityRatio");
    });
  });

  describe("creation", async () => {
    it("should have no minted coins", async () => {
      expect(await bond.balanceOf(owner.address)).to.be.equal(0);
      expect(await bond.balanceOf(bondHolder.address)).to.be.equal(0);
    });

    it("issuer has default admin role", async () => {
      expect(
        await bond.hasRole(await bond.DEFAULT_ADMIN_ROLE(), owner.address)
      ).to.be.equal(true);
    });

    it("default admin role is role admin for withdraw role", async () => {
      expect(
        await bond.hasRole(await bond.getRoleAdmin(withdrawRole), owner.address)
      ).to.be.equal(true);
    });

    it("default admin role is role admin for mint role", async () => {
      expect(
        await bond.hasRole(await bond.getRoleAdmin(mintRole), owner.address)
      ).to.be.equal(true);
    });

    it("should return total value for an account", async () => {
      expect(
        await bond.connect(bondHolder).balanceOf(owner.address)
      ).to.be.equal(0);
    });

    it("should return public parameters", async () => {
      expect(await bond.maturityDate()).to.be.equal(BondConfig.maturityDate);
      expect(await bond.collateralToken()).to.be.equal(
        BondConfig.collateralToken
      );
      expect(await bond.backingRatio()).to.be.equal(BondConfig.collateralRatio);
      expect(await bond.convertibilityRatio()).to.be.equal(0);

      expect(await bond.repaymentToken()).to.be.equal(repaymentToken.address);
    });

    it("should have predefined ERC20 attributes", async () => {
      expect(await bond.name()).to.be.equal("SimpleBond");
      expect(await bond.symbol()).to.be.equal("LUG");
    });
  });

  describe("withdrawCollateral", async () => {
    // Withdraw function will transfer all allowed collateral out of the contract
    // Burn shares and withdraw
    // Do not burn shares and withdraw
    // Excess collateral will be available to withdraw when bonds are burned
    // Excess collateral will be available to withdraw when repayment token is partially repaid
    // Excess collateral will be available to withdraw when repayment token is fully repaid
    // Excess collateral will be available to withdraw when maturity is reached

    DECIMALS_TO_TEST.forEach((decimals) => {
      describe(`non-convertible ${decimals} decimals`, async () => {
        beforeEach(async () => {
          bond = getBond({
            convertible: false,
            decimals,
          });
          const token = mockUSDCToken.attach(BondConfig.collateralToken);
          const amountToDeposit = getTargetCollateral(BondConfig);
          await token.approve(bond.address, amountToDeposit);
          await bond.mint(BondConfig.targetBondSupply);
        });
        [
          {
            sharesToBurn: 0,
            collateralToReceive: ZERO,
          },
          {
            sharesToBurn: utils.parseUnits("1000", 18),
            collateralToReceive: utils
              .parseUnits("1000", 18)
              .mul(BondConfig.collateralRatio)
              .div(ONE),
          },
        ].forEach(({ sharesToBurn, collateralToReceive }) => {
          it("Excess collateral will be available to withdraw when bonds are burned", async () => {
            await (await bond.burn(sharesToBurn)).wait();
            expect(await bond.previewWithdraw()).to.equal(collateralToReceive);
          });
        });

        [
          {
            sharesToBurn: 0,
            repaymentTokenAmount: utils.parseUnits("1000", decimals),
            collateralToReceive: utils
              .parseUnits("1000", 18)
              .mul(BondConfig.collateralRatio)
              .div(ONE),
          },
          {
            sharesToBurn: utils.parseUnits("1000", 18),
            repaymentTokenAmount: utils.parseUnits("1000", decimals),
            collateralToReceive: utils
              .parseUnits("2000", 18)
              .mul(BondConfig.collateralRatio)
              .div(ONE),
          },
        ].forEach(
          ({ sharesToBurn, repaymentTokenAmount, collateralToReceive }) => {
            it("Excess collateral will be available to withdraw when repayment token is partially repaid", async () => {
              await (await bond.burn(sharesToBurn)).wait();
              await repaymentToken.approve(bond.address, repaymentTokenAmount);
              await (await bond.repay(repaymentTokenAmount)).wait();
              expect(await bond.previewWithdraw()).to.equal(
                collateralToReceive
              );
            });
          }
        );

        [
          {
            sharesToBurn: 0,
            repaymentTokenAmount: BondConfig.targetBondSupply
              .mul(utils.parseUnits("1", decimals))
              .div(ONE),
            collateralToReceive: getTargetCollateral(BondConfig),
          },
          {
            sharesToBurn: utils.parseUnits("1000", 18),
            repaymentTokenAmount: BondConfig.targetBondSupply
              .mul(utils.parseUnits("1", decimals))
              .div(ONE),
            collateralToReceive: getTargetCollateral(BondConfig),
          },
        ].forEach(
          ({ sharesToBurn, repaymentTokenAmount, collateralToReceive }) => {
            it("Excess collateral will be available to withdraw when repayment token is fully repaid", async () => {
              await (await bond.burn(sharesToBurn)).wait();
              await repaymentToken.approve(bond.address, repaymentTokenAmount);
              await (await bond.repay(repaymentTokenAmount)).wait();
              expect(await bond.previewWithdraw()).to.equal(
                collateralToReceive
              );
            });
          }
        );

        [
          {
            sharesToBurn: 0,
            repaymentTokenAmount: BondConfig.targetBondSupply
              .mul(utils.parseUnits("1", decimals))
              .div(ONE),
            collateralToReceive: getTargetCollateral(BondConfig),
          },
          {
            sharesToBurn: 0,
            repaymentTokenAmount: BondConfig.targetBondSupply
              .mul(utils.parseUnits("1", decimals))
              .div(ONE),
            collateralToReceive: getTargetCollateral(BondConfig),
          },
        ].forEach(
          ({ sharesToBurn, repaymentTokenAmount, collateralToReceive }) => {
            it("Excess collateral will be available to withdraw when maturity is reached", async () => {
              await (await bond.burn(sharesToBurn)).wait();
              await repaymentToken.approve(bond.address, repaymentTokenAmount);
              await (await bond.repay(repaymentTokenAmount)).wait();
              expect(await bond.previewWithdraw()).to.equal(
                collateralToReceive
              );
            });
          }
        );
        it("reverts when called by non-withdrawer", async () => {
          await expect(
            bond.connect(attacker).withdrawCollateral()
          ).to.be.revertedWith(
            `AccessControl: account ${attacker.address.toLowerCase()} is missing role ${withdrawRole}`
          );
        });

        it("granting and revoking withdraw role works correctly", async () => {
          await bond.grantRole(withdrawRole, attacker.address);
          await expect(bond.connect(attacker).withdrawCollateral()).to.not.be
            .reverted;

          await bond.revokeRole(withdrawRole, attacker.address);
          await expect(
            bond.connect(attacker).withdrawCollateral()
          ).to.be.revertedWith(
            `AccessControl: account ${attacker.address.toLowerCase()} is missing role ${withdrawRole}`
          );
        });
      });
    });
    DECIMALS_TO_TEST.forEach((decimals) => {
      describe(`non-convertible ${decimals} decimals`, async () => {
        beforeEach(async () => {
          bond = getBond({
            convertible: false,
            decimals,
          });
          const token = mockUSDCToken.attach(
            ConvertibleBondConfig.collateralToken
          );
          const amountToDeposit = getTargetCollateral(ConvertibleBondConfig);
          await token.approve(convertibleBond.address, amountToDeposit);
          await convertibleBond.mint(ConvertibleBondConfig.targetBondSupply);
        });
        [
          {
            sharesToBurn: 0,
            collateralToReceive: ZERO,
          },
          {
            sharesToBurn: utils.parseUnits("1000", 18),
            collateralToReceive: utils
              .parseUnits("1000", 18)
              .mul(ConvertibleBondConfig.collateralRatio)
              .div(ONE),
          },
        ].forEach(({ sharesToBurn, collateralToReceive }) => {
          it("Excess collateral will be available to withdraw when bonds are burned", async () => {
            await (await convertibleBond.burn(sharesToBurn)).wait();
            expect(await convertibleBond.previewWithdraw()).to.equal(
              collateralToReceive
            );
          });
        });

        [
          {
            sharesToBurn: 0,
            repaymentTokenAmount: utils.parseUnits("1000", 18),
            collateralToReceive: utils
              .parseUnits("1000", 18)
              .mul(ConvertibleBondConfig.collateralRatio)
              .div(ONE),
          },
          {
            sharesToBurn: utils.parseUnits("1000", 18),
            repaymentTokenAmount: utils.parseUnits("1000", 18),
            collateralToReceive: utils
              .parseUnits("2000", 18)
              .mul(ConvertibleBondConfig.collateralRatio)
              .div(ONE),
          },
        ].forEach(
          ({ sharesToBurn, repaymentTokenAmount, collateralToReceive }) => {
            it("Excess collateral will be available to withdraw when repayment token is partially repaid", async () => {
              await (await convertibleBond.burn(sharesToBurn)).wait();
              await repaymentToken.approve(
                convertibleBond.address,
                repaymentTokenAmount
              );
              await (await convertibleBond.repay(repaymentTokenAmount)).wait();
              expect(await convertibleBond.previewWithdraw()).to.equal(
                collateralToReceive
              );
            });
          }
        );

        [
          {
            sharesToBurn: 0,
            repaymentTokenAmount: ConvertibleBondConfig.targetBondSupply,
            collateralToReceive: getTargetCollateral(ConvertibleBondConfig),
          },
          {
            sharesToBurn: utils.parseUnits("1000", 18),
            repaymentTokenAmount: ConvertibleBondConfig.targetBondSupply,
            collateralToReceive: getTargetCollateral(ConvertibleBondConfig),
          },
        ].forEach(
          ({ sharesToBurn, repaymentTokenAmount, collateralToReceive }) => {
            it("Excess collateral will be available to withdraw when repayment token is fully repaid", async () => {
              await (await convertibleBond.burn(sharesToBurn)).wait();
              await repaymentToken.approve(
                convertibleBond.address,
                repaymentTokenAmount
              );
              await (await convertibleBond.repay(repaymentTokenAmount)).wait();
              expect(await convertibleBond.previewWithdraw()).to.equal(
                collateralToReceive
              );
            });
          }
        );

        [
          {
            sharesToBurn: 0,
            repaymentTokenAmount: ConvertibleBondConfig.targetBondSupply.div(4),
            collateralToReceive: ConvertibleBondConfig.targetBondSupply
              .div(4)
              .mul(ConvertibleBondConfig.collateralRatio)
              .div(ONE),
          },
          {
            sharesToBurn: 0,
            repaymentTokenAmount: ConvertibleBondConfig.targetBondSupply,
            collateralToReceive: getTargetCollateral(ConvertibleBondConfig),
          },
        ].forEach(
          ({ sharesToBurn, repaymentTokenAmount, collateralToReceive }) => {
            it("Excess collateral will be available to withdraw when maturity is reached", async () => {
              await (await convertibleBond.burn(sharesToBurn)).wait();
              await repaymentToken.approve(
                convertibleBond.address,
                repaymentTokenAmount
              );
              await (await convertibleBond.repay(repaymentTokenAmount)).wait();
              await ethers.provider.send("evm_mine", [
                ConvertibleBondConfig.maturityDate,
              ]);
              expect(await convertibleBond.previewWithdraw()).to.equal(
                collateralToReceive
              );
            });
          }
        );
        it("reverts when called by non-withdrawer", async () => {
          await expect(
            bond.connect(attacker).withdrawCollateral()
          ).to.be.revertedWith(
            `AccessControl: account ${attacker.address.toLowerCase()} is missing role ${withdrawRole}`
          );
        });

        it("granting and revoking withdraw role works correctly", async () => {
          await convertibleBond.grantRole(withdrawRole, attacker.address);
          await expect(convertibleBond.connect(attacker).withdrawCollateral())
            .to.not.be.reverted;

          await convertibleBond.revokeRole(withdrawRole, attacker.address);
          await expect(
            convertibleBond.connect(attacker).withdrawCollateral()
          ).to.be.revertedWith(
            `AccessControl: account ${attacker.address.toLowerCase()} is missing role ${withdrawRole}`
          );
        });
      });
    });
  });
  DECIMALS_TO_TEST.forEach((decimals) =>
    describe(`${decimals} decimals repayment`, async () => {
      beforeEach(async () => {
        bond = getBond({ convertible: false, decimals });
        const token = mockUSDCToken.attach(BondConfig.collateralToken);
        const amountToDeposit = BondConfig.targetBondSupply
          .mul(BondConfig.collateralRatio)
          .div(ONE);
        await token.approve(bond.address, amountToDeposit);
        await expect(bond.mint(BondConfig.targetBondSupply)).to.not.be.reverted;
        await repaymentToken.approve(
          bond.address,
          BondConfig.targetBondSupply
            .mul(utils.parseUnits("1", decimals))
            .div(ONE)
        );
      });
      it("accepts partial repayment", async () => {
        await (
          await bond.repay(
            BondConfig.targetBondSupply
              .div(2)
              .mul(utils.parseUnits("1", decimals))
              .div(ONE)
          )
        ).wait();

        await expect(
          bond.repay(
            BondConfig.targetBondSupply
              .div(2)
              .mul(utils.parseUnits("1", decimals))
              .div(ONE)
          )
        ).to.emit(bond, "RepaymentInFull");
      });

      it("accepts repayment", async () => {
        await expect(
          bond.repay(
            BondConfig.targetBondSupply
              .mul(utils.parseUnits("1", decimals))
              .div(ONE)
          )
        ).to.emit(bond, "RepaymentInFull");
      });

      it("fails if already repaid", async () => {
        await bond.repay(
          BondConfig.targetBondSupply
            .mul(utils.parseUnits("1", decimals))
            .div(ONE)
        );
        await expect(
          bond.repay(
            BondConfig.targetBondSupply
              .mul(utils.parseUnits("1", decimals))
              .div(ONE)
          )
        ).to.be.revertedWith("RepaymentMet");
      });
    })
  );

  describe("minting", async () => {
    beforeEach(async () => {
      await mockUSDCToken
        .attach(BondConfig.collateralToken)
        .approve(bond.address, getTargetCollateral(BondConfig));
    });

    it("reverts when called by non-minter", async () => {
      await expect(bond.connect(attacker).mint(0)).to.be.revertedWith(
        `AccessControl: account ${attacker.address.toLowerCase()} is missing role ${mintRole}`
      );
    });

    [
      {
        mintAmount: 0,
        collateralToDeposit: ZERO,
        description: "zero target",
      },
      {
        mintAmount: BondConfig.targetBondSupply.div(4),
        collateralToDeposit: BondConfig.collateralRatio
          .mul(BondConfig.targetBondSupply.div(4))
          .div(ONE),
        description: "quarter target",
      },
      {
        mintAmount: BondConfig.targetBondSupply.div(2),
        collateralToDeposit: BondConfig.collateralRatio
          .mul(BondConfig.targetBondSupply.div(2))
          .div(ONE),
        description: "half target",
      },
      {
        mintAmount: BondConfig.targetBondSupply,
        collateralToDeposit: getTargetCollateral(BondConfig),
        description: "target",
      },
    ].forEach(({ mintAmount, collateralToDeposit, description }) => {
      it(`previews mint ${description}`, async () => {
        expect(await bond.previewMint(mintAmount)).to.equal(
          collateralToDeposit
        );
      });
    });

    it("mints up to collateral depositted", async () => {
      await expect(bond.mint(BondConfig.targetBondSupply)).to.not.be.reverted;
      expect(await bond.totalSupply()).to.equal(BondConfig.targetBondSupply);
    });

    it("cannot mint more than max supply", async () => {
      await expect(
        bond.mint(BondConfig.targetBondSupply.add(1))
      ).to.be.revertedWith("BondSupplyExceeded");
    });
  });

  describe("redemption", async () => {
    // Bond holder has 1000 bonds
    let sharesToSellToBondHolder = utils.parseUnits("1000", 18);
    // Bond holder will have their bonds and the contract will be able to accept deposits of repayment token
    beforeEach(async () => {
      sharesToSellToBondHolder = utils.parseUnits("1000", 18);
      const amountToDeposit = BondConfig.targetBondSupply
        .mul(BondConfig.collateralRatio)
        .div(ONE);
      await mockUSDCToken
        .attach(BondConfig.collateralToken)
        .approve(bond.address, amountToDeposit);
      await bond.mint(BondConfig.targetBondSupply);
      await bond.transfer(bondHolder.address, sharesToSellToBondHolder);
      await repaymentToken.approve(bond.address, BondConfig.targetBondSupply);
    });

    [
      {
        sharesToRedeem: sharesToSellToBondHolder,
        repaymentTokenToSend: sharesToSellToBondHolder,
        collateralTokenToSend: ZERO,
      },
      {
        sharesToRedeem: 0,
        repaymentTokenToSend: ZERO,
        collateralTokenToSend: ZERO,
      },
      {
        sharesToRedeem: utils.parseUnits("333", 18),
        repaymentTokenToSend: utils.parseUnits("333", 18),
        collateralTokenToSend: ZERO,
      },
    ].forEach(
      ({ sharesToRedeem, repaymentTokenToSend, collateralTokenToSend }) => {
        it("Bond is repaid & past maturity = Withdraw of repayment token", async () => {
          await bond.repay(BondConfig.targetBondSupply);
          await ethers.provider.send("evm_mine", [BondConfig.maturityDate]);
          expect(
            await bond.connect(bondHolder).previewRedeem(sharesToRedeem)
          ).to.deep.equal([repaymentTokenToSend, collateralTokenToSend]);
        });
      }
    );

    [
      {
        sharesToRedeem: sharesToSellToBondHolder,
        repaymentTokenToSend: ZERO,
        collateralTokenToSend: ZERO,
      },
      {
        sharesToRedeem: 0,
        repaymentTokenToSend: ZERO,
        collateralTokenToSend: ZERO,
      },
    ].forEach(
      ({ sharesToRedeem, repaymentTokenToSend, collateralTokenToSend }) => {
        it("Bond is repaid & not past maturity = No withdraw", async () => {
          await bond.repay(BondConfig.targetBondSupply);
          expect(
            await bond.connect(bondHolder).previewRedeem(sharesToRedeem)
          ).to.deep.equal([repaymentTokenToSend, collateralTokenToSend]);
        });
      }
    );

    [
      {
        sharesToRedeem: sharesToSellToBondHolder,
        repaymentTokenToSend: ZERO,
        collateralTokenToSend: sharesToSellToBondHolder
          .mul(BondConfig.collateralRatio)
          .div(ONE),
      },
      {
        sharesToRedeem: 0,
        repaymentTokenToSend: ZERO,
        collateralTokenToSend: ZERO,
      },
    ].forEach(
      ({ sharesToRedeem, repaymentTokenToSend, collateralTokenToSend }) => {
        it("Bond is not repaid & past maturity = Withdraw of collateral", async () => {
          await ethers.provider.send("evm_mine", [BondConfig.maturityDate]);
          expect(
            await bond.connect(bondHolder).previewRedeem(sharesToRedeem)
          ).to.deep.equal([repaymentTokenToSend, collateralTokenToSend]);
        });
      }
    );

    [
      {
        sharesToRedeem: sharesToSellToBondHolder,
        repaymentTokenToSend: sharesToSellToBondHolder
          .mul(BondConfig.targetBondSupply.div(2))
          .div(BondConfig.targetBondSupply),
        collateralTokenToSend: sharesToSellToBondHolder
          .mul(
            // this is the amount of collateral in the contract. can't use await totalCollateral here since we're in the describe. could put in the beforeEach, but i'd rather be explicit here
            BondConfig.targetBondSupply
              .div(2)
              .mul(BondConfig.collateralRatio)
              .div(ONE)
          )
          .div(BondConfig.targetBondSupply.div(2)),
      },
      {
        sharesToRedeem: 0,
        repaymentTokenToSend: ZERO,
        collateralTokenToSend: ZERO,
      },
    ].forEach(
      ({ sharesToRedeem, repaymentTokenToSend, collateralTokenToSend }) => {
        it("Bond is partially repaid & past maturity = Withdraw of collateral & repayment token", async () => {
          await bond.repay(BondConfig.targetBondSupply.div(2));
          await ethers.provider.send("evm_mine", [BondConfig.maturityDate]);
          expect(
            await bond.connect(bondHolder).previewRedeem(sharesToRedeem)
          ).to.deep.equal([repaymentTokenToSend, collateralTokenToSend]);
        });
      }
    );

    [
      {
        sharesToRedeem: sharesToSellToBondHolder,
        repaymentTokenToSend: ZERO,
        collateralTokenToSend: ZERO,
      },
      {
        sharesToRedeem: 0,
        repaymentTokenToSend: ZERO,
        collateralTokenToSend: ZERO,
      },
    ].forEach(
      ({ sharesToRedeem, repaymentTokenToSend, collateralTokenToSend }) => {
        it("Bond is not repaid & not past maturity = No withdraw", async () => {
          expect(
            await bond.connect(bondHolder).previewRedeem(sharesToRedeem)
          ).to.deep.equal([repaymentTokenToSend, collateralTokenToSend]);
        });
      }
    );

    it("should redeem bond at maturity for repayment token", async () => {
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
      expect(await repaymentToken.balanceOf(bondHolder.address)).to.be.equal(
        sharesToSellToBondHolder
      );
    });
    it("should redeem bond at default for collateral token", async () => {
      const expectedCollateralToReceive = sharesToSellToBondHolder
        .mul(await bond.totalCollateral())
        .div(await bond.totalSupply());
      await ethers.provider.send("evm_mine", [BondConfig.maturityDate]);
      const {
        receiver,
        repaymentToken,
        collateralToken,
        amountOfBondsRedeemed,
        amountOfRepaymentTokensReceived,
        amountOfCollateralReceived,
      } = await getEventArgumentsFromTransaction(
        await bond.connect(bondHolder).redeem(sharesToSellToBondHolder),
        "Redeem"
      );
      expect(receiver).to.equal(bondHolder.address);
      expect(collateralToken).to.equal(BondConfig.collateralToken);
      expect(amountOfBondsRedeemed).to.equal(sharesToSellToBondHolder);
      expect(amountOfRepaymentTokensReceived).to.equal(0);
      expect(amountOfCollateralReceived).to.equal(expectedCollateralToReceive);

      expect(await bond.balanceOf(bondHolder.address)).to.be.equal(0);
      expect(
        await mockUSDCToken.attach(repaymentToken).balanceOf(bondHolder.address)
      ).to.be.equal(0);
      expect(
        await mockUSDCToken
          .attach(BondConfig.collateralToken)
          .balanceOf(bondHolder.address)
      ).to.be.equal(
        BondConfig.collateralRatio.mul(sharesToSellToBondHolder).div(ONE)
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
        const amountToDeposit = getTargetCollateral(BondConfig);
        await token.approve(convertibleBond.address, amountToDeposit);
        await convertibleBond.mint(ConvertibleBondConfig.targetBondSupply);
        await convertibleBond.transfer(bondHolder.address, tokensToConvert);
      });
      [
        { convertAmount: 0, assetsToReceive: 0, description: "zero converted" },
        {
          convertAmount: BondConfig.targetBondSupply,
          assetsToReceive: BondConfig.convertibilityRatio
            .mul(BondConfig.targetBondSupply)
            .div(ONE),
          description: "target converted",
        },
        {
          convertAmount: BondConfig.targetBondSupply.div(2),
          assetsToReceive: BondConfig.convertibilityRatio
            .mul(BondConfig.targetBondSupply.div(2))
            .div(ONE),
          description: "double target converted",
        },
      ].forEach(({ convertAmount, assetsToReceive, description }) => {
        it(`previews convert ${description}`, async () => {
          expect(await bond.previewConvert(convertAmount)).to.equal(
            assetsToReceive
          );
        });
      });
      it("converts bond amount into collateral at convertibilityRatio", async () => {
        const expectedCollateralToWithdraw = tokensToConvert
          .mul(ConvertibleBondConfig.convertibilityRatio)
          .div(ONE);
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

    it("disallows removal of a collateral, repayment, or itself", async () => {
      await expect(bond.sweep(bond.address)).to.be.revertedWith(
        "SweepDisallowedForToken"
      );
      await expect(bond.sweep(repaymentToken.address)).to.be.revertedWith(
        "SweepDisallowedForToken"
      );
      await expect(bond.sweep(nativeToken.address)).to.be.revertedWith(
        "SweepDisallowedForToken"
      );
    });
  });
});
