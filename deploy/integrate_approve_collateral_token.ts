import { HardhatRuntimeEnvironment } from "hardhat/types";
import { TestERC20 } from "../typechain";

module.exports = async function ({
  deployments,
  getNamedAccounts,
  ethers,
}: HardhatRuntimeEnvironment) {
  const { deployer } = await getNamedAccounts();
  const { address: bondFactoryAddress } = await deployments.get("BondFactory");
  const { address: collateralTokenAddress } = await deployments.get(
    "CollateralToken"
  );
  const collateralToken = (await ethers.getContractAt(
    "TestERC20",
    collateralTokenAddress,
    deployer
  )) as TestERC20;

  await (
    await collateralToken.approve(
      bondFactoryAddress,
      ethers.constants.MaxInt256
    )
  ).wait();

  console.log(
    `Approved collateral token for ${deployer} @ facotry (${bondFactoryAddress}) <-> token (${collateralTokenAddress}).`
  );
};

module.exports.tags = ["permissions"];
module.exports.dependencies = ["factory", "token"];
