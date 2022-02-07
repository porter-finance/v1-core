import { expect } from "chai";
import { BN, time } from "@openzeppelin/test-helpers";

const SimpleBond = artifacts.require("SimpleBond");

contract("Porter Bond", function (accounts) {
  const [initialAccount, ...otherAccounts] = accounts;

  const totalSupply = 2500;
  const faceValue = 1000;
  const maturityValue = 1200;

  const payToAccount = otherAccounts[0];
  const secondaryAccount = otherAccounts[1];

  const name = "My Token";
  const symbol = "MTKN";

  let maturityDate: number = 0;

  beforeEach(async function () {
    maturityDate = (await time.latest()).add(time.duration.years(1));

    this.bond = await SimpleBond.new(name, symbol, initialAccount, totalSupply);

    await this.bond.approve(payToAccount, maturityValue);

    await this.bond.issueBond(
      payToAccount,
      faceValue,
      maturityValue,
      maturityDate
    );
  });

  it("should have total supply in owner account", async function () {
    expect(await this.bond.balanceOf(initialAccount)).to.be.equal(totalSupply);
  });

  it("should be owner", async function () {
    expect(await this.bond.owner()).to.be.equal(initialAccount);
  });

  it("should return total value for an account", async function () {
    expect(await this.bond.balanceOf(payToAccount)).to.be.equal(faceValue);
  });

  it("should return payment due date", async function () {
    expect(await this.bond.getDueDate(payToAccount)).to.be.equal(maturityDate);
  });

  it("should return how much is owed", async function () {
    expect(await this.bond.getOwedAmount(payToAccount)).to.be.equal(
      maturityValue
    );
  });

  it("should return bond state to be not repaid", async function () {
    expect(await this.bond.isBondRepaid(payToAccount)).to.be.equal(false);
  });

  it("should pay back bond and return correct repaid state", async function () {
    // Fund this account with some test tokens
    await this.bond.transferFrom(initialAccount, secondaryAccount, faceValue);
    await this.bond.transferFrom(secondaryAccount, payToAccount, faceValue);
    expect(await this.bond.isBondRepaid(payToAccount)).to.be.equal(true);
  });

  it("should redeem bond at maturity", async function () {
    await this.bond.redeemBond(secondaryAccount, payToAccount);
    expect(await this.bond.isBondRepaid(payToAccount)).to.be.equal(true);
  });
});
