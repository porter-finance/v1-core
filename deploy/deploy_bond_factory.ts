import { HardhatRuntimeEnvironment } from "hardhat/types";
import { THREE_YEARS_FROM_NOW_IN_SECONDS } from "../test/constants";
import { Bond, BondFactory } from "../typechain";

module.exports = async function ({
  deployments,
  getNamedAccounts,
  ethers,
}: HardhatRuntimeEnvironment) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  const { address } = await deploy("BondFactory", {
    from: deployer,
    log: true,
    autoMine: true,
  });
  const factory = (await ethers.getContractAt(
    "BondFactory",
    address,
    deployer
  )) as BondFactory;

  const implementationContract = (await ethers.getContractAt(
    "Bond",
    await factory.tokenImplementation(),
    deployer
  )) as Bond;
  try {
    await (
      await implementationContract.initialize(
        "Placeholder Bond",
        "BOND",
        deployer,
        THREE_YEARS_FROM_NOW_IN_SECONDS,
        "0x0000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000001",
        ethers.BigNumber.from(0),
        ethers.BigNumber.from(0),
        0
      )
    ).wait();
  } catch (e) {
    console.log("Is the contract already initialized?");
    console.log(e);
  }
};

module.exports.tags = ["main-deployment", "factory", "test-deployment"];
