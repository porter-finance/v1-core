import { DeployFunction } from "hardhat-deploy/dist/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;

  // generate storage layout report
  await hre.storageLayout.export();

  const { deployer } = await getNamedAccounts();
  await deploy("BondFactory", {
    from: deployer,
    log: true,
    autoMine: true,
  });
};

export default func;
