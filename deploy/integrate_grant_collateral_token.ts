import { HardhatRuntimeEnvironment } from "hardhat/types";
import { BondFactory, TestERC20 } from "../typechain";

module.exports = async function ({
  deployments,
  getNamedAccounts,
  ethers,
}: HardhatRuntimeEnvironment) {
  const { address: bondFactoryAddress } = await deployments.get("BondFactory");
  const { address: collateralTokenAddress } = await deployments.get(
    "CollateralToken"
  );
  const factory = (await ethers.getContractAt(
    "BondFactory",
    bondFactoryAddress
  )) as BondFactory;
  (await ethers.getContractAt(
    "TestERC20",
    collateralTokenAddress
  )) as TestERC20;
  const tokenRole = await factory.ALLOWED_TOKEN();
  await factory.grantRole(tokenRole, collateralTokenAddress);
  console.log(
    `Token Role (${tokenRole}) granted to ${collateralTokenAddress}.`
  );
};

module.exports.tags = ["permissions"];
module.exports.dependencies = ["factory", "token"];
