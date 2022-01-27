import { expect, assert } from "chai";
import { ethers } from "hardhat";

import increaseTime from "./helpers/increaseTime";

describe("SimpleBond", function (accounts) {
  let bond;
  let name = "Simple Bond";
  let par = 1000;
  let parDecimals = 0;
  let coupon = 1;
  let term = 31557600 * 2; // 2 years
  let cap = 1000;
  let tkn = 0x0; // we use eth
  let limit = 50;

  let transferrableBonds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  let redeemed = [1, 2, 3, 4, 5];

  beforeEach(async () => {
    const SimpleBond = await ethers.getContractFactory("SimpleBond");

    bond = await SimpleBond.deploy(
      name,
      par,
      parDecimals,
      term,
      cap,
      tkn,
      limit
    );

    await simpleBond.deployed();

    await bond.donate({ from: accounts[0], value: 10 ** 16 });

    await bond.mintBond(accounts[1], limit, { from: accounts[0] });

    // wait until the transaction is mined
    await setGreetingTx.wait();
  });

  it("Should return the new greeting once it's changed", async function () {});

  it("Should return the new greeting once it's changed", async function () {
    const Greeter = await ethers.getContractFactory("Greeter");
    const greeter = await Greeter.deploy("Hello, world!");
    await greeter.deployed();

    expect(await greeter.greet()).to.equal("Hello, world!");

    const setGreetingTx = await greeter.setGreeting("Hola, mundo!");

    // wait until the transaction is mined
    await setGreetingTx.wait();

    expect(await greeter.greet()).to.equal("Hola, mundo!");
  });
  it("should redeem value", async () => {
    assert.equal(await bond.getTotalDebt(), 60000);

    //Get the coupons for the first year

    await increaseTime.increaseTimeTo(
      web3.eth.getBlock(web3.eth.blockNumber).timestamp +
        increaseTime.duration.days(367)
    );

    await bond.redeemCoupons(redeemed, { from: accounts[1] });

    assert.equal(await bond.getTotalDebt(), 59500);

    await increaseTime.increaseTimeTo(
      web3.eth.getBlock(web3.eth.blockNumber).timestamp +
        increaseTime.duration.days(367)
    );

    //Get the coupons for the second year + principal back

    await bond.redeemCoupons(redeemed, { from: accounts[1] });

    assert.equal(await bond.getTotalDebt(), 54000);
  });

  it("should transfer bonds", async () => {
    await bond.transfer(accounts[2], transferrableBonds, { from: accounts[1] });

    assert.equal(await bond.getBalance(accounts[2]), 10);

    for (var i = 0; i < transferrableBonds.length; i++) {
      assert.equal(await bond.getBondOwner(i + 1), accounts[2]);
    }
  });
});
