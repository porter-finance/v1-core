import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
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
  owner: SignerWithAddress,
  nativeToken: TestERC20,
  repaymentToken: TestERC20,
  factoryAddress?: string
) => {
  // these could be converted to parameters
  const bondName = "Always be growing";
  const bondSymbol = "LEARN";
  const collateralRatio = ethers.utils.parseUnits(".5", 18);
  const convertibilityRatio = ethers.utils.parseUnits(".5", 18);
  const repaymentRatio = ethers.utils.parseUnits("1", 18);
  const maturityDate = Math.round(
    new Date(new Date().setFullYear(new Date().getFullYear() + 3)).getTime() /
      1000
  );
  const maxSupply = ethers.utils.parseUnits("50000000", 18);

  let factory;
  if (factoryAddress) {
    factory = (await ethers.getContractAt(
      "BondFactoryClone",
      factoryAddress
    )) as BondFactoryClone;
  } else {
    const BondFactoryClone = await ethers.getContractFactory(
      "BondFactoryClone"
    );
    factory = await BondFactoryClone.connect(owner).deploy();
  }
  const issuerRole = await factory.ISSUER_ROLE();
  const grantRoleTx = await factory
    .connect(owner)
    .grantRole(issuerRole, owner.address);
  await grantRoleTx.wait();

  const bond = await getBondContract(
    factory
      .connect(owner)
      .createBond(
        bondName,
        bondSymbol,
        owner.address,
        maturityDate,
        nativeToken.address,
        repaymentToken.address,
        collateralRatio,
        convertibilityRatio,
        repaymentRatio,
        maxSupply
      )
  );
  return bond;
};
