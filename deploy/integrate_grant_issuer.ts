import { HardhatRuntimeEnvironment } from "hardhat/types";
import { BondFactory } from "../typechain";

module.exports = async function ({
  deployments,
  getNamedAccounts,
  ethers,
}: HardhatRuntimeEnvironment) {
  const { deployer } = await getNamedAccounts();
  const { address } = await deployments.get("BondFactory");
  const factory = (await ethers.getContractAt(
    "BondFactory",
    address
  )) as BondFactory;
  const issuerRole = await factory.ISSUER_ROLE();
  await factory.grantRole(issuerRole, deployer);
  console.log(`Issuer Role (${issuerRole}) granted to ${deployer}.`);
};

module.exports.tags = ["permissions"];
module.exports.dependencies = ["factory"];
