pragma solidity ^0.8.0;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

import "hardhat/console.sol";

contract SimpleBond is ERC20Burnable, Ownable {
  event Withdrawal(address receiver, uint256 amount);
  event Deposit(address sender, uint256 amount);

  mapping(address => uint256) payAccountMaturityDate;
  mapping(address => uint256) payAccountMaturityValue;
  mapping(address => uint256) paymentTokenBalances;

  constructor(
    string memory _name,
    string memory _symbol,
    uint256 _totalCoins
  ) ERC20(_name, _symbol) {
    require(_totalCoins > 0, "zeroMintAmount");
    _mint(msg.sender, _totalCoins);

    console.log("Created token for bond with totalSupply of", _totalCoins);
  }

  function issueBond(
    address _payToAccount,
    uint256 _maturityValue,
    uint256 _maturityDate
  ) public onlyOwner {
    require(totalSupply() >= 1, "Not enough tokens minted to issue this bond");

    payAccountMaturityDate[_payToAccount] = _maturityDate;
    payAccountMaturityValue[_payToAccount] = _maturityValue;

    console.log("Passed issueBond checks");

    transfer(_payToAccount, 1);

    console.log(
      "Transferred token to pay account from supply",
      1,
      _payToAccount
    );
  }

  function getDueDate(address _payToAccount) public view returns (uint256) {
    require(
      msg.sender == _payToAccount || msg.sender == owner(),
      "Only the owner can call this"
    );

    return payAccountMaturityDate[_payToAccount];
  }

  function getOwedAmount(address _payToAccount) public view returns (uint256) {
    require(
      msg.sender == _payToAccount || msg.sender == owner(),
      "Only the owner can call this"
    );

    return payAccountMaturityValue[_payToAccount];
  }

  function isBondRepaid(address _payToAccount) public view returns (bool) {
    require(
      msg.sender == _payToAccount || msg.sender == owner(),
      "Only the owner can call this"
    );

    return balanceOf(_payToAccount) == getOwedAmount(_payToAccount);
  }

  function isBondRedeemed(address _payToAccount) public view returns (bool) {
    console.log(
      "isBondRedeemed",
      balanceOf(_payToAccount),
      paymentTokenBalances[_payToAccount]
    );

    require(
      msg.sender == _payToAccount || msg.sender == owner(),
      "Only the owner can call this"
    );

    return
      getOwedAmount(_payToAccount) == 0 &&
      balanceOf(_payToAccount) == 0 &&
      paymentTokenBalances[_payToAccount] == 0;
  }

  function repayAccount(address _payToAccount) public onlyOwner {
    uint256 balance = balanceOf(_payToAccount);
    uint256 repayAmount = getOwedAmount(_payToAccount) - balance;

    require(balance > 0, "payee must have a balance");
    require(repayAmount > 0, "repay amount must be greater than 0");

    approve(owner(), repayAmount);
    transferFrom(owner(), _payToAccount, repayAmount);
  }

  function redeemBond(address _payToAccount) external payable {
    require(_payToAccount == msg.sender, "you do not own this bond");

    uint256 expiry = getDueDate(_payToAccount);
    require(block.timestamp >= expiry, "can't withdraw until maturity date");

    uint256 payout = getOwedAmount(_payToAccount);
    require(paymentTokenBalances[_payToAccount] >= payout, "not enough funds");

    console.log("redeemBond() checks passed, payout required: ", payout);
    console.log("1 balanceOf(_payToAccount)", balanceOf(_payToAccount));

    burnFrom(_payToAccount, payout);
    payAccountMaturityValue[_payToAccount] = 0;
    payAccountMaturityDate[_payToAccount] = 0;

    console.log("2 balanceOf(_payToAccount)", balanceOf(_payToAccount));
    paymentTokenBalances[_payToAccount] =
      paymentTokenBalances[_payToAccount] -
      payout;

    address payable to = payable(_payToAccount);
    to.transfer(payout);

    emit Withdrawal(to, payout);
  }

  receive() external payable {
    paymentTokenBalances[msg.sender] += msg.value;

    console.log("Received payment from", msg.sender);
    emit Deposit(msg.sender, msg.value);
  }
}
