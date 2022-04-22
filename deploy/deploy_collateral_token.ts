import { HardhatRuntimeEnvironment } from "hardhat/types";

module.exports = async function ({
  deployments,
  getNamedAccounts,
  ethers,
}: HardhatRuntimeEnvironment) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  await deploy("CollateralToken", {
    contract: "TestERC20",
    from: deployer,
    log: true,
    autoMine: true,
    args: ["Uniswap", "UNI", ethers.utils.parseUnits("50000000", 20), 18],
  });
};

module.exports.tags = ["test-deployment", "token"];
