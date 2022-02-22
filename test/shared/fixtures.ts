import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { BondFactoryClone, Broker, TestERC20 } from "../../typechain";
import { CollateralData } from "../utilities";

const EasyAuctionJSON = require("../../contracts/external/EasyAuction.json");
const GNOSIS_AUCTION_ADDRESS = {
  mainnet: "0x0b7ffc1f4ad541a4ed16b40d8c37f0929158d101",
};

export async function auctionFixture() {
  const gnosisAuction = await ethers.getContractAt(
    EasyAuctionJSON.abi,
    GNOSIS_AUCTION_ADDRESS.mainnet
  );
  return { gnosisAuction };
}
export async function brokerFixture() {
  const { factory } = await bondFactoryFixture();
  const { collateralData, collateralToken } = await collateralTokenFixture();
  const { gnosisAuction } = await auctionFixture();
  const Broker = await ethers.getContractFactory("Broker");
  const broker = (await Broker.deploy(
    gnosisAuction.address,
    factory.address
  )) as Broker;

  return { factory, broker, collateralData, collateralToken, gnosisAuction };
}

export async function bondFactoryFixture() {
  const BondFactoryClone = await ethers.getContractFactory("BondFactoryClone");
  const factory = (await BondFactoryClone.deploy()) as BondFactoryClone;
  return { factory };
}

export async function collateralTokenFixture() {
  const [, issuerSigner] = await ethers.getSigners();

  const collateralData: CollateralData = {
    collateralAddress: ethers.constants.AddressZero,
    collateralAmount: ethers.utils.parseEther("1"),
    bondAddress: ethers.constants.AddressZero,
  };

  const CollateralToken = await ethers.getContractFactory("TestERC20");
  const collateralToken = (await CollateralToken.connect(issuerSigner).deploy(
    "Collateral Token",
    "CT",
    collateralData.collateralAmount
  )) as TestERC20;

  collateralData.collateralAddress = collateralToken.address;

  return { collateralData, collateralToken };
}
