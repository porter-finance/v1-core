import { BigNumber, utils } from "ethers";
import { expect } from "chai";
import { BondFactoryClone } from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  bondFactoryFixture,
} from "./shared/fixtures";

const { ethers } = require("hardhat");

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

const ISSUER_ROLE = utils.id("ISSUER_ROLE")
describe("BondFactory", async () => {

  let factory: BondFactoryClone;
  let owner: SignerWithAddress;
  let user0: SignerWithAddress;




  beforeEach(async () => {
    [owner, user0] = await ethers.getSigners();
    ({ factory } = await bondFactoryFixture());
  });

  async function createBond(factory: BondFactoryClone) {
    return factory.createBond(
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
  }

  describe("#createBond", async () => {

    it('only approved issuers can create a bond', async () => {

      await expect(createBond(factory)
      ).to.be.revertedWith("AccessControl: account 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266 is missing role 0x114e74f6ea3bd819998f78687bfcb11b140da08e9b7d222fa9c1f1ba1f2aa122")

      await factory.grantRole(ISSUER_ROLE, owner.address)

      await expect(createBond(factory)).to.emit(factory, "BondCreated")
    });
  })

  describe('#grantRole', async () => {
    it('fails if non owner tries to grantRole', async () => {
      await expect(factory.connect(user0).grantRole(ISSUER_ROLE, owner.address)).to.be.reverted

    })

    it('emits event', async () => {
      await expect(factory.grantRole(ISSUER_ROLE, owner.address)).to.emit(factory, "RoleGranted")
    })


  })
  describe('#setIsAllowList', async () => {

    it('fails if non owner tries to update allow list', async () => {
      await expect(factory.connect(user0).setIsAllowListEnabled(false)).to.be.reverted

    })
    it('allowList toggle works correctly', async () => {
      expect(await factory.isAllowListEnabled()).to.be.true
      const disableAllowList = factory.setIsAllowListEnabled(false)

      await expect(disableAllowList).to.emit(factory, "AllowListEnabled").withArgs(false)
      expect(await factory.isAllowListEnabled()).to.be.false

      const enableAllowList = factory.setIsAllowListEnabled(true)
      await expect(enableAllowList).to.emit(factory, "AllowListEnabled").withArgs(true)
      expect(await factory.isAllowListEnabled()).to.be.true

    })
  })

})