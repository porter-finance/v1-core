pragma solidity ^0.8.0;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

import "hardhat/console.sol";

contract SimpleBond is ERC20Burnable, Ownable {
    event Withdrawal(address receiver, uint256 amount);
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

    // Thinking through this more - I'm not sure this is needed.
    // I was thinking that the bonds would be issued immedatly after being created
    // and sent to the auction contract. Then the auction contract controls
    // allowing only the winning bidders to withdraw the bonds.

    // function issueBond(address _payToAccount, uint256 _maturityDate)
    //     public
    //     onlyOwner
    // {
    //     require(
    //         totalSupply() >= 1,
    //         "Not enough tokens minted to issue this bond"
    //     );
    //     payAccountMaturityDate[_payToAccount] = _maturityDate;
    //     payAccountMaturityValue[_payToAccount] = faceValue;

    //     console.log("Passed issueBond checks");

    //     transfer(_payToAccount, 1);

    //     console.log(
    //         "Transferred token to pay account from supply",
    //         1,
    //         _payToAccount
    //     );
    // }

    function setMatuirtyDate(uint256 _maturityDate) public onlyOwner {
        maturityDate = _maturityDate;
    }

    // can probably delete this since solidity automatically makes getters:
    // https://docs.soliditylang.org/en/v0.8.11/contracts.html?highlight=getter#getter-functions
    function getMaturityDate() public view onlyOwner returns (uint256) {
        return maturityDate;
    }

    // function isBondRepaid(address _payToAccount) public view returns (bool) {
    //     require(
    //         msg.sender == _payToAccount || msg.sender == owner(),
    //         "Only the owner can call this"
    //     );

    //     return balanceOf(_payToAccount) == getOwedAmount(_payToAccount);
    // }

    // function isBondRedeemed(address _payToAccount) public view returns (bool) {
    //     console.log(
    //         "isBondRedeemed",
    //         balanceOf(_payToAccount),
    //         paymentTokenBalances[_payToAccount]
    //     );

    //     require(
    //         msg.sender == _payToAccount || msg.sender == owner(),
    //         "Only the owner can call this"
    //     );

    //     return
    //         getOwedAmount(_payToAccount) == 0 &&
    //         balanceOf(_payToAccount) == 0 &&
    //         paymentTokenBalances[_payToAccount] == 0;
    // }

    // function repayAccount(address _payToAccount) public onlyOwner {
    //     uint256 balance = balanceOf(_payToAccount);
    //     uint256 repayAmount = getOwedAmount(_payToAccount) - balance;

    //     require(balance > 0, "payee must have a balance");
    //     require(repayAmount > 0, "repay amount must be greater than 0");

    //     approve(owner(), repayAmount);
    //     transferFrom(owner(), _payToAccount, repayAmount);
    // }

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

        // code needs added here that sends the investor their payment in whatever currency
        // the dao paid back their debt in

        emit Withdrawal(msg.sender, amount);
    }

    receive() external payable {
        paymentTokenBalances[msg.sender] += msg.value;

        console.log("Received payment from", msg.sender);
        emit Deposit(msg.sender, msg.value);
    }
}
