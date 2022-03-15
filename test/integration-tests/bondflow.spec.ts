import { ethers } from "hardhat";
import { deployNATIVEandBORROW, createBond } from "../setup";
import { BondFactoryClone } from "../../typechain";

describe("Integration", () => {
  it.only("creates erc20 tokens and bonds", async () => {
    const { native, borrow } = await deployNATIVEandBORROW();
    const { HARDCODED_FACTORY } = process.env

    await createBond(HARDCODED_FACTORY, native, borrow);
  });
});
