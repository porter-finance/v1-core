import { ethers } from "hardhat";
import { deployNATIVEandBORROW, createBond } from "../setup"
import {
    BondFactoryClone,
} from "../../typechain";

describe("creates bonds with example transactions", async () => {
    console.log("test")
    // const hardcodedFactory = "0xFfB5F7195B89Df83f9aCDE20103436d83E6ad348"
    // const factory = await ethers.getContractAt("BondFactoryClone", hardcodedFactory) as BondFactoryClone
    // const { native, borrow } = await deployNATIVEandBORROW()
    // await createBond(factory, native, borrow)
})