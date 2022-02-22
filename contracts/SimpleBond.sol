// SPDX-License-Identifier: AGPL
pragma solidity 0.8.9;
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract SimpleBond is
  Initializable,
  ERC20Upgradeable,
  ERC20BurnableUpgradeable,
  OwnableUpgradeable,
  ReentrancyGuard
{
  /// @notice this would go into default if maturityDate passes and the loan contract has not been paid back
  /// @notice to be set from the auction
  enum BondStanding {
    // the auction completed
    GOOD,
    // when maturity date passes and its unpaid
    DEFAULTED,
    // after DAO pays
    PAID,
    // when 100% of bondholders have redeemed their bonds
    REDEEMED,
    // when something goes wrong and this contract becomes nullified
    NULL
  }

  event BondStandingChange(BondStanding oldStanding, BondStanding newStanding);

  /// @notice emitted when a collateral is deposited for a bond
  /// @param collateralDepositor the address of the caller of the deposit
  /// @param amount the number of the tokens being deposited
  event CollateralDeposited(
    address indexed collateralDepositor,
    uint256 amount
  );

  /// @notice emitted when a bond's issuer withdraws collateral
  /// @param amount the number of the tokens withdrawn
  event CollateralWithdrawn(uint256 amount);

  /// @notice emitted when a portion of the bond's principal is paid back
  event RepaymentDeposited(address indexed repaymentDepositor, uint256 amount);

  /// @notice emitted when all of the bond's principal is paid back
  event RepaymentInFull(address indexed repaymentDepositor, uint256 amount);

  /// @notice emitted when bond tokens are converted by a borrower
  event Converted(
    address indexed convertorAddress,
    uint256 amountOfBondsConverted,
    uint256 amountOfCollateralReceived
  );

  error OnlyIssuerOfBondMayCallThisFunction();
  error InvalidMaturityDate();
  error NotEnoughCollateral();
  error BondSupplyExceeded();

  /// @notice
  event Redeem(address receiver, uint256 amount);

  modifier onlyIssuer() {
    if (issuer != msg.sender) {
      revert OnlyIssuerOfBondMayCallThisFunction();
    }
    _;
  }

  /// @notice this date is when the DAO must have repaid its debt
  /// @notice when bondholders can redeem their bonds
  uint256 public maturityDate;
  address public collateralAddress;
  uint256 public collateralizationRatio;
  bool public isConvertible;
  address public borrowingAddress;
  uint256 public repaymentAmount;
  address public issuer;
  uint256 public maxBondSupply;

  /// @notice holds address to bond standing
  BondStanding public currentBondStanding;

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() initializer {}

  /// @dev New bond contract will be deployed before each auction
  /// @dev The Auction contract will be the owner
  /// @param _name Name of the bond.
  /// @param _symbol Bond ticket symbol
  /// @param _totalBondSupply Total number of bonds being issued - this is determined by auction config
  function initialize(
    string memory _name,
    string memory _symbol,
    uint256 _totalBondSupply,
    uint256 _maturityDate,
    address _owner,
    address _issuer,
    address _collateralAddress,
    uint256 _collateralizationRatio,
    bool _isConvertible,
    address _borrowingAddress,
    uint256 _repaymentAmount
  ) public initializer {
    // this timestamp is a date in 2020, which basically is here to confirm
    // the date provided is greater than 0 and a valid timestamp
    if (_maturityDate < 1580752251) {
      revert InvalidMaturityDate();
    }

    // This mints bonds based on the config given in the auction contract and
    // sends them to the auction contract
    __ERC20_init(_name, _symbol);
    __ERC20Burnable_init();
    __Ownable_init();

    maturityDate = _maturityDate;
    collateralAddress = _collateralAddress;
    collateralizationRatio = _collateralizationRatio;
    isConvertible = _isConvertible;
    borrowingAddress = _borrowingAddress;
    repaymentAmount = _repaymentAmount;
    issuer = _issuer;
    maxBondSupply = _totalBondSupply;

    _transferOwnership(_owner);
    currentBondStanding = BondStanding.GOOD;
  }

  /// @notice To be set after the auction ends
  function setBondStanding(BondStanding newStanding) external onlyOwner {
    emit BondStandingChange(currentBondStanding, newStanding);

    currentBondStanding = newStanding;
  }

  /// @notice Deposit collateral into bond contract
  /// @param amount the amount of collateral to deposit
  function collateralize(uint256 amount) external {
    // After a successul transfer, set collateral in bond contract
    IERC20(collateralAddress).transferFrom(msg.sender, address(this), amount);
    emit CollateralDeposited(msg.sender, amount);
  }

  /// @notice Withdraw collateral from bond contract
  /// @notice After a bond has matured AND the issuer has returned the principal, the issuer can redeem the collateral.
  /// @notice The amount of collateral available to be withdrawn depends on the collateralization ratio
  /// @param amount the amount of collateral to withdraw
  function uncollateralize(uint256 amount) external {
    // After a successul transfer, set collateral in bond contract
    emit CollateralWithdrawn(amount);
  }

  function mint(uint256 amount) external onlyIssuer {
    if (
      IERC20(collateralAddress).balanceOf(address(this)) <
      totalSupply() + amount
    ) {
      revert NotEnoughCollateral();
    }
    if (totalSupply() + amount > maxBondSupply) {
      revert BondSupplyExceeded();
    }
    _mint(msg.sender, amount);
  }

  /// @notice Bond holder can convert their bond to underlying collateral
  /// @notice The bond must be convertible and not repaid
  function convert(uint256 amount) external {
    // todo: separate collateral for conversion and for principal
    emit Converted(msg.sender, amount, amount);
  }

  /// @notice Issuer can deposit repayment into the bond contract to repay the principal
  function repay(uint256 amount) external onlyIssuer {
    if (
      false /*bond.isRepaid()*/
    ) {
      emit RepaymentInFull(msg.sender, amount);
    } else {
      emit RepaymentDeposited(msg.sender, amount);
    }
  }

  function redeem(uint256 bondShares) external onlyOwner nonReentrant {
    require(bondShares > 0, "invalid amount");
    require(block.timestamp >= maturityDate, "bond still immature");

    // check that the DAO has already paid back the bond, set from auction
    require(currentBondStanding == BondStanding.PAID, "bond not yet paid");

    burn(bondShares);

    // TODO: code needs added here that sends the investor their how much they are owed in paymentToken
    // this might be calling the auction contract with AuctionContract.redeem(msg.sender, bondShares * faceValue)

    // once all bonds are burned, then this can be set to redeemed
    if (totalSupply() == 0) {
      currentBondStanding = BondStanding.REDEEMED;
    }

    emit Redeem(msg.sender, bondShares);
  }

  // TODO: on auction fail or ending, burn remaining tokens feeAmount.mul(fillVolumeOfAuctioneerOrder).div(
  // TODO: on return of principle, check that principle == total supply of bond token
}
