import { HardhatRuntimeEnvironment } from "hardhat/types";
import { deploymentBonds } from "../test/constants";
import { Bond, TestERC20 } from "../typechain";
import { BondConfigType } from "../test/interfaces";
import { initiateAuction } from "../tasks/shared/setup";
import { ContractTransaction } from "ethers";

const easyAuction = require("../contracts/external/EasyAuction");
const rinkebyGnosis = "0xC5992c0e0A3267C7F75493D0F717201E26BE35f7";

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

      const auction = await ethers.getContractAt(
        easyAuction.abi,
        rinkebyGnosis
      );
      const signer = await ethers.getSigner(deployer);

      const tx: ContractTransaction = await initiateAuction(
        auction,
        signer,
        bond,
        paymentToken
      );
      await tx.wait();
      console.log(`Created auction for ${address}.`);
    }
  );

  await Promise.all(bondPromises);
};

module.exports.tags = ["test"];
module.exports.dependencies = ["bonds"];
