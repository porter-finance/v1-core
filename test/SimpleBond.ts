import { expect } from "chai";
import { SimpleBond as SimpleBondType } from "../typechain";

// https://ethereum-waffle.readthedocs.io/en/latest/fixtures.html
// import from waffle since we are using hardhat: https://hardhat.org/plugins/nomiclabs-hardhat-waffle.html#environment-extensions
const { ethers, waffle } = require("hardhat");
const { loadFixture, deployContract } = waffle;
const { BigNumber } = ethers;

const SimpleBond = require("../artifacts/contracts/SimpleBond.sol/SimpleBond.json");

describe("SimpleBond", async () => {
  // 3 years from now, in seconds
  const maturityDate = Math.round(
    new Date(new Date().setFullYear(new Date().getFullYear() + 3)).getTime() /
      1000
  );

  const totalSupply = 2500;
  const faceValue = 1;
  const maturityValue = 1200;
  let payToAccount: any;
  let payToAddress: any;

  const name = "My Token";
  const symbol = "MTKN";
  let bond: SimpleBondType;
  let initialAccount: any;

  // no args because of gh issue:
  // https://github.com/nomiclabs/hardhat/issues/849#issuecomment-860576796
  async function fixture() {
    const [wallet, other] = await ethers.getSigners();
    bond = await deployContract(wallet, SimpleBond, [
      name,
      symbol,
      totalSupply,
    ]);
    return { bond, wallet, other };
  }

  beforeEach(async () => {
    const { bond, wallet, other } = await loadFixture(fixture);
    payToAccount = other;
    initialAccount = await wallet.getAddress();
    payToAddress = await other.getAddress();
    await bond.issueBond(payToAddress, maturityValue, maturityDate);
  });

  it("should have total supply less bond issuance in owner account", async function () {
    expect(await bond.balanceOf(initialAccount)).to.be.equal(
      totalSupply - faceValue
    );
    expect(await bond.balanceOf(payToAddress)).to.be.equal(faceValue);
  });

  it("should be owner", async function () {
    expect(await bond.owner()).to.be.equal(initialAccount);
  });

  it("should return total value for an account", async function () {
    const payeeBond = await bond.connect(payToAccount);

    expect(await payeeBond.balanceOf(payToAddress)).to.be.equal(faceValue);
  });

  it("should return payment due date", async function () {
    const payeeBond = await bond.connect(payToAccount);

    expect(await payeeBond.getDueDate(payToAddress)).to.be.equal(maturityDate);
  });

  it("should return how much is owed", async function () {
    const payeeBond = await bond.connect(payToAccount);

    expect(await payeeBond.getOwedAmount(payToAddress)).to.be.equal(
      maturityValue
    );
  });

  it("should return bond state to be not repaid", async function () {
    const payeeBond = await bond.connect(payToAccount);

    expect(await payeeBond.isBondRepaid(payToAddress)).to.be.equal(false);
  });

  it("should pay back bond and return correct repaid state", async function () {
    // quick check to make sure payTo has a bond issued
    expect(await bond.balanceOf(payToAddress)).to.be.equal(faceValue);

    // and that it's not already paid off
    expect(await bond.isBondRepaid(payToAddress)).to.be.equal(false);

    await bond.repayAccount(payToAddress);
    expect(await bond.isBondRepaid(payToAddress)).to.be.equal(true);
  });

  it("should redeem bond at maturity", async function () {
    // Connect the pay account to this contract
    const payeeBond = await bond.connect(payToAccount);

    // quick check to make sure payTo has a bond issued
    expect(await payeeBond.balanceOf(payToAddress)).to.be.equal(faceValue);

    // and that it's not already paid off
    expect(await payeeBond.isBondRepaid(payToAddress)).to.be.equal(false);
    await bond.repayAccount(payToAddress);
    expect(await payeeBond.isBondRepaid(payToAddress)).to.be.equal(true);

    // TODO: this should approve the token payment not the bond token?
    await payeeBond.approve(payToAddress, maturityValue);

    // Pays 1:1 to the bond token
    await payToAccount.sendTransaction({
      to: payeeBond.address,
      value: maturityValue,
    });

    // Fast forward to expire
    await ethers.provider.send("evm_mine", [maturityDate]);

    const currentBal = await payToAccount.getBalance();
    await payeeBond.redeemBond(payToAddress);

    // This is failing, likely because sendTransaction isn't sending value in
    // a format it's expecting? not sure ...
    expect(await payToAccount.getBalance()).to.be.equal(
      currentBal.add(maturityValue)
    );

    expect(await payeeBond.isBondRedeemed(payToAddress)).to.be.equal(true);
  });
});
