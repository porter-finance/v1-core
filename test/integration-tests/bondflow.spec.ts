import { ethers, network } from "hardhat";
import { expect } from "chai";
import { SimpleBond } from "../../typechain";
import {
  deployNATIVEandBORROW,
  createBond,
  mint,
  initiateAuction,
} from "../setup";
const easyAuction = require("../../contracts/external/EasyAuction");

const { RINKEBY_DEPLOYER_ADDRESS } = process.env;
const rinkebyFactory = "0x69e892D6c419883BFa5Def1FeB01cdf71129573d";
const rinkebyGnosis = "0xC5992c0e0A3267C7F75493D0F717201E26BE35f7";
describe("Integration", () => {
  if (!RINKEBY_DEPLOYER_ADDRESS)
    throw "{RINKEBY_DEPLOYER_ADDRESS} env variable is required";
  it("creates erc20 tokens and bonds", async () => {
    if (network.name === 'hardhat') {
      await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [RINKEBY_DEPLOYER_ADDRESS],
      });
    }
    const signer = await ethers.getSigner(RINKEBY_DEPLOYER_ADDRESS);
    const { native, borrow } = await deployNATIVEandBORROW(signer);

    const bond = (await createBond(
      signer,
      native,
      borrow,
      rinkebyFactory
    )) as SimpleBond;

    await mint(signer, native, bond.address);

    const auction = await ethers.getContractAt(easyAuction.abi, rinkebyGnosis);

    await expect(initiateAuction(auction, signer, bond, borrow)).to.emit(
      auction,
      "NewAuction"
    );
  });
});
