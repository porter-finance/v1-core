// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";
import { utils } from "ethers";
import { TestERC20 } from "../typechain";

const collateralRatio = [utils.parseUnits("0.5", 18)];
const convertibilityRatio = [utils.parseUnits("0.5", 18)];

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

  const BorrowingToken = await ethers.getContractFactory("TestERC20");
  const borrowingToken = (await BorrowingToken.deploy(
    "Borrowing Token",
    "BT",
    ethers.utils.parseEther("1000"),
    18
  )) as TestERC20;

  const NativeToken = await ethers.getContractFactory("TestERC20");
  const nativeToken = (await NativeToken.deploy(
    "Native Token",
    "NT",
    ethers.utils.parseEther("500"),
    18
  )) as TestERC20;

  await factory.grantRole(factory.ISSUER_ROLE(), owner.address);

  await factory.createBond(
    "SimpleBond",
    "LUG",
    owner.address,
    maturityDate,
    borrowingToken.address,
    [nativeToken.address],
    collateralRatio,
    convertibilityRatio
  );
  console.log({
    factory: factory.address,
    nativeToken: nativeToken.address,
    borrowingToken: borrowingToken.address,
  });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
