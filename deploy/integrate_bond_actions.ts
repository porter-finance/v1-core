import { HardhatRuntimeEnvironment } from "hardhat/types";
import { deploymentBonds } from "../test/constants";
import { Bond, TestERC20 } from "../typechain";
import { BondConfigType } from "../test/interfaces";
import { BigNumber, ContractTransaction } from "ethers";
import { getBondInfo } from "../test/utilities";

module.exports = async function ({
  deployments,
  getNamedAccounts,
  ethers,
}: HardhatRuntimeEnvironment) {
  const { get } = deployments;
  const { deployer } = await getNamedAccounts();
  const { address: paymentTokenAddress } = await get("PaymentToken");
  const { address: collateralTokenAddress } = await get("CollateralToken");
  const paymentToken = (await ethers.getContractAt(
    "TestERC20",
    paymentTokenAddress,
    deployer
  )) as TestERC20;
  const collateralToken = (await ethers.getContractAt(
    "TestERC20",
    collateralTokenAddress,
    deployer
  )) as TestERC20;

  const signer = await ethers.getSigner(deployer);
  const currentNonce = await signer.getTransactionCount();
  console.log(currentNonce);
  for (let i = 0; i < deploymentBonds.length; i++) {
    const {
      config,
    }: {
      config: BondConfigType;
      bondOptions: object;
    } = deploymentBonds[i];
    const { bondSymbol } = await getBondInfo(
      paymentToken,
      collateralToken,
      config
    );
    const { address } = await deployments.get(bondSymbol);
    const bond = (await ethers.getContractAt("Bond", address)) as Bond;
    if ((await paymentToken.allowance(deployer, bond.address)).gt(0)) {
      console.log(
        `Payment token already approved for bond (${bond.address}). Skipping.`
      );
    } else {
      await (
        await paymentToken.approve(bond.address, ethers.constants.MaxUint256)
      ).wait();
    }
    const actions = [
      {
        actionName: "approve payment",
        action: () =>
          paymentToken.approve(bond.address, ethers.constants.MaxUint256),
      },
      {
        actionName: "pay",
        action: () => bond.pay(2),
      },
      {
        actionName: "convert",
        action: () => bond.convert(1),
      },
      {
        actionName: "redeem",
        action: () => bond.redeem(1),
      },
      {
        actionName: "withdraw excess collateral",
        action: () =>
          bond.withdrawExcessCollateral(BigNumber.from(0), deployer),
      },
      {
        actionName: "withdraw excess payment",
        action: () => bond.withdrawExcessPayment(deployer),
      },
    ];

    for (let j = 0; j < actions.length; j++) {
      const {
        actionName,
        action,
      }: {
        actionName: string;
        action: () => Promise<ContractTransaction>;
      } = actions[j];
      try {
        console.log(`Executing bond action on ${bond.address}.`);
        await (await action()).wait();
        console.log(`${actionName} success!`);
      } catch (error) {
        console.log(`${actionName} failure!`);
      }
    }
  }
};

module.exports.tags = ["actions"];
module.exports.dependencies = ["bonds"];
