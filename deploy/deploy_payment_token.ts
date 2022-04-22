import { HardhatRuntimeEnvironment } from "hardhat/types";

module.exports = async function ({
  deployments,
  getNamedAccounts,
  ethers,
}: HardhatRuntimeEnvironment) {
  const { deploy } = deployments;

  const { deployer } = await getNamedAccounts();
  await deploy("PaymentToken", {
    contract: "TestERC20",
    from: deployer,
    log: true,
    autoMine: true,
    args: ["USD Coin", "USDC", ethers.utils.parseUnits("50000000", 20), 6],
  });
};

module.exports.tags = ["test-deployment", "token"];
