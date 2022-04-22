import { HardhatRuntimeEnvironment } from "hardhat/types";
import { deploymentBonds } from "../test/constants";
import { Bond, TestERC20 } from "../typechain";
import { BondConfigType } from "../test/interfaces";
import { initiateAuction } from "../tasks/shared/setup";
import { ContractTransaction } from "ethers";
import { getBondInfo } from "../test/utilities";

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
  const { address: collateralTokenAddress } = await get("CollateralToken");
  const collateralToken = (await ethers.getContractAt(
    "TestERC20",
    collateralTokenAddress,
    deployer
  )) as TestERC20;
  for (let i = 0; i < deploymentBonds.length; i++) {
    const {
      auctionOptions,
      config,
    }: {
      auctionOptions: object;
      config: BondConfigType;
    } = deploymentBonds[i];
    const { bondSymbol } = await getBondInfo(
      paymentToken,
      collateralToken,
      config
    );
    const { address } = await deployments.get(bondSymbol);
    const bond = (await ethers.getContractAt("Bond", address)) as Bond;

    const auction = await ethers.getContractAt(easyAuction.abi, rinkebyGnosis);
    const signer = await ethers.getSigner(deployer);
    try {
      await (
        await paymentToken.approve(auction.address, ethers.constants.MaxUint256)
      ).wait();

      const tx: ContractTransaction = await initiateAuction(
        auction,
        signer,
        bond,
        paymentToken,
        auctionOptions
      );
      await tx.wait();
      console.log(`Created auction for ${address}.`);
    } catch (e) {
      console.log(`Failed to create auction for ${address}.`);
    }
  }
};

module.exports.tags = ["auctions"];
module.exports.dependencies = ["bonds"];
