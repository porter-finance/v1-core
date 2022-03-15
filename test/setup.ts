import { ethers, network } from "hardhat";
import { TestERC20, BondFactoryClone } from "../typechain";
import { getBondContract } from "./utilities";
import { eEthereumNetwork } from './interfaces'

const { FORK, RINKEBY_DEPLOYER_ADDRESS } = process.env
export const deployNATIVEandBORROW = async () => {
  const MockErc20Contract = await ethers.getContractFactory("TestERC20");
  const native = (await MockErc20Contract.deploy(
    "Native Token",
    "NATIVE",
    ethers.utils.parseUnits("500"),
    18
  )) as TestERC20;

  const borrow = (await MockErc20Contract.deploy(
    "Borrowing Token",
    "BORROW",
    ethers.utils.parseUnits("500"),
    18
  )) as TestERC20;

  return { native, borrow };
};

export const createBond = async (
  factoryAddress: string | undefined,
  nativeToken: TestERC20,
  borrowToken: TestERC20
) => {
  // these could be converted to parameters
  const bondName = "Always be growing";
  const bondSymbol = "LEARN";
  const collateralRatio = ethers.utils.parseUnits(".5", 18);
  const convertibilityRatio = ethers.utils.parseUnits(".5", 18);
  const maturityDate = Math.round(
    new Date(new Date().setFullYear(new Date().getFullYear() + 3)).getTime() /
    1000
  );
  const maxSupply = ethers.utils.parseUnits("50000000", 18);
  let [issuer] = await ethers.getSigners();
  if (FORK === eEthereumNetwork.rinkeby) {
    if (!RINKEBY_DEPLOYER_ADDRESS) throw "{RINKEBY_DEPLOYER_ADDRESS} env variable is required"
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [RINKEBY_DEPLOYER_ADDRESS],
    });
    issuer = await ethers.getSigner(RINKEBY_DEPLOYER_ADDRESS)
  }

  let factory;
  if (factoryAddress) {
    factory = await ethers.getContractAt("BondFactoryClone", factoryAddress) as BondFactoryClone
  }
  else {
    const BondFactoryClone = await ethers.getContractFactory(
      "BondFactoryClone"
    );
    factory = await BondFactoryClone.connect(issuer).deploy();
  }
  const issuerRole = await factory.ISSUER_ROLE();
  const grantRoleTx = await factory.connect(issuer).grantRole(issuerRole, issuer.address);
  await grantRoleTx.wait();

  const bond = await getBondContract(
    factory.connect(issuer).createBond(
      bondName,
      bondSymbol,
      issuer.address,
      maturityDate,
      nativeToken.address,
      borrowToken.address,
      collateralRatio,
      convertibilityRatio,
      maxSupply
    )
  );
  return bond;
};
