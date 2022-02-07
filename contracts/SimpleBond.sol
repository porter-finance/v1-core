pragma solidity ^0.8.0;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "hardhat/console.sol";

// Bond is created by Porter automatically when an auction is won.
// At that time, certain amount of tokens are pre-approved
// by the payTo of the auction to be deposited into the bond.
// The tokens will be locked in until maturity. The interest will be set
// at _interestRate and the bond itself will be a tradeable asset.\

// Investors allowed to purchase this bond (whitelist)

// address payTos[] = {totalValue,address}

// cusip bond unique id
// once 2k units of this bond bought
// issue tokens on separate erc20 to investors, unique per bond
// 80 cents /
// settlement is finished, i will receive the erc20 tokens representing my share of the bond
// 10k units totalsupply, 2k units given

contract SimpleBond is ERC20, Ownable {
  mapping(address => uint256) payAccountMaturityDate;
  mapping(address => uint256) payAccountFaceValueDate;
  mapping(address => uint256) payAccountMaturityValue;

  constructor(string memory _name, string memory _symbol)
    ERC20(_name, _symbol)
  {
    console.log("Created token for bond");
  }

  function issueBond(
    address _payToAccount,
    uint256 _faceValue,
    uint256 _maturityValue,
    uint256 _maturityDate
  ) public onlyOwner {
    payAccountMaturityDate[_payToAccount] = _maturityValue;
    payAccountMaturityDate[_payToAccount] = _maturityDate;
    payAccountMaturityDate[_payToAccount] = _maturityDate;

    _mint(_payToAccount, _maturityValue);

    console.log(
      "Minted maturity value to pay account",
      _maturityValue,
      _payToAccount
    );
  }

  function repayLoan(address _onBehalfOf) public {
    // do not need to check who sends it
    require(block.timestamp < payAccountMaturityDate[_onBehalfOf]);
    // amountWithInterest = amount * (1 + (maturityDate - startTime) * interestRate);
    // ERC20BurnablePorter(_borrowedToken).transferFrom(
    //   _onBehalfOf,
    //   _payTo,
    //   amountWithInterest
    // );
  }

  function withdrawWithInterest() public {
    //
  }

  function test() public {
    // Your transaction goes here
    // Press "Compile & Debug" when ready
  }
}
