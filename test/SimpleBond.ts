import { expect } from "chai";
import { BN, time } from "@openzeppelin/test-helpers";

const SimpleBond = artifacts.require("SimpleBond");

contract("Porter Bond", function (accounts) {
  const [initialAccount, ...otherAccounts] = accounts;

  const faceValue = new BN(1000);
  const maturityValue = new BN(1200);

  const payToAccount = otherAccounts[0];

  const name = "My Token";
  const symbol = "MTKN";

  let maturityDate: number = 0;

  beforeEach(async function () {
    maturityDate = (await time.latest()).add(time.duration.years(1));

    this.bond = await SimpleBond.new(name, symbol);
  });

  it("should be owner", async function () {
    expect(await this.bond.owner()).to.be.equal(initialAccount);
  });

  it("should return total supply", async function () {
    await this.bond.issueBond(
      payToAccount,
      faceValue,
      maturityValue,
      maturityDate
    );
    expect(await this.bond.totalSupply()).to.be.bignumber.equal(maturityValue);
  });

  it("should return interest rate", async function () {
    // console.log("this.bond");
  });

  it("should return payment due date", async function () {
    // console.log("this.bond");
  });

  it("should return how much is owed", async function () {
    // console.log("this.bond");
  });

  it("should return bond state", async function () {
    // console.log("this.bond");
  });

  it("should pay back bond", async function () {
    // console.log("this.bond");
  });

  it("should redeem bond at maturity", async function () {
    // console.log("this.bond");
  });
});
