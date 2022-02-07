pragma solidity ^0.8.0;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "hardhat/console.sol";

contract SimpleBond is ERC20, Ownable {
  event Withdrawal(address receiver, uint256 amount);
  event Deposit(address sender, uint256 amount);

  mapping(address => uint256) payAccountMaturityDate;
  mapping(address => uint256) payAccountMaturityValue;
  mapping(address => uint256) paymentTokenBalances;

  constructor(
    string memory _name,
    string memory _symbol,
    uint256 totalCoins
  ) ERC20(_name, _symbol) {
    _mint(msg.sender, totalCoins);

    console.log("Created token for bond with totalSupply of", totalCoins);
  }

  function issueBond(
    address _payToAccount,
    uint256 _faceValue,
    uint256 _maturityValue
  )
    public
    // uint256 _maturityDate
    onlyOwner
  {
    require(
      totalSupply() >= _faceValue,
      "Not enough tokens minted to issue this bond"
    );

    // payAccountMaturityDate[_payToAccount] = _maturityDate;
    payAccountMaturityValue[_payToAccount] = _maturityValue;

    console.log("Passed issueBond checks");

    transfer(_payToAccount, _faceValue);

    console.log(
      "Transferred face value to pay account, from supply",
      _faceValue,
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

    approve(owner(), repayAmount);
    transferFrom(owner(), _payToAccount, repayAmount);
  }

  function redeemBond(address _onBehalfOf, address _payToAccount)
    external
    payable
  {
    uint256 payout = payAccountMaturityValue[_onBehalfOf];
    uint256 expiry = payAccountMaturityDate[_onBehalfOf];

    require(_onBehalfOf == msg.sender, "you do not own this bond");
    require(expiry <= block.timestamp, "can't withdraw until maturity date");
    require(paymentTokenBalances[_onBehalfOf] >= payout, "not enough funds");

    console.log("checks passed");

    transferFrom(_payToAccount, _onBehalfOf, payout);
    paymentTokenBalances[_onBehalfOf] = 0;
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
    to.transfer(paymentTokenBalances[msg.sender]);
    paymentTokenBalances[msg.sender] = 0;
    emit Withdrawal(to, val);
  }
}
