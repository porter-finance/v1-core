import { BigNumber, BigNumberish } from "ethers";

export type BondConfigType = {
  targetBondSupply: BigNumber;
  backingToken: string;
  collateralRatio: BigNumber;
  convertibilityRatio: BigNumber;
  repaymentRatio: BigNumber;
  maturityDate: BigNumberish;
  maxSupply: BigNumber;
};
