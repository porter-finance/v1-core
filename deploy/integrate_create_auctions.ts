import { HardhatRuntimeEnvironment } from "hardhat/types";
import { deploymentBonds, easyAuction, rinkebyGnosis } from "../test/constants";
import { Bond, TestERC20 } from "../typechain";
import { BondConfigType } from "../test/interfaces";
import { ContractTransaction } from "ethers";
import {
  getBondInfo,
  initiateAuction,
  placeManyOrders,
} from "../test/utilities";

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
      const auctionId = await auction.auctionCounter();
      const auctionData = await auction.auctionData(auctionId);
      const {
        auctioningToken,
        biddingToken,
        orderCancellationEndDate,
        auctionEndDate,
      } = auctionData;
      console.log(`
Created auction ${auctionId} for ${address}.
auctioningToken: ${auctioningToken}
biddingToken: ${biddingToken}
orderCancellationEndDate: ${orderCancellationEndDate}
auctionEndDate: ${auctionEndDate}
`);
      await placeManyOrders({
        signer,
        auction,
        auctionId,
        auctionData,
        biddingToken: paymentToken,
        auctioningToken: bond,
        sellAmount: "1000",
        minBuyAmount: "1000",
        nrOfOrders: 100,
      });
    } catch (e) {
      console.log(e);
      console.log(`Failed to create auction for ${address}.`);
    }
  }
};

module.exports.tags = ["auctions"];
module.exports.dependencies = ["bonds"];
