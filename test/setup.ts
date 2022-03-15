import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { TestERC20, BondFactoryClone, SimpleBond } from "../typechain";
import { getBondContract } from "./utilities";
const easyAuction = require('../contracts/external/EasyAuction')

export const deployNATIVEandBORROW = async (owner: SignerWithAddress) => {
  const MockErc20Contract = await ethers.getContractFactory("TestERC20");
  const native = (await MockErc20Contract.connect(owner).deploy(
    "Native Token",
    "NATIVE",
    ethers.utils.parseUnits("50000000", 20),
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
  owner: SignerWithAddress,
  nativeToken: TestERC20,
  borrowToken: TestERC20,
  factoryAddress?: string,
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

  let factory;
  if (factoryAddress) {
    factory = (await ethers.getContractAt(
      "BondFactoryClone",
      factoryAddress
    )) as BondFactoryClone;
  } else {
    const BondFactoryClone = await ethers.getContractFactory(
      "BondFactoryClone"
    );
    factory = await BondFactoryClone.connect(owner).deploy();
  }
  const issuerRole = await factory.ISSUER_ROLE();
  const grantRoleTx = await factory
    .connect(owner)
    .grantRole(issuerRole, owner.address);
  await grantRoleTx.wait();

  const bond = await getBondContract(
    factory
      .connect(owner)
      .createBond(
        bondName,
        bondSymbol,
        owner.address,
        maturityDate,
        borrowToken.address,
        nativeToken.address,
        collateralRatio,
        convertibilityRatio,
        maxSupply
      )
  );
  return bond;
};

export const mint = async (owner: SignerWithAddress, nativeToken: TestERC20, bondAddress?: string,
) => {
  let bond;
  if (bondAddress) {
    bond = (await ethers.getContractAt(
      "SimpleBond",
      bondAddress
    )) as SimpleBond;
  } else {
    const SimpleBond = await ethers.getContractFactory(
      "SimpleBond"
    );
    bond = await SimpleBond.connect(owner).deploy();
  }

  const approveTx = await nativeToken
    .connect(owner).approve(bond.address, ethers.constants.MaxUint256)
  await approveTx.wait();

  const mintRole = await bond.MINT_ROLE();
  const grantRoleTx = await bond
    .connect(owner)
    .grantRole(mintRole, owner.address);
  await grantRoleTx.wait();
  const tomint = await bond.previewMint(ethers.utils.parseUnits("50000000", 18));
  console.log({ tomint: tomint.toString() })
  const t = await nativeToken.balanceOf(owner.address)
  console.log({ t })
  await bond.connect(owner).mint(ethers.utils.parseUnits("50000000", 18));

}

export const initiateAuction = async (owner: SignerWithAddress, bond: SimpleBond,
  borrowToken: TestERC20,
) => {
  const gnosisAddress = "0xC5992c0e0A3267C7F75493D0F717201E26BE35f7"
  const auction = (await ethers.getContractAt(
    easyAuction.abi,
    gnosisAddress
  ));
  const auctioningToken = bond.address
  const biddingToken = borrowToken.address
  const orderCancellationEndDate = 0
  const auctionEndDate = 1640301771
  const _auctionedSellAmount = await bond.balanceOf(owner.address)
  const _minBuyAmount = 1000000000000000
  const minimumBiddingAmountPerOrder = 1000000000000000
  const minFundingThreshold = 0
  const isAtomicClosureAllowed = false
  const accessManagerContract = ""
  const accessManagerContractData = ""
  const approveTx = await bond
    .connect(owner).approve(gnosisAddress, ethers.constants.MaxUint256)
  await approveTx.wait();

  auction.connect(owner).initateAuction(auctioningToken, biddingToken, orderCancellationEndDate, auctionEndDate, _auctionedSellAmount, _minBuyAmount, minimumBiddingAmountPerOrder, minFundingThreshold, isAtomicClosureAllowed, accessManagerContract, accessManagerContractData)
}
