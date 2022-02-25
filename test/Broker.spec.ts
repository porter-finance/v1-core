import { type Contract, BigNumber } from "ethers";
import { ethers, waffle } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import {
  addDaysToNow,
  AuctionData,
  CollateralData,
  createAuction,
  getEventArgumentsFromTransaction,
  useCustomErrorMatcher,
} from "./utilities";
import type { Broker, SimpleBond } from "../typechain";
import { borrowingTokenFixture, brokerFixture } from "./shared/fixtures";
import { CollateralToken } from "../typechain/CollateralToken";
const { loadFixture } = waffle;

useCustomErrorMatcher();
describe("Broker", async () => {
  // default deployer address of contracts
  let brokerSigner: SignerWithAddress;
  // address of the example DAO which configures and runs the auction
  let issuerSigner: SignerWithAddress;
  let eveSigner: SignerWithAddress;
  let broker: Broker;
  let gnosisAuction: Contract;
  let collateralData: CollateralData;
  let collateralToken: CollateralToken;
  let bond: SimpleBond;

  const totalBondSupply = 12500;

  const name = "My Token";
  const symbol = "MTKN";
  let newBond: string;
  // 3 years from now, in seconds
  const maturityDate = Math.round(
    new Date(new Date().setFullYear(new Date().getFullYear() + 3)).getTime() /
      1000
  );

  async function fixture() {
    const { broker, collateralData, gnosisAuction, collateralToken } =
      await brokerFixture();
    const { borrowingToken } = await borrowingTokenFixture();
    const { newBond }: { newBond: string } =
      await getEventArgumentsFromTransaction(
        await broker.createBond(
          totalBondSupply,
          maturityDate,
          issuerSigner.address,
          collateralData.collateralAddress,
          BigNumber.from(150),
          false,
          BigNumber.from(50),
          borrowingToken.address
        ),
        "BondCreated"
      );

    collateralData.bondAddress = newBond;
    bond = await ethers.getContractAt("SimpleBond", newBond, brokerSigner);
    // todo: this flow is weird
    // first we approve the bond to transfer collateral from the issuer
    await collateralToken
      .connect(issuerSigner)
      .approve(bond.address, collateralData.collateralAmount);
    // then we transfer the collateral into the bond
    await bond
      .connect(issuerSigner)
      .collateralize(collateralData.collateralAmount);
    // after the collateral is in the bond, we can mint tokens to the issuer
    await bond.connect(issuerSigner).mint(totalBondSupply);
    // then we approve the broker to transfer tokens to the auction...
    await bond.connect(issuerSigner).transfer(broker.address, totalBondSupply);

    return { newBond, broker, collateralData, collateralToken, gnosisAuction };
  }
  beforeEach(async () => {
    [brokerSigner, issuerSigner, eveSigner] = await ethers.getSigners();
    ({ newBond, broker, collateralData, collateralToken, gnosisAuction } =
      await loadFixture(fixture));
  });
  it("starts an auction", async () => {
    const auctionData: AuctionData = {
      _biddingToken: bond.address,
      orderCancellationEndDate: addDaysToNow(1),
      auctionEndDate: addDaysToNow(2),
      _auctionedSellAmount: BigNumber.from(totalBondSupply),
      _minBuyAmount: ethers.utils.parseEther("1"),
      minimumBiddingAmountPerOrder: ethers.utils.parseEther(".01"),
      minFundingThreshold: ethers.utils.parseEther("30"),
      isAtomicClosureAllowed: false,
      accessManagerContract: ethers.constants.AddressZero,
      accessManagerContractData: ethers.utils.arrayify("0x00"),
    };

    const currentAuction = parseInt(await gnosisAuction.auctionCounter());
    const { auctionId } = await createAuction(
      broker,
      issuerSigner,
      auctionData,
      bond.address
    );
    expect(auctionId).to.be.equal(currentAuction + 1);
  });
  it("bars unauthorized auctioneer", async () => {
    const auctionData: AuctionData = {
      _biddingToken: newBond,
      orderCancellationEndDate: addDaysToNow(1),
      auctionEndDate: addDaysToNow(2),
      _auctionedSellAmount: BigNumber.from(totalBondSupply),
      _minBuyAmount: ethers.utils.parseEther("1"),
      minimumBiddingAmountPerOrder: ethers.utils.parseEther(".01"),
      minFundingThreshold: ethers.utils.parseEther("30"),
      isAtomicClosureAllowed: false,
      accessManagerContract: ethers.constants.AddressZero,
      accessManagerContractData: ethers.utils.arrayify("0x00"),
    };

    await expect(
      createAuction(broker, eveSigner, auctionData, newBond)
    ).to.be.revertedWith("UnauthorizedInteractionWithBond");
  });
  it("creates a bond through the deployed clone factory", async () => {
    expect(newBond).to.not.be.eq(null);
  });
});
