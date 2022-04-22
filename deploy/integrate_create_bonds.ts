import { HardhatRuntimeEnvironment } from "hardhat/types";
import { BondFactory } from "../typechain";
import { BondConfigType } from "../test/interfaces";
import { BondParams } from "../test/BondFactory.spec";
import { getBondContract } from "../test/utilities";
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

  const createBond = async (
    bondName: string,
    bondSymbol: string,
    config: BondConfigType,
    params: BondParams
  ) => {
    const maturity = params.maturity || config.maturity;
    const paymentToken =
      params.paymentToken || (await get("PaymentToken")).address;
    const collateralToken =
      params.collateralToken || (await get("CollateralToken")).address;
    const collateralTokenAmount =
      params.collateralTokenAmount || config.collateralTokenAmount;
    const convertibleTokenAmount =
      params.convertibleTokenAmount || config.convertibleTokenAmount;
    const maxSupply = params.maxSupply || config.maxSupply;
    const bond = await getBondContract(
      factory.createBond(
        bondName,
        bondSymbol,
        maturity,
        paymentToken,
        collateralToken,
        collateralTokenAmount,
        convertibleTokenAmount,
        maxSupply
      )
    );
    return await bond;
  };

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
      const { address } = await createBond(bondName, "BOND", config, options);

      console.log(`Deployed a ${bondName} bond @ (${address}).`);

      deployments.save(bondName, {
        abi: bondArtifact.abi,
        address,
      });
    }
  );

  await Promise.all(bondPromises);
};

module.exports.tags = ["bonds"];
module.exports.dependencies = ["permissions"];
