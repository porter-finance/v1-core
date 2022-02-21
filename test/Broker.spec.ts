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
import type { Broker } from "../typechain";
import { brokerFixture } from "./shared/fixtures";
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
    const { broker, collateralData, gnosisAuction } = await brokerFixture();
    const { newBond }: { newBond: string } =
      await getEventArgumentsFromTransaction(
        await broker.createBond(
          name,
          symbol,
          totalBondSupply,
          maturityDate,
          issuerSigner.address,
          collateralData.collateralAddress,
          BigNumber.from(150),
          false,
          collateralData.collateralAddress, // TODO: make borrowing token
          collateralData.collateralAmount // TODO: make borrowing amount
        ),
        "BondCreated"
      );
    return { newBond, broker, collateralData, gnosisAuction };
  }
  beforeEach(async () => {
    [brokerSigner, issuerSigner, eveSigner] = await ethers.getSigners();
    ({ newBond, broker, collateralData, gnosisAuction } = await loadFixture(
      fixture
    ));
    collateralData.bondAddress = newBond;
  });
  it("starts an auction", async () => {
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

    const currentAuction = parseInt(await gnosisAuction.auctionCounter());
    const { auctionId } = await createAuction(
      broker,
      issuerSigner,
      auctionData,
      newBond
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
