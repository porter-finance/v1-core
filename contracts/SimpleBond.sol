pragma solidity ^0.8.0;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "hardhat/console.sol";

contract SimpleBond is ERC20, Ownable {
  event Withdrawal(address receiver, uint256 amount);
  event Deposit(address sender, uint256 amount);

  mapping(address => uint256) payAccountMaturityDate;
  mapping(address => uint256) payAccountMaturityValue;
  mapping(address => uint256) ETHBalances;

  constructor(
    string memory _name,
    string memory _symbol,
    address initialAccount,
    uint256 totalCoins
  ) ERC20(_name, _symbol) {
    _mint(initialAccount, totalCoins);

    console.log("Created token for bond with totalSupply of", totalCoins);
  }

  function issueBond(
    address _payToAccount,
    uint256 _faceValue,
    uint256 _maturityValue,
    uint256 _maturityDate
  ) public onlyOwner {
    require(
      totalSupply() >= _faceValue,
      "Not enough tokens minted to issue this bond"
    );

    payAccountMaturityDate[_payToAccount] = _maturityDate;
    payAccountMaturityValue[_payToAccount] = _maturityValue;

    console.log("Passed issueBond checks");

    transferFrom(msg.sender, _payToAccount, _faceValue);

    console.log(
      "Transferred face value to pay account, from supply",
      _faceValue,
      _payToAccount
    );
  }

  function getDueDate(address _payToAccount) public view returns (uint256) {
    return payAccountMaturityDate[_payToAccount];
  }

  function getOwedAmount(address _payToAccount) public view returns (uint256) {
    return payAccountMaturityValue[_payToAccount];
  }

  function isBondRepaid(address _payToAccount) public view returns (bool) {
    return balanceOf(_payToAccount) == 0;
  }

  receive() external payable {
    ETHBalances[msg.sender] += msg.value;

    console.log("Received payment from", msg.sender);
    emit Deposit(msg.sender, msg.value);
  }

  function redeemBond(address _onBehalfOf, address _payToAccount)
    external
    payable
  {
    uint256 payout = payAccountMaturityValue[_onBehalfOf];
    uint256 expiry = payAccountMaturityDate[_onBehalfOf];

    require(_onBehalfOf == msg.sender, "you do not own this bond");
    require(expiry <= block.timestamp, "can't withdraw until maturity date");
    require(ETHBalances[_onBehalfOf] >= payout, "not enough funds");

    console.log("checks passed");

    ETHBalances[_onBehalfOf] = ETHBalances[_onBehalfOf] - (payout);
    transferFrom(_onBehalfOf, _payToAccount, payout);
  }

  // Perhaps only the owner can withdraw eth?
  function withdraw() external payable onlyOwner {
    address payable to = payable(msg.sender);
    uint256 val = ETHBalances[msg.sender];
    to.transfer(ETHBalances[msg.sender]);
    ETHBalances[msg.sender] = 0;
    emit Withdrawal(to, val);
  }
}
