import { ethers } from "hardhat";
import { BondFactoryClone, ERC20, TestERC20 } from "../../typechain";

const EasyAuctionJSON = require("../../contracts/external/EasyAuction.json");
const GNOSIS_AUCTION_ADDRESS = {
  mainnet: "0x0b7ffc1f4ad541a4ed16b40d8c37f0929158d101",
  rinkeby: "0xc5992c0e0a3267c7f75493d0f717201e26be35f7",
};

export async function auctionFixture() {
  const gnosisAuction = await ethers.getContractAt(
    EasyAuctionJSON.abi,
    GNOSIS_AUCTION_ADDRESS.mainnet
  );
  return { gnosisAuction };
}

export async function bondFactoryFixture() {
  const BondFactoryClone = await ethers.getContractFactory("BondFactoryClone");
  const factory = (await BondFactoryClone.deploy()) as BondFactoryClone;
  return { factory };
}

export async function tokenFixture() {
  const [, issuer] = await ethers.getSigners();

  const BorrowingToken = await ethers.getContractFactory("TestERC20");
  const borrowingToken = (await BorrowingToken.connect(issuer).deploy(
    "Borrowing Token",
    "BT",
    ethers.utils.parseEther("2"),
    18
  )) as TestERC20;

  const [, , , attacker] = await ethers.getSigners();

  const AttackingToken = await ethers.getContractFactory("TestERC20");
  const attackingToken = (await AttackingToken.connect(attacker).deploy(
    "Attack Token",
    "AT",
    ethers.utils.parseEther("2"),
    20
  )) as TestERC20;

  const NativeToken = await ethers.getContractFactory("TestERC20");
  const nativeToken = (await NativeToken.connect(issuer).deploy(
    "Native Token",
    "NT",
    ethers.utils.parseEther("2"),
    18
  )) as TestERC20;

  const MockUSDCToken = await ethers.getContractFactory("TestERC20");
  const mockUSDCToken = (await MockUSDCToken.connect(issuer).deploy(
    "USDC",
    "USDC",
    ethers.utils.parseEther("2"),
    6
  )) as TestERC20;

  return { borrowingToken, attackingToken, nativeToken, mockUSDCToken };
}

export async function convertToCurrencyDecimals(token: ERC20, amount: string) {
  const decimals = await token.decimals();
  return ethers.utils.parseUnits(amount, decimals);
}
