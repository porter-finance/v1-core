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
import type { BondFactoryClone, Broker } from "../typechain";
import { TestERC20 } from "../typechain/TestERC20";
const { loadFixture } = waffle;

const EasyAuctionJSON = require("../contracts/external/EasyAuction.json");

const GNOSIS_AUCTION_ADDRESS = {
  mainnet: "0x0b7ffc1f4ad541a4ed16b40d8c37f0929158d101",
};
useCustomErrorMatcher();
describe("Broker", async () => {
  // default deployer address of contracts
  let brokerSigner: SignerWithAddress;
  // address of the example DAO which configures and runs the auction
  let issuerSigner: SignerWithAddress;
  let broker: Broker;
  let gnosisAuction: Contract;
  let collateralToken: TestERC20;
  let collateralData: CollateralData;
  const totalBondSupply = 12500;

  const name = "My Token";
  const symbol = "MTKN";
  let newBond: string;

  let factory: BondFactoryClone;
  // 3 years from now, in seconds
  const maturityDate = Math.round(
    new Date(new Date().setFullYear(new Date().getFullYear() + 3)).getTime() /
      1000
  );

  // TODO: allow reuse across test files by importing these fixtures from a fixture file.
  async function bondFactoryFixture() {
    const BondFactoryClone = await ethers.getContractFactory(
      "BondFactoryClone"
    );
    const factory = (await BondFactoryClone.deploy()) as BondFactoryClone;

    return { factory };
  }
  async function collateralTokenFixture() {
    collateralData = {
      collateralAddress: ethers.constants.AddressZero,
      collateralAmount: ethers.utils.parseEther("100"),
      bondAddress: ethers.constants.AddressZero,
    };
    [brokerSigner, issuerSigner] = await ethers.getSigners();

    // Mint 100 ether of tokens of collateral for issuerSigner
    const CollateralToken = await ethers.getContractFactory("TestERC20");
    collateralToken = (await CollateralToken.connect(issuerSigner).deploy(
      "Collateral Token",
      "CT",
      collateralData.collateralAmount
    )) as TestERC20;
    // set collateral address
    collateralData.collateralAddress = collateralToken.address;
    return { collateralData, collateralToken };
  }
  async function auctionFixture() {
    const gnosisAuction = await ethers.getContractAt(
      EasyAuctionJSON.abi,
      GNOSIS_AUCTION_ADDRESS.mainnet
    );
    return { gnosisAuction };
  }
  async function brokerFixture(
    gnosisAuction: Contract,
    factory: BondFactoryClone
  ) {
    const Broker = await ethers.getContractFactory("Broker");
    const broker = (await Broker.deploy(
      gnosisAuction.address,
      factory.address
    )) as Broker;
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
    return { broker, newBond };
  }
  beforeEach(async () => {
    ({ factory } = await loadFixture(bondFactoryFixture));
    ({ collateralData, collateralToken } = await loadFixture(
      collateralTokenFixture
    ));
    ({ gnosisAuction } = await loadFixture(auctionFixture));
    ({ broker, newBond } = await loadFixture(
      brokerFixture.bind(null, gnosisAuction, factory)
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
    const { auctionId } = await createAuction(broker, auctionData, newBond);
    expect(auctionId).to.be.equal(currentAuction + 1);
  });
  it("creates a bond through the deployed clone factory", async () => {
    expect(newBond).to.not.be.eq(null);
  });
});
