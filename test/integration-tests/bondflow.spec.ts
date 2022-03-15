import { ethers, network } from "hardhat";
import { deployNATIVEandREPAY, createBond } from "../setup";
const { RINKEBY_DEPLOYER_ADDRESS } = process.env;
const rinkebyFactory = "0x69e892D6c419883BFa5Def1FeB01cdf71129573d";

describe("Integration", () => {
  if (!RINKEBY_DEPLOYER_ADDRESS)
    throw new Error("{RINKEBY_DEPLOYER_ADDRESS} env variable is required");

  it("creates erc20 tokens and bonds", async () => {
    const { native, repay } = await deployNATIVEandREPAY();
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [RINKEBY_DEPLOYER_ADDRESS],
    });
    const signer = await ethers.getSigner(RINKEBY_DEPLOYER_ADDRESS);
    await createBond(signer, native, repay, rinkebyFactory);
  });
});
