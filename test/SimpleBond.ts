import { Wallet, Contract } from "ethers";
import { expect } from "chai";
import { ethers, waffle } from "hardhat";
const { loadFixture } = waffle;
// https://ethereum-waffle.readthedocs.io/en/latest/fixtures.html
// import from waffle since we are using hardhat: https://hardhat.org/plugins/nomiclabs-hardhat-waffle.html#environment-extensions

describe("SimpleBond", async () => {
  const totalSupply = 2500;
  const faceValue = 1000;
  const maturityValue = 1200;
  let payToAccount: any;
  let secondaryAccount: any;

  const name = "My Token";
  const symbol = "MTKN";
  // let bond: Contract;
  let bond: Contract;
  let initialAccount: any;

  async function fixture() {
    const [owner, ...otherAccounts] = await ethers.getSigners();
    payToAccount = await otherAccounts[0].getAddress();
    secondaryAccount = await otherAccounts[1].getAddress();
    const SimpleBond = await ethers.getContractFactory("SimpleBond");
    const ownerAddress = await owner.getAddress();
    bond = await SimpleBond.deploy(name, symbol, totalSupply);
    return { bond, ownerAddress };
  }

  beforeEach(async () => {
    const { bond, ownerAddress } = await loadFixture(fixture);
    initialAccount = ownerAddress;
    await bond.issueBond(
      payToAccount,
      faceValue,
      maturityValue
      // maturityDate
    );
  });
  it("should have total supply in owner account", async function () {
    expect(await bond.balanceOf(initialAccount)).to.be.equal(totalSupply);
  });

  it("should be owner", async function () {
    expect(await bond.owner()).to.be.equal(initialAccount);
  });

  it("should return total value for an account", async function () {
    expect(await bond.balanceOf(payToAccount)).to.be.equal(faceValue);
  });

  // it("should return payment due date", async function () {
  //   expect(await bond.getDueDate(payToAccount)).to.be.equal(maturityDate);
  // });

  it("should return how much is owed", async function () {
    expect(await bond.getOwedAmount(payToAccount)).to.be.equal(maturityValue);
  });

  it("should return bond state to be not repaid", async function () {
    expect(await bond.isBondRepaid(payToAccount)).to.be.equal(false);
  });

  it("should pay back bond and return correct repaid state", async function () {
    expect(await bond.balanceOf(payToAccount)).to.be.equal(faceValue);

    await bond.transferFrom(payToAccount, initialAccount, faceValue);
    expect(await bond.isBondRepaid(payToAccount)).to.be.equal(true);
  });

  it("should redeem bond at maturity", async function () {
    await bond.redeemBond(secondaryAccount, payToAccount);
    expect(await bond.isBondRepaid(payToAccount)).to.be.equal(true);
  });
});
