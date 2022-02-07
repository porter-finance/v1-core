pragma solidity ^0.8.0;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

import "hardhat/console.sol";

contract SimpleBond is ERC20Burnable, Ownable {
  using SafeERC20 for IERC20;

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

  function issueBond(address _payToAccount, uint256 _maturityValue)
    public
    // uint256 _maturityDate
    onlyOwner
  {
    require(totalSupply() >= 1, "Not enough tokens minted to issue this bond");

    // payAccountMaturityDate[_payToAccount] = _maturityDate;
    payAccountMaturityValue[_payToAccount] = _maturityValue;

    console.log("Passed issueBond checks");

    this.safeTransfer(_payToAccount, 1);

    console.log(
      "Transferred token to pay account from supply",
      1,
      _payToAccount
    );
  }

  // function getDueDate(address _payToAccount) public view returns (uint256) {
  //   return payAccountMaturityDate[_payToAccount];
  // }

  function getOwedAmount(address _payToAccount) public view returns (uint256) {
    return payAccountMaturityValue[_payToAccount];
  }

  function isBondRepaid(address _payToAccount) public view returns (bool) {
    return balanceOf(_payToAccount) == getOwedAmount(_payToAccount);
  }

  function isBondRedeemed(address _payToAccount) public view returns (bool) {
    console.log(
      "isBondRedeemed",
      balanceOf(_payToAccount),
      paymentTokenBalances[_payToAccount] == 0
    );
    return
      balanceOf(_payToAccount) == 0 && paymentTokenBalances[_payToAccount] == 0;
  }

  function repayAccount(address _payToAccount) public {
    uint256 repayAmount = getOwedAmount(_payToAccount) -
      balanceOf(_payToAccount);

    this.safeApprove(owner(), repayAmount);
    this.safeTransferFrom(owner(), _payToAccount, repayAmount);
  }

  function redeemBond(address _payToAccount) external payable {
    uint256 payout = getOwedAmount(_payToAccount);
    uint256 expiry = payAccountMaturityDate[_payToAccount];

    require(_payToAccount == msg.sender, "you do not own this bond");
    require(expiry <= block.timestamp, "can't withdraw until maturity date");
    // require(paymentTokenBalances[_payToAccount] >= payout, "not enough funds");

    console.log("redeemBond() checks passed, payout required: ", payout);
    console.log("1 balanceOf(_payToAccount)", balanceOf(_payToAccount));

    burnFrom(_payToAccount, payout);

    console.log("2 balanceOf(_payToAccount)", balanceOf(_payToAccount));
    paymentTokenBalances[_payToAccount] = 0;
  }

  receive() external payable {
    paymentTokenBalances[msg.sender] += msg.value;

    console.log("Received payment from", msg.sender);
    emit Deposit(msg.sender, msg.value);
  }

  // Perhaps only the owner can withdraw eth?
  function withdraw() external payable onlyOwner {
    address payable to = payable(msg.sender);
    uint256 val = paymentTokenBalances[msg.sender];
    to.safeTransfer(paymentTokenBalances[msg.sender]);
    paymentTokenBalances[msg.sender] = 0;
    emit Withdrawal(to, val);
  }
}
