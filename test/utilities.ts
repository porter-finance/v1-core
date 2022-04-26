import {
  BigNumber,
  BigNumberish,
  constants,
  Contract,
  ContractTransaction,
  Event,
} from "ethers";
import { use, expect } from "chai";
import { ethers } from "hardhat";
import { Bond, BondFactory, TestERC20 } from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { WAD } from "./constants";
import { BondConfigType } from "./interfaces";
export const addDaysToNow = (days: number = 0) => {
  return BigNumber.from(
    Math.floor(new Date().getTime() / 1000) + days * 24 * 60 * 60
  );
};

export async function setNextBlockTimestamp(timestamp: number): Promise<void> {
  await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
  await ethers.provider.send("evm_mine", []);
}

export async function mineBlock(): Promise<void> {
  ethers.provider.send("evm_mine", []);
}

export async function getEventArgumentsFromTransaction(
  tx: ContractTransaction,
  eventName: string
): Promise<any> {
  const receipt = await tx.wait();
  const args = receipt?.events?.find((e: Event) => e.event === eventName)?.args;
  if (args) return args;
  console.error(`No event with name ${eventName} found in transaction`);
  return {};
}

export async function getEventArgumentsFromLoop(
  tx: ContractTransaction,
  eventName: string
): Promise<any> {
  const receipt = await tx.wait();
  const args = receipt?.events
    ?.filter((e: Event) => e.event === eventName)
    ?.map((e: Event) => e.args);
  if (args) return args;
  console.error(`No event with name ${eventName} found in transaction`);
  return {};
}

export const getBondContract = async (tx: Promise<any>): Promise<Bond> => {
  const [owner] = await ethers.getSigners();

  const [newBondAddress] = await getEventArgumentsFromTransaction(
    await tx,
    "BondCreated"
  );

  return (await ethers.getContractAt("Bond", newBondAddress, owner)) as Bond;
};

/**
 * This function asserts a change of tokens occurs
 * @param tx a transaction to be executed
 * @param token an erc20 token to assert the balance change
 * @param signer the sender of the token balance transactions
 * @param address the address to check the balance of
 * @param delta the change in token expected
 */
export const expectTokenDelta = async (
  tx: Function,
  token: TestERC20,
  signer: SignerWithAddress,
  address: string,
  delta: BigNumber
): Promise<void> => {
  const balanceBefore = await token.connect(signer).balanceOf(address);
  await (await tx()).wait();
  const balanceAfter = await token.connect(signer).balanceOf(address);
  expect(balanceAfter.sub(balanceBefore).abs()).to.be.equal(delta);
};

declare global {
  export namespace Chai {
    // eslint-disable-next-line no-unused-vars
    interface Assertion {
      revertedWithArgs(errorName: string, ...args: any): Promise<void>;
    }
  }
}
export async function useCustomErrorMatcher() {
  use(function (chai) {
    chai.Assertion.addMethod("revertedWithArgs", function (errorName, ...args) {
      const expected = `${errorName}(${args
        .map((arg) => JSON.stringify(arg))
        .join(", ")})`;
      new chai.Assertion(this._obj).to.be.revertedWith(expected);
    });
  });
}

export const payAndWithdraw = async ({
  paymentToken,
  bond,
  paymentTokenAmount,
  collateralToReceive,
}: {
  paymentToken: TestERC20;
  bond: Bond;
  paymentTokenAmount: BigNumber;
  collateralToReceive: BigNumber;
}) => {
  await paymentToken.approve(bond.address, paymentTokenAmount);
  await (await bond.pay(paymentTokenAmount)).wait();
  expect(await bond.previewWithdrawExcessCollateral()).to.equal(
    collateralToReceive
  );
};

export const burnAndWithdraw = async ({
  bond,
  sharesToBurn,
  collateralToReceive,
}: {
  bond: Bond;
  sharesToBurn: BigNumber;
  collateralToReceive: BigNumber;
}) => {
  await (await bond.burn(sharesToBurn)).wait();
  expect(await bond.previewWithdrawExcessCollateral()).to.equal(
    collateralToReceive
  );
};

