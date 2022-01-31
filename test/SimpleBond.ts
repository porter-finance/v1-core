import { Wallet, Contract } from "ethers";
import { expect } from "chai";
import { ethers, waffle } from "hardhat";
const { loadFixture } = waffle;
// https://ethereum-waffle.readthedocs.io/en/latest/fixtures.html
// import from waffle since we are using hardhat: https://hardhat.org/plugins/nomiclabs-hardhat-waffle.html#environment-extensions

describe("SimpleBond", async () => {
  const totalSupply = 2500;
  const faceValue = 1;
  const maturityValue = 1200;
  let payToAccount: any;
  let payToAddress: any;
  let secondaryAccount: any;

  const name = "My Token";
  const symbol = "MTKN";
  // let bond: Contract;
  let bond: Contract;
  let initialAccount: any;

  async function fixture() {
    const [owner, ...otherAccounts] = await ethers.getSigners();
    payToAccount = otherAccounts[0];
    payToAddress = await otherAccounts[0].getAddress();
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
      payToAddress,
      maturityValue
      // maturityDate
    );
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
    expect(await bond.balanceOf(payToAddress)).to.be.equal(faceValue);
  });

  // it("should return payment due date", async function () {
  //   expect(await bond.getDueDate(payToAddress)).to.be.equal(maturityDate);
  // });

  it("should return how much is owed", async function () {
    expect(await bond.getOwedAmount(payToAddress)).to.be.equal(maturityValue);
  });

  it("should return bond state to be not repaid", async function () {
    expect(await bond.isBondRepaid(payToAddress)).to.be.equal(false);
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

    // TODO: this should redeem the token payment?
    await payeeBond.redeemBond(payToAddress);

    expect(await payeeBond.isBondRedeemed(payToAddress)).to.be.equal(true);
  });
});
