pragma solidity ^0.8.0;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

import "hardhat/console.sol";

contract SimpleBond is ERC20Burnable, Ownable {
  event Redeem(address receiver, uint256 amount);
  event Deposit(address sender, uint256 amount);

  /// @notice this date is when the DAO must have repaid its debt
  /// @notice when bondholders can redeem their bonds
  uint256 public maturityDate;

  /// @notice this would go into default if maturityDate passes and the loan contract has not been paid back
  /// @notice to be set from the auction
  enum BondStanding {
    GOOD,
    DEFAULTED,
    PAID
  }

  /// @notice holds address to bond standings
  BondStanding public bondStanding;

  /// @notice whether the user has repaid their bond
  mapping(address => bool) private hasPaidBackBond;

  /// @dev New bond contract will be deployed before each auction
  /// @dev The Auction contract will be the owner
  /// @param _name Name of the bond.
  /// @param _symbol Bond ticket symbol
  /// @param _totalBonds Total number of bonds being issued - this is determined by auction config
  constructor(
    string memory _name,
    string memory _symbol,
    uint256 _totalBonds,
    uint256 _maturityDate
  ) ERC20(_name, _symbol) {
    require(_totalBonds > 0, "zeroMintAmount");
    require(_maturityDate > 1580752251, "invalid date");

    // This mints bonds based on the config given in the auction contract and
    // sends them to the auction contract
    _mint(msg.sender, _totalBonds);
    maturityDate = _maturityDate;

    console.log("Created tokenized bonds with totalSupply of", _totalBonds);
  }

  /// @notice To be set after the auction ends
  function setBondStanding(BondStanding standing) public onlyOwner {
    bondStanding = standing;
  }

  function setHasPaidBackBond(address _address, bool hasPaid) public onlyOwner {
    hasPaidBackBond[_address] = hasPaid;
  }

  function redeemBond(uint256 amount, address _address) public {
    require(amount > 0, "invalid amount");

    // the first check at least confirms maturityDate is a timestamp >= 2020
    require(
      block.timestamp >= maturityDate,
      "can't withdraw until maturity date"
    );

    // check that the DAO has already paid back the bond, set from auction
    require(hasPaidBackBond[_address] == true, "bond not yet paid");

    burnFrom(_address, amount);

    // TODO: code needs added here that sends the investor their how much they are owed in paymentToken
    // this might be calling the auction contract with AuctionContract.redeem(msg.sender, amount * faceValue)

    emit Redeem(msg.sender, amount);
  }
}
