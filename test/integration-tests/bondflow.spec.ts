import { ethers, network } from "hardhat";
import { SimpleBond } from "../../typechain";
import { deployNATIVEandBORROW, createBond, mint, initiateAuction } from "../setup";
const { RINKEBY_DEPLOYER_ADDRESS } = process.env;
const rinkebyFactory = "0x69e892D6c419883BFa5Def1FeB01cdf71129573d";

describe.only("Integration", () => {

  if (!RINKEBY_DEPLOYER_ADDRESS)
    throw "{RINKEBY_DEPLOYER_ADDRESS} env variable is required";
  it("creates erc20 tokens and bonds", async () => {
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [RINKEBY_DEPLOYER_ADDRESS],
    });
    const signer = await ethers.getSigner(RINKEBY_DEPLOYER_ADDRESS);
    const { native, borrow } = await deployNATIVEandBORROW(signer);

    const bond = await createBond(signer, native, borrow, rinkebyFactory) as SimpleBond;

    await mint(signer, native, bond.address)

    // await initiateAuction(signer, bond, borrow)
  });



});
