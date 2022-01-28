import { assert } from "chai";
import { ethers } from "hardhat";

import increaseTime from "./helpers/increaseTime";

describe("SimpleBond", function () {
  let bond;
  let name = "Simple Bond";
  let par = 1000;
  let parDecimals = 0;
  let term = 31557600 * 2; // 2 years
  let cap = 1000;
  let tokenToRedeem = 0x0; // we use eth
  let limit = 50;
  const accounts: Array<string> = [];

  let transferrableBonds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  let redeemed = [1, 2, 3, 4, 5];

  beforeEach(async () => {
    const SimpleBond = await ethers.getContractFactory("SimpleBond");

    const [owner, addr0, addr1, addr2] = await ethers.getSigners();
    accounts.push(addr0.address, addr1.address, addr2.address);

    bond = await SimpleBond.deploy(
      name,
      par,
      parDecimals,
      term,
      cap,
      owner.address,
      limit
    );

    await bond.deployed();

    console.log("donate");
    await bond.donate({ from: 0x0, value: 10 ** 16 });

    await bond.mintBond(addr1.address, limit, { from: addr0.address });
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
