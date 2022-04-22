import { HardhatRuntimeEnvironment } from "hardhat/types";
import { deploymentBonds } from "../test/constants";
import { Bond, TestERC20 } from "../typechain";
import { BondConfigType } from "../test/interfaces";
import { BigNumber, ContractTransaction } from "ethers";

module.exports = async function ({
  deployments,
  getNamedAccounts,
  ethers,
}: HardhatRuntimeEnvironment) {
  const { get } = deployments;
  const { deployer } = await getNamedAccounts();
  const { address: paymentTokenAddress } = await get("PaymentToken");
  const paymentToken = (await ethers.getContractAt(
    "TestERC20",
    paymentTokenAddress,
    deployer
  )) as TestERC20;
  const bondPromises = deploymentBonds.map(
    async ({
      bondName,
      config,
      options,
    }: {
      bondName: string;
      config: BondConfigType;
      options: object;
    }) => {
      const { address } = await deployments.get(bondName);
      const bond = (await ethers.getContractAt("Bond", address)) as Bond;

      await (
        await paymentToken.approve(bond.address, ethers.constants.MaxUint256)
      ).wait();
      const actions = [
        {
          actionName: "convert",
          action: bond.convert(1),
        },
        {
          actionName: "pay",
          action: bond.pay(2),
        },
        {
          actionName: "convert",
          action: bond.convert(1),
        },
        {
          actionName: "redeem",
          action: bond.redeem(1),
        },
        {
          actionName: "withdraw excess collateral",
          action: bond.withdrawExcessCollateral(BigNumber.from(0), deployer),
        },
        {
          actionName: "withdraw excess payment",
          action: bond.withdrawExcessPayment(deployer),
        },
      ];
      await Promise.all(
        actions.map(
          async ({
            actionName,
            action,
          }: {
            actionName: string;
            action: Promise<ContractTransaction>;
          }) => {
            try {
              await (await action).wait();
              console.log(`${actionName} success!`);
            } catch (error) {
              console.log(`${actionName} failure!`);
            }
          }
        )
      );
    }
  );

  await Promise.all(bondPromises);
};

module.exports.tags = ["test"];
module.exports.dependencies = ["bonds"];
