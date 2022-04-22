import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Bond, BondFactory, TestERC20 } from "../typechain";
import { BondConfigType } from "../test/interfaces";
import { BondParams } from "../test/BondFactory.spec";
import { getBondContract, getBondInfo } from "../test/utilities";
import { deploymentBonds } from "../test/constants";

module.exports = async function ({
  deployments,
  getNamedAccounts,
  ethers,
  artifacts,
}: HardhatRuntimeEnvironment) {
  const { get } = deployments;

  const { deployer } = await getNamedAccounts();
  const { address } = await get("BondFactory");
  const factory = (await ethers.getContractAt(
    "BondFactory",
    address,
    deployer
  )) as BondFactory;

  const bondArtifact = await artifacts.readArtifact("Bond");

  const paymentTokenAddress = (await get("PaymentToken")).address;
  const paymentTokenContract = (await ethers.getContractAt(
    "TestERC20",
    paymentTokenAddress
  )) as TestERC20;
  const collateralTokenAddress = (await get("CollateralToken")).address;
  const collateralTokenContract = (await ethers.getContractAt(
    "TestERC20",
    collateralTokenAddress
  )) as TestERC20;
  const createBond = async (
    config: BondConfigType,
    params: BondParams,
    nonce: number
  ) => {
    const maturity = params.maturity || config.maturity;
    const paymentToken = params.paymentToken || paymentTokenContract.address;
    const collateralToken =
      params.collateralToken || collateralTokenContract.address;
    const collateralTokenAmount =
      params.collateralTokenAmount || config.collateralTokenAmount;
    const convertibleTokenAmount =
      params.convertibleTokenAmount || config.convertibleTokenAmount;
    const maxSupply = params.maxSupply || config.maxSupply;
    const { bondName, bondSymbol } = await getBondInfo(
      paymentTokenContract,
      collateralTokenContract,
      config
    );
    const bond = await getBondContract(
      factory.createBond(
        bondName,
        bondSymbol,
        maturity,
        paymentToken,
        collateralToken,
        collateralTokenAmount,
        convertibleTokenAmount,
        maxSupply,
        { nonce }
      )
    );
    return await bond;
  };

  const signer = await ethers.getSigner(deployer);
  const currentNonce = await signer.getTransactionCount();
  for (let i = 0; i < deploymentBonds.length; i++) {
    const {
      config,
      bondOptions,
    }: {
      config: BondConfigType;
      bondOptions: object;
    } = deploymentBonds[i];
    let bondAddress: string;
    const { bondSymbol } = await getBondInfo(
      paymentTokenContract,
      collateralTokenContract,
      config
    );
    try {
      const foundBond = await get(bondSymbol);
      bondAddress = foundBond.address;
      const bond = (await ethers.getContractAt("Bond", bondAddress)) as Bond;
      if ((await bond.owner()) !== deployer) {
        throw new Error("Bond deployed with different owner.");
      }
      console.log(`${bondSymbol} found. Skipping.`);
    } catch (e) {
      const { address } = await createBond(
        config,
        bondOptions,
        currentNonce + i
      );
      console.log(`Deployed a ${bondSymbol} bond @ (${address}).`);

      deployments.save(bondSymbol, {
        abi: bondArtifact.abi,
        address,
      });
    }
  }
};

module.exports.tags = ["bonds"];
module.exports.dependencies = ["permissions"];
