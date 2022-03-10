// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";
import { utils } from "ethers";
import { TestERC20 } from "../typechain";

const collateralRatio = utils.parseUnits(".5", 18);
const convertibilityRatio = utils.parseUnits(".5", 18);

const maturityDate = Math.round(
  new Date(new Date().setFullYear(new Date().getFullYear() + 3)).getTime() /
  1000
);

async function main() {
  const [owner] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", owner.address);

  const weiAmount = (await owner.getBalance()).toString();

  console.log("Account balance:", await ethers.utils.formatEther(weiAmount));

  const BondFactoryClone = await ethers.getContractFactory("BondFactoryClone");
  const factory = await BondFactoryClone.deploy();

  const BorrowingToken1 = await ethers.getContractFactory("TestERC20");
  const borrowingToken1 = (await BorrowingToken1.deploy(
    "Borrowing Token 1",
    "BT1",
    utils.parseUnits("1000"),
    18
  )) as TestERC20;

  const BorrowingToken2 = await ethers.getContractFactory("TestERC20");
  const borrowingToken2 = (await BorrowingToken2.deploy(
    "Borrowing Token 1",
    "BT1",
    utils.parseUnits("2000"),
    18
  )) as TestERC20;

  const NativeToken1 = await ethers.getContractFactory("TestERC20");
  const nativeToken1 = (await NativeToken1.deploy(
    "Native Token 1",
    "NT1",
    utils.parseUnits("500"),
    18
  )) as TestERC20;

  const NativeToken2 = await ethers.getContractFactory("TestERC20");
  const nativeToken2 = (await NativeToken2.deploy(
    "Native Token 2",
    "NT2",
    utils.parseUnits("5000"),
    18
  )) as TestERC20;

  await factory.grantRole(factory.ISSUER_ROLE(), owner.address);

  const bond1 = await factory.createBond(
    "Bond1",
    "LUG1",
    owner.address,
    maturityDate,
    borrowingToken1.address,
    nativeToken1.address,
    collateralRatio,
    convertibilityRatio
  );
  const bond2 = await factory.createBond(
    "Bond2",
    "LUG2",
    owner.address,
    maturityDate,
    borrowingToken2.address,
    nativeToken2.address,
    collateralRatio,
    convertibilityRatio
  );

  console.log({
    factory: factory.address,
    nativeToken1: nativeToken1.address,
    borrowingToken1: borrowingToken1.address,
    nativeToken2: nativeToken2.address,
    borrowingToken2: borrowingToken2.address
  });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