export const redeemAndCheckTokens = async ({
  bond,
  bondHolder,
  paymentToken,
  collateralToken,
  sharesToRedeem,
  paymentTokenToSend,
  collateralTokenToSend,
}: {
  bond: Bond;
  bondHolder: SignerWithAddress;
  paymentToken: TestERC20;
  collateralToken: TestERC20;
  sharesToRedeem: BigNumber;
  paymentTokenToSend: BigNumber;
  collateralTokenToSend: BigNumber;
}) => {
  const redeemTransaction = bond.connect(bondHolder).redeem(sharesToRedeem);
  expect(redeemTransaction).to.changeTokenBalance(
    collateralTokenToSend,
    bondHolder,
    collateralTokenToSend
  );
  expect(redeemTransaction).to.changeTokenBalance(
    paymentTokenToSend,
    bondHolder,
    paymentTokenToSend
  );
};

export const mulWad = (x: BigNumber, y: BigNumber) => {
  return x.mul(y).div(WAD);
};

export const divWad = (x: BigNumber, y: BigNumber) => {
  return x.mul(y).div(WAD);
};

export const previewRedeem = async ({
  bond,
  sharesToRedeem,
  paymentTokenToSend,
  collateralTokenToSend,
}: {
  bond: Bond;
  sharesToRedeem: BigNumber;
  paymentTokenToSend: BigNumber;
  collateralTokenToSend: BigNumber;
}) => {
  const [paymentToken, collateralToken] = await bond.previewRedeemAtMaturity(
    sharesToRedeem
  );
  expect(paymentToken).to.equal(paymentTokenToSend);
  expect(collateralToken).to.equal(collateralTokenToSend);
};

export const getBondInfo = async (
  paymentToken: TestERC20,
  collateralToken: TestERC20,
  config: BondConfigType
): Promise<{ bondName: string; bondSymbol: string }> => {
  const collateralTokenSymbol = await collateralToken.symbol();
  const paymentTokenSymbol = await paymentToken.symbol();
  const isConvertible = config.convertibleTokenAmount.gt(0);
  const productNameShort = `${isConvertible ? "CONVERT" : "SIMPLE"} Bond`;
  const productNameLong = `${
    isConvertible ? "Convertible" : "Non-Convertible"
  } Bond`;
  const maturityDate = new Date(Number(config.maturity) * 1000)
    .toLocaleString("en-us", {
      day: "2-digit",
      year: "numeric",
      month: "short",
    })
    .toUpperCase()
    .replace(/[ ,]/g, "");
  // This put value will be calculated on the front-end with actual prices
  const putAmount =
    config.collateralTokenAmount.toString().slice(0, 2) +
    "-" +
    config.maxSupply.toString().slice(0, 2);
  // This call value will be calculated on the front-end with acutal prices
  const callAmount =
    config.convertibleTokenAmount.toString().slice(0, 2) +
    "-" +
    config.maxSupply.toString().slice(0, 2);
  const bondName = `${collateralTokenSymbol} ${productNameLong}`;
  const bondSymbol = `${collateralTokenSymbol.toUpperCase()} ${productNameShort} ${maturityDate} ${
    isConvertible ? callAmount + "C " : ""
  }${paymentTokenSymbol.toUpperCase()}`;

  return {
    bondName,
    bondSymbol,
  };
};

export const createBond = async (
  config: BondConfigType,
  factory: BondFactory,
  paymentTokenContract: TestERC20,
  collateralTokenContract: TestERC20
) => {
  const paymentToken = paymentTokenContract.address;
  const collateralToken = collateralTokenContract.address;
  const { bondName, bondSymbol } = await getBondInfo(
    paymentTokenContract,
    collateralTokenContract,
    config
  );
  const bond = await getBondContract(
    factory.createBond(
      bondName,
      bondSymbol,
      config.maturity,
      paymentToken,
      collateralToken,
      config.collateralTokenAmount,
      config.convertibleTokenAmount,
      config.maxSupply
    )
  );
  return await bond;
};

