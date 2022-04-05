import { BigNumber, utils, BytesLike } from "ethers";
import { expect } from "chai";
import { TestERC20, Bond, BondFactory } from "../typechain";
import {
  expectTokenDelta,
  getBondContract,
  getTargetPayment,
  getEventArgumentsFromTransaction,
  burnAndWithdraw,
  payAndWithdraw,
  payAndWithdrawAtMaturity,
  previewRedeem,
  downscaleAmount,
  redeemAndCheckTokens,
} from "./utilities";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { bondFactoryFixture, tokenFixture } from "./shared/fixtures";
import { BondConfigType, BondWithTokens } from "./interfaces";
import {
  ONE,
  ZERO,
  NonConvertibleBondConfig,
  ConvertibleBondConfig,
  UncollateralizedBondConfig,
} from "./constants";

// https://ethereum-waffle.readthedocs.io/en/latest/fixtures.html
// import from waffle since we are using hardhat: https://hardhat.org/plugins/nomiclabs-hardhat-waffle.html#environment-extensions
const { ethers, waffle } = require("hardhat");
const { loadFixture } = waffle;

// Used throughout tests to use multiple instances of different-decimal tokens
const DECIMALS_TO_TEST = [6, 8, 18];

/**
  The following `describe` encompasses the whole Bond contract split
  up into the main functions of the contract. Most of the defined variables
  inside this main `describe` are assigned in the first `beforeEach`.
  The rest of the variables are assigned in the `beforeEach` within
  the main DECIMALS_TO_TEST forEach loop. Within each main category
  also contains usage of different bond types (see the above configs):

  bond - a bond with a ZERO convertibilityRatio (not convertible)
  convertibleBond - a bond with a defined convertibilityRatio
  uncollateralizedBond - a bond with zero collateral (not convertible)
  
  Recommended to use your editors "fold all" and unfolding the test of interest.
  "command / ctrl + k" -> "command / ctrl 0" for Visual Studio Code
*/
describe("Bond", () => {
  // owner deploys and is the "issuer"
  let owner: SignerWithAddress;
  // bondHolder is one who has the bonds and will redeem or convert them
  let bondHolder: SignerWithAddress;
  // attacker is trying to break the contract
  let attacker: SignerWithAddress;
  // our factory contract that deploys bonds
  let factory: BondFactory;
  // roles used with access control
  let withdrawRole: BytesLike;
  // this is a list of bonds created with the specific decimal tokens
  let bonds: BondWithTokens[];
  let roles: {
    defaultAdminRole: string;
    withdrawRole: string;
  };
  // function to retrieve the bonds and tokens by decimal used
  const getBond = ({ decimals }: { decimals: number }) => {
    const foundBond = bonds.find((bond) => bond.decimals === decimals);
    if (!foundBond) {
      throw new Error(`No bond found for ${decimals}`);
    }
    return foundBond;
  };
  /** 
    the waffle "fixture" which creates the factory, tokens, bonds, and saves the state
    of the blockchain to speed up the re-execution of every test since this "resets"
    the state on the main beforeEach
  */
  async function fixture() {
    const { factory } = await bondFactoryFixture();
    const issuerRole = await factory.ISSUER_ROLE();

    await (await factory.grantRole(issuerRole, owner.address)).wait();
    await (await factory.grantRole(issuerRole, attacker.address)).wait();

    /** 
      Create and deploy all tokens with corresponding decimals for DECIMALS_TO_TEST.
      The collateral token is not scaled in the same way that the payment token is.
      The collateral token can be scaled by the `collateralRatio`.
    */
    const { tokens } = await tokenFixture(DECIMALS_TO_TEST);
    /**
      The following maps over the DECIMALS_TO_TEST and returns a promise with an object
      containing the tokens, bonds, and the specific `decimals` used for that creation.
      This bond list resolves to deployed contracts and saved in this fixture.
      This fixture takes a snapshot of the blockchain with these contracts and will
      be fetched new upon `loadFixture()` in this "Bond" `beforeEach`.
    */
    const bonds = await Promise.all(
      DECIMALS_TO_TEST.map(async (decimals: number) => {
        // get the corresponding tokens for the decimal specified to use in the new bonds
        const token = tokens.find((token) => token.decimals === decimals);
        if (token) {
          const { attackingToken, paymentToken, collateralToken } = token;

          await collateralToken.approve(
            factory.address,
            ethers.constants.MaxUint256
          );

          return {
            decimals,
            attackingToken,
            paymentToken,
            collateralToken,
            nonConvertible: {
              bond: await getBondContract(
                factory.createBond(
                  "Bond",
                  "LUG",
                  NonConvertibleBondConfig.maturityDate,
                  paymentToken.address,
                  collateralToken.address,
                  NonConvertibleBondConfig.collateralRatio,
                  NonConvertibleBondConfig.convertibleRatio,
                  NonConvertibleBondConfig.maxSupply
                )
              ),
              config: NonConvertibleBondConfig,
            },
            convertible: {
              bond: await getBondContract(
                factory.createBond(
                  "Bond",
                  "LUG",
                  ConvertibleBondConfig.maturityDate,
                  paymentToken.address,
                  collateralToken.address,
                  ConvertibleBondConfig.collateralRatio,
                  ConvertibleBondConfig.convertibleRatio,
                  ConvertibleBondConfig.maxSupply
                )
              ),
              config: ConvertibleBondConfig,
            },
            uncollateralized: {
              bond: await getBondContract(
                factory.createBond(
                  "Bond",
                  "LUG",
                  UncollateralizedBondConfig.maturityDate,
                  paymentToken.address,
                  collateralToken.address,
                  UncollateralizedBondConfig.collateralRatio,
                  UncollateralizedBondConfig.convertibleRatio,
                  UncollateralizedBondConfig.maxSupply
                )
              ),
              config: UncollateralizedBondConfig,
            },
          };
        }
      })
    );

    // all bonds will be the same roles - take the first one
    let roles;
    if (bonds[0]) {
      const { nonConvertible } = bonds[0];
      roles = {
        defaultAdminRole: await nonConvertible.bond.DEFAULT_ADMIN_ROLE(),
        withdrawRole: await nonConvertible.bond.WITHDRAW_ROLE(),
      };
    }

    return {
      bonds,
      factory,
      roles,
    };
  }

  beforeEach(async () => {
    // the signers are assigned here and used throughout the tests
    [owner, bondHolder, attacker] = await ethers.getSigners();
    // this is the bonds used in the getBond function
    ({ bonds, factory, roles } = await loadFixture(fixture));
    ({ withdrawRole } = roles);
  });

  /**
    Here, loop over all DECIMALS_TO_TEST list of decimals, running all of the tests.
    In the `beforeEach` the bonds configured with either the `BondConfig`, `ConvertibleBondConfig`,
    or `UncollateralizedBondConfig` and the tokens within use the specified decimals. See the `fixture()`
    to understand how this bond list is created.
  */
  DECIMALS_TO_TEST.forEach((decimals) => {
    describe(`${decimals}-decimal payment token`, async () => {
      // bond instance to test. overwritten throughout testing
      let bond: Bond;
      let bondWithTokens: BondWithTokens;
      let config: BondConfigType;
      // tokens used throughout testing and are also overwritten (different decimal versions)
      let collateralToken: TestERC20;
      let attackingToken: TestERC20;
      let paymentToken: TestERC20;
      beforeEach(async () => {
        bondWithTokens = getBond({ decimals });
        ({ attackingToken, collateralToken, paymentToken } = bondWithTokens);
      });

      describe("initialize", async () => {
        describe("non-convertible", async () => {
          beforeEach(async () => {
            bond = bondWithTokens.nonConvertible.bond;
            config = bondWithTokens.nonConvertible.config;
          });
          it("should disallow calling initialize again", async () => {
            await expect(
              bond.initialize(
                "Bond",
                "LUG",
                owner.address,
                config.maturityDate,
                paymentToken.address,
                collateralToken.address,
                utils.parseUnits(".25", 18),
                utils.parseUnits(".5", 18),
                config.maxSupply
              )
            ).to.be.revertedWith(
              "Initializable: contract is already initialized"
            );
          });

          it("should verifiable as bond by Factory.isBond", async () => {
            expect(await factory.isBond(bond.address)).to.be.equal(true);
          });

          it("should have minted total supply of coins", async () => {
            expect(await bond.balanceOf(owner.address)).to.be.equal(
              config.maxSupply
            );
          });

          it("should have given issuer the default admin role", async () => {
            expect(
              await bond.hasRole(await bond.DEFAULT_ADMIN_ROLE(), owner.address)
            ).to.be.equal(true);
          });

          it("should return the issuer as the role admin for the withdraw role", async () => {
            expect(
              await bond.hasRole(
                await bond.getRoleAdmin(withdrawRole),
                owner.address
              )
            ).to.be.equal(true);
          });

          // it("should return configured public parameters", async () => {
          //   expect(await bond.maturityDate()).to.be.equal(config.maturityDate);
          //   expect(await bond.collateralToken()).to.be.equal(
          //     collateralToken.address
          //   );
          //   expect(await bond.collateralRatio()).to.be.equal(
          //     config.collateralRatio
          //   );
          //   expect(await bond.convertibleRatio()).to.be.equal(
          //     config.convertibleRatio
          //   );

          //   expect(await bond.paymentToken()).to.be.equal(paymentToken.address);
          // });

          it("should have configured ERC20 attributes", async () => {
            expect(await bond.name()).to.be.equal("Bond");
            expect(await bond.symbol()).to.be.equal("LUG");
          });
        });
      });
      describe("#withdrawExcessPayment", async () => {
        describe("non-convertible", async () => {
          beforeEach(async () => {
            bond = bondWithTokens.nonConvertible.bond;
            config = bondWithTokens.nonConvertible.config;
            await paymentToken.approve(
              bond.address,
              ethers.constants.MaxUint256
            );
          });

          it("should withdraw zero payment when bond is not overpaid", async () => {
            expect(await bond.amountOverPaid()).to.equal(0);
            await paymentToken.transfer(bond.address, await bond.amountOwed());
            expect(await bond.amountOverPaid()).to.equal(0);
          });

          it("should withdraw excess payment when bond is overpaid", async () => {
            await paymentToken.transfer(
              bond.address,
              (await bond.amountOwed()).add(1)
            );
            expect(await bond.amountOverPaid()).to.equal(1);
            await bond.withdrawExcessPayment();
            expect(await bond.amountOverPaid()).to.equal(0);
          });
          it("should withdraw excess payment when bonds are redeemed", async () => {
            const bonds = await bond.balanceOf(owner.address);
            const fullPayment = await bond.amountOwed();
            await paymentToken.transfer(bond.address, fullPayment.mul(2));
            expect(await bond.amountOverPaid()).to.equal(fullPayment);
            const [paymentOnRedeem] = await bond.previewRedeemAtMaturity(bonds);
            expect(paymentOnRedeem).to.equal(fullPayment);
            await bond.redeem(bonds);

            expect(await bond.amountOverPaid()).to.equal(fullPayment);
            await bond.withdrawExcessPayment();
            expect(await bond.amountOverPaid()).to.equal(0);
          });
          it("should have available overpayment when partially paid and all bonds are burnt", async () => {
            const bonds = await bond.balanceOf(owner.address);
            const halfPayment = (await bond.amountOwed()).div(2);
            await paymentToken.transfer(bond.address, halfPayment);
            expect(await bond.amountOverPaid()).to.equal(0);
            await bond.burn(bonds);
            expect(await bond.amountOverPaid()).to.equal(halfPayment);
          });
        });
        describe("convertible", async () => {
          beforeEach(async () => {
            bond = bondWithTokens.convertible.bond;
            config = bondWithTokens.convertible.config;
            await paymentToken.approve(
              bond.address,
              ethers.constants.MaxUint256
            );
          });
          it("should withdraw excess payment when bonds are converted", async () => {
            const halfBonds = (await bond.balanceOf(owner.address)).div(2);
            const fullPayment = await bond.amountOwed();
            await paymentToken.transfer(bond.address, fullPayment);
            expect(await bond.amountOverPaid()).to.equal(0);
            await bond.convert(halfBonds);
            expect(await bond.amountOverPaid()).to.equal(fullPayment.div(2));
            await bond.convert(halfBonds);
            expect(await bond.amountOverPaid()).to.equal(fullPayment);
            await bond.withdrawExcessPayment();
            expect(await bond.amountOverPaid()).to.equal(0);
          });
        });
      });

      describe("pay", async () => {
        describe("non-convertible", async () => {
          beforeEach(async () => {
            bond = bondWithTokens.nonConvertible.bond;
            config = bondWithTokens.nonConvertible.config;
            await paymentToken.approve(
              bond.address,
              config.maxSupply.mul(utils.parseUnits("1", decimals)).div(ONE)
            );
          });
          it("should accept partial payment", async () => {
            const halfSupplyMinusOne = config.maxSupply
              .div(2)
              .sub(1)
              .mul(utils.parseUnits("1", decimals))
              .div(ONE);

            await (await bond.pay(BigNumber.from(1))).wait();
            await (await bond.pay(halfSupplyMinusOne)).wait();
            await expect(bond.pay(halfSupplyMinusOne)).to.emit(bond, "Payment");
          });

          it("should accept full payment in steps", async () => {
            const thirdSupply = config.maxSupply
              .div(3)
              .mul(utils.parseUnits("1", decimals))
              .div(ONE);
            await (await bond.pay(thirdSupply)).wait();
            await (await bond.pay(thirdSupply)).wait();
            await (await bond.pay(thirdSupply)).wait();
            await expect(bond.pay(2)).to.emit(bond, "Payment");
          });

          it("should accept payment", async () => {
            await expect(bond.pay(getTargetPayment(config, decimals))).to.emit(
              bond,
              "Payment"
            );
          });

          it("should fail if already paid", async () => {
            await bond.pay(
              config.maxSupply.mul(utils.parseUnits("1", decimals)).div(ONE)
            );
            await expect(
              bond.pay(getTargetPayment(config, decimals))
            ).to.be.revertedWith("PaymentMet");
          });

          it("should fail on zero payment amount", async () => {
            await expect(bond.pay(ZERO)).to.be.revertedWith("ZeroAmount");
          });

          it("should return amount owed scaled to payment amount", async () => {
            const thirdSupply = config.maxSupply
              .div(3)
              .mul(utils.parseUnits("1", decimals))
              .div(ONE);

            expect(await bond.amountOwed()).to.equal(
              downscaleAmount(config.maxSupply, decimals)
            );

            await (await bond.pay(thirdSupply)).wait();
            expect(await bond.amountOwed()).to.equal(
              downscaleAmount(config.maxSupply, decimals).sub(
                await bond.paymentBalance()
              )
            );

            await (await bond.pay(thirdSupply)).wait();
            expect(await bond.amountOwed()).to.equal(
              downscaleAmount(config.maxSupply, decimals).sub(
                await bond.paymentBalance()
              )
            );

            await (await bond.pay(thirdSupply)).wait();
            expect(await bond.amountOwed()).to.equal(BigNumber.from(2));

            await expect(bond.pay(2)).to.emit(bond, "Payment");
            expect(await bond.amountOwed()).to.equal(
              downscaleAmount(ZERO, decimals)
            );
          });
        });
      });
      describe("withdrawCollateral", async () => {
        describe(`non-convertible`, async () => {
          beforeEach(async () => {
            bond = bondWithTokens.nonConvertible.bond;
            config = bondWithTokens.nonConvertible.config;
            await collateralToken.approve(
              bond.address,
              config.collateralTokenAmount
            );
          });
          it(`should make excess collateral available to withdraw when zero amount are burned`, async () => {
            await burnAndWithdraw({
              bond,
              sharesToBurn: ZERO,
              collateralToReceive: ZERO,
            });
          });

          it(`should make excess collateral available to withdraw when collateral rounded down are burned`, async () => {
            await burnAndWithdraw({
              bond,
              sharesToBurn: BigNumber.from(1),
              collateralToReceive: ZERO,
            });
          });

          it(`should make excess collateral available to withdraw when smallest unit are burned`, async () => {
            await burnAndWithdraw({
              bond,
              sharesToBurn: ONE.div(await bond.collateralRatio()),
              collateralToReceive: BigNumber.from(1),
            });
          });

          it(`should make excess collateral available to withdraw when total amount are burned`, async () => {
            await burnAndWithdraw({
              bond,
              sharesToBurn: config.maxSupply,
              collateralToReceive: config.collateralTokenAmount,
            });
          });

          it(`should make excess collateral available to withdraw one to one`, async () => {
            await payAndWithdraw({
              bond,
              paymentToken,
              paymentTokenAmount: utils.parseUnits("1000", decimals),
              collateralToReceive: utils
                .parseUnits("1000", 18)
                .mul(await bond.collateralRatio())
                .div(ONE),
            });
          });

          it(`should make excess collateral available to withdraw collateral in scaled magnitude`, async () => {
            await payAndWithdraw({
              bond,
              paymentToken,
              paymentTokenAmount: utils.parseUnits("1000", decimals).add(1),
              collateralToReceive: utils
                .parseUnits("1000", 18)
                .add(utils.parseUnits("1", 18 - decimals))
                .mul(await bond.collateralRatio())
                .div(ONE),
            });
          });

          it(`should make excess collateral available to withdraw collateral in scaled magnitude`, async () => {
            await payAndWithdraw({
              bond,
              paymentToken,
              paymentTokenAmount: utils.parseUnits("1000", decimals).sub(1),
              collateralToReceive: utils
                .parseUnits("1000", 18)
                .sub(utils.parseUnits("1", 18 - decimals))
                .mul(await bond.collateralRatio())
                .div(ONE),
            });
          });

          it("should make excess collateral available to withdraw when payment token is fully paid", async () => {
            await payAndWithdraw({
              bond,
              paymentToken,
              paymentTokenAmount: getTargetPayment(config, decimals),
              collateralToReceive: config.collateralTokenAmount,
            });
          });

          it("should make excess collateral available to withdraw when payment token is fully paid", async () => {
            await (await bond.burn(utils.parseUnits("1000", 18))).wait();
            await payAndWithdraw({
              bond,
              paymentToken,
              paymentTokenAmount: getTargetPayment(config, decimals),
              collateralToReceive: config.collateralTokenAmount,
            });
          });

          it("should make excess collateral available to withdraw when maturity is reached", async () => {
            await payAndWithdrawAtMaturity({
              bond,
              paymentToken,
              paymentTokenAmount: getTargetPayment(config, decimals),
              collateralToReceive: config.collateralTokenAmount,
              maturityDate: config.maturityDate,
            });
          });

          it("should make excess collateral available to withdraw when maturity is reached", async () => {
            await payAndWithdrawAtMaturity({
              bond,
              paymentToken,
              paymentTokenAmount: getTargetPayment(config, decimals),
              collateralToReceive: config.collateralTokenAmount,
              maturityDate: config.maturityDate,
            });
          });

          it("should allow all collateral to be withdrawn when all bonds are burned", async () => {
            await bond.burn(config.maxSupply);
            expect(await bond.totalSupply()).to.equal(0);
            await expectTokenDelta(
              bond.withdrawCollateral,
              collateralToken,
              owner,
              owner.address,
              config.collateralTokenAmount
            );
            expect(await collateralToken.balanceOf(bond.address)).to.equal(0);
          });

          it("should allow all collateral to be withdrawn when fully paid", async () => {
            const targetPayment = getTargetPayment(config, decimals);
            await paymentToken.approve(bond.address, targetPayment);
            await expectTokenDelta(
              bond.pay.bind(this, targetPayment),
              paymentToken,
              owner,
              bond.address,
              targetPayment
            );
            expect(await bond.totalSupply()).to.not.equal(0);
            await expectTokenDelta(
              bond.withdrawCollateral,
              collateralToken,
              owner,
              bond.address,
              config.collateralTokenAmount
            );
          });

          it("should not change amount owed", async () => {
            const targetPayment = getTargetPayment(config, decimals).div(2);
            await (
              await paymentToken.approve(bond.address, targetPayment)
            ).wait();
            await (await bond.pay(targetPayment)).wait();
            const amountOwed = await bond.amountOwed();
            await (await bond.withdrawCollateral()).wait();
            expect(await bond.amountOwed()).to.be.equal(amountOwed);
          });

          it("should revert when called by non-withdrawer", async () => {
            await expect(
              bond.connect(attacker).withdrawCollateral()
            ).to.be.revertedWith(
              `AccessControl: account ${attacker.address.toLowerCase()} is missing role ${withdrawRole}`
            );
          });

          it("should grant and revoke withdraw role", async () => {
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
        describe(`convertible`, async () => {
          beforeEach(async () => {
            bond = bondWithTokens.convertible.bond;
            config = bondWithTokens.convertible.config;
            await collateralToken.approve(
              bond.address,
              config.collateralTokenAmount
            );
          });

          it("should make zero collateral available to withdraw when zero bonds are burned", async () => {
            await burnAndWithdraw({
              bond,
              sharesToBurn: ZERO,
              collateralToReceive: ZERO,
            });
          });

          it("should make collateral available to withdraw when bonds are burned", async () => {
            await burnAndWithdraw({
              bond,
              sharesToBurn: utils.parseUnits("1000", 18),
              collateralToReceive: utils
                .parseUnits("1000", 18)
                .mul(await bond.collateralRatio())
                .div(ONE),
            });
          });

          it("should make excess collateral available to withdraw when payment token is partially paid", async () => {
            await payAndWithdraw({
              bond,
              paymentToken,
              paymentTokenAmount: utils.parseUnits("1000", decimals),
              collateralToReceive: utils
                .parseUnits("1000", 18)
                .mul(await bond.collateralRatio())
                .div(ONE),
            });
          });

          it("should make excess collateral available to withdraw when payment token is partially paid", async () => {
            await (await bond.burn(utils.parseUnits("1000", 18))).wait();
            await payAndWithdraw({
              bond,
              paymentToken,
              paymentTokenAmount: utils.parseUnits("1000", decimals),
              collateralToReceive: utils
                .parseUnits("2000", 18)
                .mul(await bond.collateralRatio())
                .div(ONE),
            });
          });

          it("should make excess collateral available to withdraw when payment token is fully paid", async () => {
            await payAndWithdraw({
              bond,
              paymentToken,
              paymentTokenAmount: getTargetPayment(config, decimals),
              collateralToReceive: config.collateralTokenAmount.sub(
                config.convertibleTokenAmount
              ),
            });
          });

          it("should make excess collateral available to withdraw when payment token is fully paid", async () => {
            const totalCollateralAvailable = config.collateralTokenAmount;
            const totalWithdrawableCollateral = totalCollateralAvailable.sub(
              config.convertibleTokenAmount
            );
            await (await bond.burn(utils.parseUnits("1000", 18))).wait();
            // since we've burnt 1000 bonds, the collateral has been unlocked
            const unlockedCollateral = utils
              .parseUnits("1000", 18)
              .mul(await bond.convertibleRatio())
              .div(ONE);
            const collateralToReceive =
              totalWithdrawableCollateral.add(unlockedCollateral);
            await payAndWithdraw({
              bond,
              paymentToken,
              paymentTokenAmount: getTargetPayment(config, decimals),
              collateralToReceive,
            });
          });

          it("should make excess collateral available to withdraw when maturity is reached", async () => {
            await payAndWithdrawAtMaturity({
              bond,
              paymentToken,
              paymentTokenAmount: config.maxSupply
                .div(4)
                .mul(utils.parseUnits("1", decimals))
                .div(ONE),
              collateralToReceive: config.maxSupply
                .div(4)
                .mul(await bond.collateralRatio())
                .div(ONE),
              maturityDate: config.maturityDate,
            });
          });

          it("should make excess collateral available to withdraw when maturity is reached", async () => {
            await payAndWithdrawAtMaturity({
              bond,
              paymentToken,
              paymentTokenAmount: getTargetPayment(config, decimals),
              collateralToReceive: config.collateralTokenAmount,
              maturityDate: config.maturityDate,
            });
          });

          it("should not change amount owed", async () => {
            const targetPayment = getTargetPayment(config, decimals).div(2);
            await (
              await paymentToken.approve(bond.address, targetPayment)
            ).wait();
            await (await bond.pay(targetPayment)).wait();
            const amountOwed = await bond.amountOwed();
            await (await bond.withdrawCollateral()).wait();
            expect(await bond.amountOwed()).to.be.equal(amountOwed);
          });

          it("should revert when called by non-withdrawer", async () => {
            await expect(
              bond.connect(attacker).withdrawCollateral()
            ).to.be.revertedWith(
              `AccessControl: account ${attacker.address.toLowerCase()} is missing role ${withdrawRole}`
            );
          });

          it("should grant and revoke withdraw role", async () => {
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
        describe(`uncollateralized`, async () => {
          beforeEach(async () => {
            bond = bondWithTokens.uncollateralized.bond;
            config = bondWithTokens.uncollateralized.config;
            await collateralToken.approve(
              bond.address,
              config.collateralTokenAmount
            );
          });
          it(`should have zero collateral available to withdraw when they are burned`, async () => {
            await burnAndWithdraw({
              bond,
              sharesToBurn: ZERO,
              collateralToReceive: ZERO,
            });
          });

          it(`should have zero collateral available to withdraw when they are burned`, async () => {
            await burnAndWithdraw({
              bond,
              sharesToBurn: BigNumber.from(1),
              collateralToReceive: ZERO,
            });
          });

          it(`should have zero collateral available to withdraw when they are burned`, async () => {
            await burnAndWithdraw({
              bond,
              sharesToBurn: config.maxSupply,
              collateralToReceive: config.collateralTokenAmount,
            });
          });

          it("should make excess collateral available to withdraw", async () => {
            await collateralToken.approve(bond.address, utils.parseEther("1"));
            await collateralToken.transfer(bond.address, utils.parseEther("1"));
            expect(await bond.previewWithdraw()).to.equal(
              utils.parseEther("1")
            );
          });

          it("should not change amount owed", async () => {
            const targetPayment = getTargetPayment(config, decimals).div(2);
            await (
              await paymentToken.approve(bond.address, targetPayment)
            ).wait();
            await (await bond.pay(targetPayment)).wait();
            const amountOwed = await bond.amountOwed();
            await (await bond.withdrawCollateral()).wait();
            expect(await bond.amountOwed()).to.be.equal(amountOwed);
          });

          it("should revert when called by non-withdrawer", async () => {
            await expect(
              bond.connect(attacker).withdrawCollateral()
            ).to.be.revertedWith(
              `AccessControl: account ${attacker.address.toLowerCase()} is missing role ${withdrawRole}`
            );
          });

          it("should grant and revoke withdraw role", async () => {
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
      describe("redeem", async () => {
        describe("non-convertible", async () => {
          beforeEach(async () => {
            bond = bondWithTokens.nonConvertible.bond;
            config = bondWithTokens.nonConvertible.config;
            await collateralToken.approve(
              bond.address,
              config.collateralTokenAmount
            );
            await bond.transfer(
              bondHolder.address,
              utils.parseUnits("4000", 18)
            );
            await paymentToken.approve(bond.address, config.maxSupply);
          });

          it("should redeem for payment token when bond is fully paid & not past maturity", async () => {
            await bond.pay(getTargetPayment(config, decimals));
            await previewRedeem({
              bond,
              sharesToRedeem: utils.parseUnits("1000", 18),
              paymentTokenToSend: utils.parseUnits("1000", decimals),
              collateralTokenToSend: ZERO,
            });
            await redeemAndCheckTokens({
              bond,
              bondHolder,
              paymentToken,
              collateralToken,
              sharesToRedeem: utils.parseUnits("1000", 18),
              paymentTokenToSend: utils.parseUnits("1000", decimals),
              collateralTokenToSend: ZERO,
            });
          });

          it("should redeem zero bonds for zero tokens when bond is fully paid & not past maturity", async () => {
            await (await bond.pay(getTargetPayment(config, decimals))).wait();
            await previewRedeem({
              bond,
              sharesToRedeem: ZERO,
              paymentTokenToSend: ZERO,
              collateralTokenToSend: ZERO,
            });

            await expect(bond.redeem(ZERO)).to.be.revertedWith("ZeroAmount");
          });

          it("should redeem for zero tokens when bond is not fully paid & not past maturity", async () => {
            await (
              await bond.pay(getTargetPayment(config, decimals).sub(1))
            ).wait();
            await previewRedeem({
              bond,
              sharesToRedeem: ZERO,
              paymentTokenToSend: ZERO,
              collateralTokenToSend: ZERO,
            });

            await expect(bond.redeem(ZERO)).to.be.revertedWith(
              "BondNotYetMaturedOrPaid"
            );
          });

          it("should redeem for payment token when bond is fully paid & past maturity", async () => {
            await (await bond.pay(getTargetPayment(config, decimals))).wait();
            await ethers.provider.send("evm_mine", [config.maturityDate]);
            await previewRedeem({
              bond,
              sharesToRedeem: utils.parseUnits("333", 18),
              paymentTokenToSend: utils.parseUnits("333", decimals),
              collateralTokenToSend: ZERO,
            });

            await redeemAndCheckTokens({
              bond,
              bondHolder,
              paymentToken,
              collateralToken,
              sharesToRedeem: utils.parseUnits("333", 18),
              paymentTokenToSend: utils.parseUnits("333", decimals),
              collateralTokenToSend: ZERO,
            });
          });

          it("should withdraw of collateral when bond is not paid & past maturity ", async () => {
            await ethers.provider.send("evm_mine", [config.maturityDate]);
            await previewRedeem({
              bond,
              sharesToRedeem: utils.parseUnits("1000", 18),
              paymentTokenToSend: ZERO,
              collateralTokenToSend: utils
                .parseUnits("1000", 18)
                .mul(await bond.collateralRatio())
                .div(ONE),
            });

            await redeemAndCheckTokens({
              bond,
              bondHolder,
              paymentToken,
              collateralToken,
              sharesToRedeem: utils.parseUnits("1000", 18),
              paymentTokenToSend: ZERO,
              collateralTokenToSend: utils
                .parseUnits("1000", 18)
                .mul(await bond.collateralRatio())
                .div(ONE),
            });
          });

          it("should redeem zero bonds for zero collateral when bond is not paid & past maturity", async () => {
            await ethers.provider.send("evm_mine", [config.maturityDate]);
            await previewRedeem({
              bond,
              sharesToRedeem: ZERO,
              paymentTokenToSend: ZERO,
              collateralTokenToSend: ZERO,
            });
            await expect(bond.redeem(ZERO)).to.be.revertedWith("ZeroAmount");
          });

          it("should allow withdraw of collateral & payment token when bond is partially paid & past maturity", async () => {
            // issuer partially pays
            const paymentAmount = utils.parseUnits("4000", decimals);
            await bond.pay(paymentAmount);
            await ethers.provider.send("evm_mine", [config.maturityDate]);

            const portionOfTotalBonds = utils
              .parseUnits("4000", 18)
              .mul(ONE)
              .div(config.maxSupply);
            const portionOfPaymentAmount = portionOfTotalBonds
              .mul(paymentAmount)
              .div(ONE);

            // the amount of bonds not covered by the payment amount
            const totalUncoveredSupply = config.maxSupply.sub(
              utils.parseUnits("4000", 18)
            );
            const totalCollateralTokens = totalUncoveredSupply
              .mul(await bond.collateralRatio())
              .div(ONE);
            const portionOfCollateralAmount = totalCollateralTokens
              .mul(utils.parseUnits("4000", 18))
              .div(config.maxSupply);
            await redeemAndCheckTokens({
              bond,
              bondHolder,
              paymentToken,
              collateralToken,
              sharesToRedeem: utils.parseUnits("4000", 18),
              paymentTokenToSend: portionOfPaymentAmount,
              collateralTokenToSend: portionOfCollateralAmount,
            });
          });

          it("should redeem bond at maturity for payment token", async () => {
            await bond.pay(
              config.maxSupply.mul(utils.parseUnits("1", decimals)).div(ONE)
            );
            // Fast forward to expire
            await ethers.provider.send("evm_mine", [config.maturityDate]);

            expect(await bond.balanceOf(bondHolder.address)).to.be.equal(
              utils.parseUnits("4000", 18)
            );
            await bond.connect(bondHolder).redeem(utils.parseUnits("4000", 18));
            expect(await bond.balanceOf(bondHolder.address)).to.be.equal(0);
            expect(
              await paymentToken.balanceOf(bondHolder.address)
            ).to.be.equal(utils.parseUnits("4000", decimals));
          });

          it("should redeem unpaid bond at maturity for collateral token", async () => {
            const expectedCollateralToReceive = utils
              .parseUnits("4000", 18)
              .mul(await bond.collateralBalance())
              .div(await bond.totalSupply());
            await ethers.provider.send("evm_mine", [config.maturityDate]);
            const {
              from,
              paymentToken: paymentTokenAddress,
              collateralToken: convertedCollateralToken,
              amountOfBondsRedeemed,
              amountOfPaymentTokensReceived,
              amountOfCollateralTokens,
            } = await getEventArgumentsFromTransaction(
              await bond
                .connect(bondHolder)
                .redeem(utils.parseUnits("4000", 18)),
              "Redeem"
            );
            expect(from).to.equal(bondHolder.address);
            expect(convertedCollateralToken).to.equal(collateralToken.address);
            expect(amountOfBondsRedeemed).to.equal(
              utils.parseUnits("4000", 18)
            );
            expect(amountOfPaymentTokensReceived).to.equal(0);
            expect(amountOfCollateralTokens).to.equal(
              expectedCollateralToReceive
            );

            expect(await bond.balanceOf(bondHolder.address)).to.be.equal(0);
            expect(
              await paymentToken
                .attach(paymentTokenAddress)
                .balanceOf(bondHolder.address)
            ).to.be.equal(0);
            expect(
              await collateralToken.balanceOf(bondHolder.address)
            ).to.be.equal(
              (await bond.collateralRatio())
                .mul(utils.parseUnits("4000", 18))
                .div(ONE)
            );
          });
        });
        describe("uncollateralized", async () => {
          beforeEach(async () => {
            bond = bondWithTokens.uncollateralized.bond;
            config = bondWithTokens.uncollateralized.config;
            await collateralToken.approve(
              bond.address,
              config.collateralTokenAmount
            );
            await bond.transfer(
              bondHolder.address,
              utils.parseUnits("4000", 18)
            );
            await paymentToken.approve(bond.address, config.maxSupply);
          });

          it("should redeem for payment token when bond is fully paid & not past maturity", async () => {
            await bond.pay(getTargetPayment(config, decimals));
            await previewRedeem({
              bond,
              sharesToRedeem: utils.parseUnits("1000", 18),
              paymentTokenToSend: utils.parseUnits("1000", decimals),
              collateralTokenToSend: ZERO,
            });
            await redeemAndCheckTokens({
              bond,
              bondHolder,
              paymentToken,
              collateralToken,
              sharesToRedeem: utils.parseUnits("1000", 18),
              paymentTokenToSend: utils.parseUnits("1000", decimals),
              collateralTokenToSend: ZERO,
            });
          });

          it("should redeem zero bonds for zero tokens when bond is fully paid & not past maturity", async () => {
            await (await bond.pay(getTargetPayment(config, decimals))).wait();
            await previewRedeem({
              bond,
              sharesToRedeem: ZERO,
              paymentTokenToSend: ZERO,
              collateralTokenToSend: ZERO,
            });

            await expect(bond.redeem(ZERO)).to.be.revertedWith("ZeroAmount");
          });

          it("should redeem for zero tokens when bond is not fully paid & not past maturity", async () => {
            await (
              await bond.pay(getTargetPayment(config, decimals).sub(1))
            ).wait();
            await previewRedeem({
              bond,
              sharesToRedeem: ZERO,
              paymentTokenToSend: ZERO,
              collateralTokenToSend: ZERO,
            });

            await expect(bond.redeem(ZERO)).to.be.revertedWith(
              "BondNotYetMaturedOrPaid"
            );
          });

          it("should redeem for payment token when bond is fully paid & past maturity", async () => {
            await (await bond.pay(getTargetPayment(config, decimals))).wait();
            await ethers.provider.send("evm_mine", [config.maturityDate]);
            await previewRedeem({
              bond,
              sharesToRedeem: utils.parseUnits("333", 18),
              paymentTokenToSend: utils.parseUnits("333", decimals),
              collateralTokenToSend: ZERO,
            });

            await redeemAndCheckTokens({
              bond,
              bondHolder,
              paymentToken,
              collateralToken,
              sharesToRedeem: utils.parseUnits("333", 18),
              paymentTokenToSend: utils.parseUnits("333", decimals),
              collateralTokenToSend: ZERO,
            });
          });

          it("should withdraw zero collateral when bond is not paid & past maturity ", async () => {
            await ethers.provider.send("evm_mine", [config.maturityDate]);
            await previewRedeem({
              bond,
              sharesToRedeem: utils.parseUnits("1000", 18),
              paymentTokenToSend: ZERO,
              collateralTokenToSend: ZERO,
            });

            await expect(
              bond.redeem(utils.parseUnits("1000", 18))
            ).to.be.revertedWith("ZeroAmount");
          });

          it("should redeem zero bonds for zero collateral when bond is not paid & past maturity ", async () => {
            await ethers.provider.send("evm_mine", [config.maturityDate]);
            await previewRedeem({
              bond,
              sharesToRedeem: ZERO,
              paymentTokenToSend: ZERO,
              collateralTokenToSend: ZERO,
            });
            await expect(bond.redeem(ZERO)).to.be.revertedWith("ZeroAmount");
          });

          it("should allow withdraw of collateral & payment token when bond is partially paid & past maturity", async () => {
            // issuer partially pays
            const paymentAmount = utils.parseUnits("4000", decimals);
            await bond.pay(paymentAmount);
            await ethers.provider.send("evm_mine", [config.maturityDate]);

            const portionOfTotalBonds = utils
              .parseUnits("4000", 18)
              .mul(ONE)
              .div(config.maxSupply);
            const portionOfPaymentAmount = portionOfTotalBonds
              .mul(paymentAmount)
              .div(ONE);

            await redeemAndCheckTokens({
              bond,
              bondHolder,
              paymentToken,
              collateralToken,
              sharesToRedeem: utils.parseUnits("4000", 18),
              paymentTokenToSend: portionOfPaymentAmount,
              collateralTokenToSend: ZERO,
            });
          });

          it("should redeem bond at maturity for payment token", async () => {
            await bond.pay(
              config.maxSupply.mul(utils.parseUnits("1", decimals)).div(ONE)
            );
            // Fast forward to expire
            await ethers.provider.send("evm_mine", [config.maturityDate]);

            expect(await bond.balanceOf(bondHolder.address)).to.be.equal(
              utils.parseUnits("4000", 18)
            );
            await bond.connect(bondHolder).redeem(utils.parseUnits("4000", 18));
            expect(await bond.balanceOf(bondHolder.address)).to.be.equal(0);
            expect(
              await paymentToken.balanceOf(bondHolder.address)
            ).to.be.equal(utils.parseUnits("4000", decimals));
          });
        });
      });
      describe("convert", async () => {
        describe("convertible", async () => {
          beforeEach(async () => {
            bond = bondWithTokens.convertible.bond;
            config = bondWithTokens.convertible.config;
            await collateralToken.approve(
              bond.address,
              config.collateralTokenAmount
            );
            await bond.transfer(bondHolder.address, config.maxSupply);
          });

          it(`previews convert zero converted`, async () => {
            expect(await bond.previewConvertBeforeMaturity(ZERO)).to.equal(
              ZERO
            );
          });

          it(`previews convert target converted`, async () => {
            expect(
              await bond.previewConvertBeforeMaturity(config.maxSupply)
            ).to.equal(config.convertibleRatio);
          });

          it(`previews convert double target converted`, async () => {
            expect(
              await bond.previewConvertBeforeMaturity(config.maxSupply.div(2))
            ).to.equal(config.convertibleTokenAmount.div(2));
          });

          it("should convert bond amount into collateral at convertibleRatio", async () => {
            const expectedCollateralToWithdraw = config.convertibleRatio;

            const {
              from,
              collateralToken: convertedCollateralToken,
              amountOfBondsConverted,
              amountOfCollateralTokens,
            } = await getEventArgumentsFromTransaction(
              await bond.connect(bondHolder).convert(config.maxSupply),
              "Convert"
            );
            expect(from).to.equal(bondHolder.address);
            expect(convertedCollateralToken).to.equal(collateralToken.address);
            expect(amountOfBondsConverted).to.equal(config.maxSupply);
            expect(amountOfCollateralTokens).to.equal(
              expectedCollateralToWithdraw
            );
          });

          it("should lower amount owed when bonds are converted", async () => {
            const amountOwed = await bond.amountOwed();
            await bond.connect(bondHolder).convert(config.maxSupply.div(2));
            expect(await bond.amountOwed()).to.be.equal(amountOwed.div(2));
            expect(await bond.amountOwed()).to.be.equal(
              downscaleAmount(config.maxSupply.div(2), decimals)
            );
          });
        });
        describe("non-convertible", async () => {
          beforeEach(async () => {
            bond = bondWithTokens.nonConvertible.bond;
            config = bondWithTokens.nonConvertible.config;
          });

          it("should fail to convert if bond is not convertible", async () => {
            await expect(bond.convert(config.maxSupply)).to.be.revertedWith(
              "ZeroAmount"
            );
          });
        });
        describe("uncollateralized", async () => {
          beforeEach(async () => {
            bond = bondWithTokens.uncollateralized.bond;
            config = bondWithTokens.uncollateralized.config;
          });

          it("should fail to convert if bond is uncollateralized and therefore unconvertible", async () => {
            await expect(bond.convert(config.maxSupply)).to.be.revertedWith(
              "ZeroAmount"
            );
          });
        });
      });
      describe("sweep", async () => {
        describe("non convertible", async () => {
          beforeEach(async () => {
            bond = bondWithTokens.nonConvertible.bond;
            config = bondWithTokens.nonConvertible.config;
          });

          it("should remove a token from the contract", async () => {
            await attackingToken.connect(attacker).transfer(bond.address, 1000);
            await bond.sweep(attackingToken.address);
            expect(await attackingToken.balanceOf(owner.address)).to.be.equal(
              1000
            );
          });

          it("should disallow removal of tokens: collateral, payment, or itself", async () => {
            await expect(bond.sweep(paymentToken.address)).to.be.revertedWith(
              "SweepDisallowedForToken"
            );
            await expect(
              bond.sweep(collateralToken.address)
            ).to.be.revertedWith("SweepDisallowedForToken");
          });
        });
      });
    });
  });
});
