import { BigNumber, BigNumberish } from "ethers";

export type BondConfigType = {
  targetBondSupply: BigNumber;
  collateralToken: string;
  collateralRatio: BigNumber;
  convertibilityRatio: BigNumber;
  maturityDate: BigNumberish;
  maxSupply: BigNumber;
};

export enum eEthereumNetwork {
  rinkeby = 'rinkeby',
  main = 'main',
  hardhat = 'hardhat',
}

export interface iEthereumParamsPerNetwork<T> {
  [eEthereumNetwork.rinkeby]: T;
  [eEthereumNetwork.main]: T;
  [eEthereumNetwork.hardhat]: T;
}