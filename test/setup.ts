import { ethers } from "hardhat";
import { TestERC20, BondFactoryClone } from "../typechain";
import { getBondContract } from "./utilities";

export const deployNATIVEandREPAY = async () => {
  const MockErc20Contract = await ethers.getContractFactory("TestERC20");
  const native = (await MockErc20Contract.deploy(
    "Native Token",
    "NATIVE",
    ethers.utils.parseUnits("500"),
    18
  )) as TestERC20;

  const repay = (await MockErc20Contract.deploy(
    "Repayment Token",
    "REPAY",
    ethers.utils.parseUnits("500"),
    18
  )) as TestERC20;

  return { native, repay };
};

export const createBond = async (
  factory: BondFactoryClone,
  nativeToken: TestERC20,
  repaymentToken: TestERC20
) => {
  // these could be converted to parameters
  const bondName = "Always be growing";
  const bondSymbol = "LUG";
  const collateralRatio = ethers.utils.parseUnits(".5", 18);
  const convertibilityRatio = ethers.utils.parseUnits(".5", 18);
  const maturityDate = Math.round(
    new Date(new Date().setFullYear(new Date().getFullYear() + 3)).getTime() /
      1000
  );
  const maxSupply = ethers.utils.parseUnits("50000000", 18);

  const [owner] = await ethers.getSigners();
  const issuerRole = await factory.ISSUER_ROLE();
  const grantRoleTx = await factory.grantRole(issuerRole, owner.address);
  await grantRoleTx.wait();

  const bond = await getBondContract(
    factory.createBond(
      bondName,
      bondSymbol,
      owner.address,
      maturityDate,
      nativeToken.address,
      repaymentToken.address,
      collateralRatio,
      convertibilityRatio,
      maxSupply
    )
  );
  return bond;
};
