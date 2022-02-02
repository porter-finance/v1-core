pragma solidity ^0.8.0;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

import "hardhat/console.sol";

contract SimpleBond is ERC20Burnable, Ownable {
    event Redeem(address receiver, uint256 amount);
    event Deposit(address sender, uint256 amount);

    // @dev this is the address of the token that the DAO owes.
    // @dev for example - DAI or USDC
    // @dev This is the token that investors will be paid back with once
    // @dev the DAO has paid back their loan & the maturity date has been reached
    address public paymentToken;

    // @notice This is the ratio is which the bonds can be exchanged for the
    // underlying collateral. For stablecoins this should be 1
    // Another number might make sense if the paymentToken is something other
    // than a stable coin
    // faceValue * number of bonds = number of paymentTokens the investor should get
    // at redeem()
    uint8 public faceValue = 1;

    // @dev this date is when the DAO must have repaid it's debt and
    // @dev when bondholders can redeem their bonds
    uint256 public maturityDate;

    // probably shouldn't be a string
    // this would go into default if maturityDate passes and the loan contract has not been paid back
    // 'good' | 'default'
    string public bondStanding = "good";

    mapping(address => uint256) public paymentTokenBalances;

    /// @dev New bond contract will be deployed before each auction
    /// @dev The Auction contract will be the owner
    // @param _name Name of the bond.
    // @param _symbol Bond ticket symbol
    // @param _totalBonds Total number of bonds being issued - this is determined by auction config
    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _totalBonds
    ) ERC20(_name, _symbol) {
        require(_totalBonds > 0, "zeroMintAmount");
        // This mints bonds based on the config given in the auction contract and
        // sends them to the auction contract
        _mint(msg.sender, _totalBonds);

        console.log("Created tokenized bonds with totalSupply of", _totalBonds);
    }

    function setMatuirtyDate(uint256 _maturityDate) public onlyOwner {
        maturityDate = _maturityDate;
    }

    // can probably delete this since solidity automatically makes getters:
    // https://docs.soliditylang.org/en/v0.8.11/contracts.html?highlight=getter#getter-functions
    function getMaturityDate() public view onlyOwner returns (uint256) {
        return maturityDate;
    }

    function redeemBond(uint256 amount) public {
        require(
            block.timestamp >= maturityDate,
            "can't withdraw until maturity date"
        );

        // there needs to be some sort of check that the DAO has already paid back the bond

        require(amount >= 0, "not enough funds");

        console.log("redeemBond() checks passed, payout required: ", amount);
        console.log("1 balanceOf(_payToAccount)", balanceOf(msg.sender));

        // not sure difference between burn and burnFrom
        // this burns however amount of bonds investor sent to the redeem method
        burn(amount);

        // code needs added here that sends the investor their how much they are owed in paymentToken
        // this might be calling the auction contract with AuctionContract.redeem(msg.sender, amount * faceValue)

        emit Redeem(msg.sender, amount);
    }

    // is this just a fallback? I don't think people should ever be sending ether to this cont
    receive() external payable {
        paymentTokenBalances[msg.sender] += msg.value;

        console.log("Received payment from", msg.sender);
        emit Deposit(msg.sender, msg.value);
    }
}
