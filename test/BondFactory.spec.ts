import { BigNumber } from "ethers";
import { expect } from "chai";
import { TestERC20, SimpleBond, BondFactoryClone } from "../typechain";
import { getBondContract, getEventArgumentsFromTransaction } from "./utilities";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  bondFactoryFixture,
  collateralTokenFixture,
  borrowingTokenFixture,
  attackingTokenFixture,
} from "./shared/fixtures";

// https://ethereum-waffle.readthedocs.io/en/latest/fixtures.html
// import from waffle since we are using hardhat: https://hardhat.org/plugins/nomiclabs-hardhat-waffle.html#environment-extensions
const { ethers, waffle } = require("hardhat");
const { loadFixture } = waffle;

const maturityDate = Math.round(
  new Date(new Date().setFullYear(new Date().getFullYear() + 3)).getTime() /
  1000
);

const BondConfig = {
  maxBondSupply: 2000000,
  collateralizationRatio: 200,
  convertibilityRatio: 50,
  maturityDate,
};

const TEST_ADDRESSES: [string, string] = [
  '0x1000000000000000000000000000000000000000',
  '0x2000000000000000000000000000000000000000',
]


describe("BondFactory", async () => {

  let factory: BondFactoryClone;
  let collateralToken: TestERC20;
  let borrowingToken: TestERC20;
  let owner: SignerWithAddress;
  let user0: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;



  beforeEach(async () => {
    [owner, user0] = await ethers.getSigners();
    ({ factory } = await bondFactoryFixture());
    ({ collateralToken } = await collateralTokenFixture());
    ({ borrowingToken } = await borrowingTokenFixture());
  });

  it("#createBond", async () => {

    await expect(factory.createBond(
      "SimpleBond",
      "LUG",
      owner.address,
      BondConfig.maturityDate,
      BondConfig.maxBondSupply,
      TEST_ADDRESSES[0],
      BigNumber.from(BondConfig.collateralizationRatio),
      TEST_ADDRESSES[1],
      false,
      BigNumber.from(BondConfig.convertibilityRatio)
    )).to.be.revertedWith("AccessControl: account 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266 is missing role 0x114e74f6ea3bd819998f78687bfcb11b140da08e9b7d222fa9c1f1ba1f2aa122")

    await factory.grantIssuers([owner.address])
    const create = factory.createBond(
      "SimpleBond",
      "LUG",
      owner.address,
      BondConfig.maturityDate,
      BondConfig.maxBondSupply,
      TEST_ADDRESSES[0],
      BigNumber.from(BondConfig.collateralizationRatio),
      TEST_ADDRESSES[1],
      false,
      BigNumber.from(BondConfig.convertibilityRatio)
    )
    await expect(create).to.emit(factory, "BondCreated")
  });
})