export const initiateAuction = async (
  auction: Contract,
  owner: SignerWithAddress,
  bond: Bond,
  borrowToken: TestERC20,
  auctionParams?: any
) => {
  const auctioningToken = auctionParams?.auctioningToken || bond.address;
  const biddingToken = auctionParams?.biddingToken || borrowToken.address;
  // one day from today
  const orderCancellationEndDate =
    auctionParams?.orderCancellationEndDate ||
    Math.round(
      new Date(new Date().setDate(new Date().getDate() + 1)).getTime() / 1000
    );
  // one week from today
  const auctionEndDate =
    auctionParams?.auctionEndDate ||
    Math.round(
      new Date(new Date().setDate(new Date().getDate() + 7)).getTime() / 1000
    );
  const tokenBalance = await bond.balanceOf(owner.address);
  const _auctionedSellAmount = tokenBalance;
  const _minBuyAmount = 1;
  const minimumBiddingAmountPerOrder = 1;
  const minFundingThreshold = 0;
  const isAtomicClosureAllowed = false;
  const accessManagerContract = constants.AddressZero;
  const accessManagerContractData = constants.HashZero;
  const approveTx = await bond
    .connect(owner)
    .approve(auction.address, constants.MaxUint256);
  await approveTx.wait();

  const initiateAuctionTx = await auction
    .connect(owner)
    .initiateAuction(
      auctioningToken,
      biddingToken,
      orderCancellationEndDate,
      auctionEndDate,
      _auctionedSellAmount,
      _minBuyAmount,
      minimumBiddingAmountPerOrder,
      minFundingThreshold,
      isAtomicClosureAllowed,
      accessManagerContract,
      accessManagerContractData
    );
  return initiateAuctionTx;
};

export const placeManyOrders = async ({
  signer,
  auction,
  auctionId,
  auctionData,
  biddingToken,
  auctioningToken,
  sellAmount,
  minBuyAmount,
  nrOfOrders,
}: {
  signer: SignerWithAddress;
  auction: Contract;
  auctionId: string;
  auctionData: any;
  biddingToken: TestERC20;
  auctioningToken: TestERC20;
  sellAmount: string;
  minBuyAmount: string;
  nrOfOrders: number;
}) => {
  const minBuyAmountInAtoms = ethers.utils.parseUnits(
    minBuyAmount,
    await biddingToken.decimals()
  );
  const sellAmountsInAtoms = ethers.utils.parseUnits(
    sellAmount,
    await auctioningToken.decimals()
  );

  const balance = await biddingToken.callStatic.balanceOf(signer.address);
  const totalSellingAmountInAtoms = sellAmountsInAtoms.mul(nrOfOrders);

  if (totalSellingAmountInAtoms.gt(balance)) {
    throw new Error("Balance not sufficient");
  }

  const allowance = await biddingToken.callStatic.allowance(
    signer.address,
    auction.address
  );
  if (totalSellingAmountInAtoms.gt(allowance)) {
    console.log("Approving tokens:");
    const tx = await auctioningToken
      .connect(signer)
      .approve(auction.address, totalSellingAmountInAtoms);
    await tx.wait();
    console.log("Approved");
  }
  const orderBlockSize = 50;
  if (nrOfOrders % orderBlockSize !== 0) {
    throw new Error("nrOfOrders must be a multiple of orderBlockSize");
  }
  for (let i = 0; i < nrOfOrders / orderBlockSize; i += 1) {
    const minBuyAmounts = [];
    for (let j = 0; j < orderBlockSize; j++) {
      minBuyAmounts.push(
        minBuyAmountInAtoms.sub(
          BigNumber.from(i * orderBlockSize + j).mul(
            minBuyAmountInAtoms.div(10).div(nrOfOrders)
          )
        )
      );
    }

    const queueStartElement =
      "0x0000000000000000000000000000000000000000000000000000000000000001";
    await (
      await auction
        .connect(signer)
        .placeSellOrders(
          auctionId,
          minBuyAmounts,
          Array(orderBlockSize).fill(sellAmountsInAtoms),
          Array(orderBlockSize).fill(queueStartElement),
          "0x"
        )
    ).wait();
    console.log("Placed auction bid");
  }
};
