import { expect } from "chai";
import { SimpleBond as SimpleBondType } from "../typechain";

// https://ethereum-waffle.readthedocs.io/en/latest/fixtures.html
// import from waffle since we are using hardhat: https://hardhat.org/plugins/nomiclabs-hardhat-waffle.html#environment-extensions
const { ethers, waffle } = require("hardhat");
const { loadFixture, deployContract } = waffle;

const SimpleBond = require("../artifacts/contracts/SimpleBond.sol/SimpleBond.json");

describe("SimpleBond", async () => {
  const defaultBondStanding = 0;

  // 3 years from now, in seconds
  const maturityDate = Math.round(
    new Date(new Date().setFullYear(new Date().getFullYear() + 3)).getTime() /
      1000
  );

  // A realistic number for this is like 2m
  const totalBondSupply = 12500;
  const bondShares = 1000;
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
      totalBondSupply,
      maturityDate,
    ]);
    return { bond, wallet, other };
  }

  beforeEach(async () => {
    const { wallet, other } = await loadFixture(fixture);
    payToAccount = other;
    initialAccount = await wallet.getAddress();
    payToAddress = await other.getAddress();
    await bond.transfer(payToAddress, bondShares);
  });

  it("should have total supply less bond issuance in owner account", async function () {
    expect(await bond.balanceOf(initialAccount)).to.be.equal(
      totalBondSupply - bondShares
    );

    expect(await bond.balanceOf(payToAddress)).to.be.equal(bondShares);
  });

  it("should be owner", async function () {
    expect(await bond.owner()).to.be.equal(initialAccount);
  });

  it("should return total value for an account", async function () {
    const payeeBond = await bond.connect(payToAccount);

    expect(await payeeBond.balanceOf(payToAddress)).to.be.equal(bondShares);
  });

  it("should return payment due date", async function () {
    const payeeBond = await bond.connect(payToAccount);

    expect(await payeeBond.maturityDate()).to.be.equal(maturityDate);
  });

  it("should return bond standing to be not repaid", async function () {
    const payeeBond = await bond.connect(payToAccount);

    expect(await payeeBond.currentBondStanding()).to.be.equal(
      defaultBondStanding
    );
  });

  it("should set bond standing to be repaid", async function () {
    expect(await bond.currentBondStanding()).to.be.equal(defaultBondStanding);

    await bond.setBondStanding(2);

    expect(await bond.currentBondStanding()).to.be.equal(2);
  });

  it("should emit an event on setting bond standing", async function () {
    expect(await bond.currentBondStanding()).to.be.equal(defaultBondStanding);

    expect(await bond.setBondStanding(2))
      .to.emit(bond, "BondStandingChange")
      .withArgs(0, 2);
  });

  it("should only be called by owner", async function () {
    const payeeBond = await bond.connect(payToAccount);

    expect(payeeBond.setBondStanding(2)).to.be.revertedWith(
      "Ownable: caller is not the owner"
    );
  });

  // failing until hooked up with auction
  it("should pay back bond and return correct repaid standing", async function () {
    // quick check to make sure payTo has a bond issued
    expect(await bond.balanceOf(payToAddress)).to.be.equal(bondShares);

    // and that it's not already paid off
    expect(await bond.currentBondStanding()).to.be.equal(defaultBondStanding);

    // This should repay using auction contract
    // await auctionContract.repay(address)...
    expect(await bond.currentBondStanding()).to.be.equal(2);
  });

  // failing until hooked up with auction
  it("should redeem bond at maturity", async function () {
    // Connect the pay account to this contract
    const payeeBond = bond.connect(payToAccount);

    // quick check to make sure payTo has a bond issued
    expect(await payeeBond.balanceOf(payToAddress)).to.be.equal(bondShares);

    // and that it's not already paid off
    expect(await payeeBond.currentBondStanding()).to.be.equal(
      defaultBondStanding
    );
    // This should repay using auction contract
    // await auctionContract.repay(address)...
    expect(await payeeBond.currentBondStanding()).to.be.equal(2);

    // TODO: this should approve the token payment not the bond token?
    await payeeBond.approve(payToAddress, bondShares);

    // Pays 1:1 to the bond token
    await payToAccount.sendTransaction({
      to: payeeBond.address,
      value: bondShares,
    });

    // Fast forward to expire
    await ethers.provider.send("evm_mine", [maturityDate]);

    const currentBal = await payToAccount.getBalance();
    expect(await payeeBond.redeemBond(bondShares))
      .to.emit(payeeBond, "Redeem")
      .withArgs(bondShares);

    expect(await bond.setBondStanding(2))
      .to.emit(bond, "BondStandingChange")
      .withArgs(0, 2);

    // This is failing, likely because sendTransaction isn't sending value in
    // a format it's expecting? not sure
    expect(await payToAccount.getBalance()).to.be.equal(
      currentBal.add(bondShares)
    );

    expect(await payeeBond.currentBondStanding()).to.be.equal(3);
  });
});
