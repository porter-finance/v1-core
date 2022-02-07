import { BN } from "@openzeppelin/test-helpers";
import { shouldBehaveLikeERC20Burnable } from "./ERC20Burnable.behavior";

const ERC20BurnableMock = artifacts.require("ERC20BurnablePorter");

contract("ERC20Burnable", function (accounts) {
  const [owner, ...otherAccounts] = accounts;

  const initialBalance = new BN(1000);

  const name = "My Token";
  const symbol = "MTKN";

  beforeEach(async function () {
    this.token = await ERC20BurnableMock.new(
      name,
      symbol,
      owner,
      initialBalance,
      { from: owner }
    );
  });

  shouldBehaveLikeERC20Burnable(owner, initialBalance, otherAccounts);
});
