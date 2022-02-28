// SPDX-License-Identifier: AGPL
pragma solidity 0.8.9;
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/// @title SimpleBond
/// @notice A custom ERC20 token that can be used to issue bonds.
/// @notice The contract handles issuance, conversion, and redemption of bonds.
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

  /// @notice emitted when a collateral is deposited for a bond
  /// @param collateralDepositor the address of the caller of the deposit
  /// @param amount the number of the tokens being deposited
  event CollateralDeposited(
    address indexed collateralDepositor,
    uint256 amount
  );

  /// @notice emitted when a bond's issuer withdraws collateral
  /// @param amount the number of the tokens withdrawn
  event CollateralWithdrawn(
    address indexed collateralWithdrawer,
    uint256 amount
  );

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

  /// @notice emitted when a bond is redeemed by a borrower
  event Redeem(address receiver, uint256 amount);

  /// @notice emitted when a bond is refinanced by a lender
  event Refinance(address refinancer, uint256 totalShares);

  /// @notice emitted when a bond changes state
  event BondStandingChange(BondStanding oldStanding, BondStanding newStanding);

  // modifiers
  error OnlyIssuerOfBondMayCallThisFunction();
  error BondPastMaturity();
  error BondNotYetMatured();
  error BondNotYetRepaid();
  error BondNotYetRedeemed();
  error BondNotDefaulted();

  // Creation
  error InvalidMaturityDate();

  // Minting
  error InusfficientCollateralToCoverTokenSupply();
  error BondSupplyExceeded();
  error NoMintAfterIssuance();

  // Collateralization
  error CollateralTransferFailure();
  error ZeroCollateralizationAmount();

  // Uncollateralization
  error CollateralInContractInsufficientToCoverWithdraw();
  error InsufficientCollateralReservedForConvertibility();

  // Conversion
  error NotConvertible();

  // Repayment
  error RepaymentMet();

  // Redemption
  error ZeroRedemptionAmount();

  // Sweep
  error SweepDisallowedForToken();

  modifier onlyIssuer() {
    if (issuer != msg.sender) {
      revert OnlyIssuerOfBondMayCallThisFunction();
    }
    _;
  }

  modifier pastMaturity() {
    if (!isPastMaturity()) {
      revert BondNotYetMatured();
    }
    _;
  }

  modifier notPastMaturity() {
    if (isPastMaturity()) {
      revert BondPastMaturity();
    }
    _;
  }

  modifier repaid() {
    if (!isRepaid()) {
      revert BondNotYetRepaid();
    }
    _;
  }

  modifier redeemed() {
    if (!isRedeemed()) {
      revert BondNotYetRedeemed();
    }
    _;
  }

  modifier defaulted() {
    if (!isDefaulted()) {
      revert BondNotDefaulted();
    }
    _;
  }

  /// @notice this date is when the DAO must have repaid its debt
  /// @notice when bondholders can redeem their bonds
  address public issuer;
  uint256 public maturityDate;
  uint256 public maxBondSupply;
  address public collateralAddress;
  uint256 public collateralizationRatio;
  address public borrowingAddress;
  bool public isConvertible;
  uint256 public convertibilityRatio;
  uint256 public totalAssets;
  BondStanding public currentBondStanding;

  bool private _isRepaid;

  using Strings for uint256;

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() initializer {}

  function updateBondState() public returns (BondStanding newStanding) {
    if (isGood()) {
      newStanding = BondStanding.GOOD;
    } else if (isDefaulted()) {
      newStanding = BondStanding.DEFAULTED;
    } else if (isRepaid()) {
      newStanding = BondStanding.PAID;
    } else if (isRedeemed()) {
      newStanding = BondStanding.REDEEMED;
    } else {
      newStanding = BondStanding.NULL;
    }
    if (newStanding != currentBondStanding) {
      emit BondStandingChange(currentBondStanding, newStanding);
      currentBondStanding = newStanding;
    }
  }

  function isGood() private view returns (bool) {
    return !isDefaulted() && !isRedeemed();
  }

  function isRepaid() private view returns (bool) {
    return _isRepaid;
  }

  function isDefaulted() private view returns (bool) {
    return isPastMaturity() && !isRepaid();
  }

  function isRedeemed() private view returns (bool) {
    return totalSupply() == 0;
  }

  function isPastMaturity() private view returns (bool) {
    return block.timestamp >= maturityDate;
  }

  /// @dev New bond contract will be deployed before each auction
  /// @dev The Auction contract will be the owner
  /// @param _maxBondSupply Total number of bonds being issued - this is determined by auction config
  function initialize(
    address _owner,
    address _issuer,
    uint256 _maturityDate,
    uint256 _maxBondSupply,
    address _collateralAddress,
    uint256 _collateralizationRatio,
    address _borrowingAddress,
    bool _isConvertible,
    uint256 _convertibilityRatio
  ) public initializer {
    // this timestamp is a date in 2020, which basically is here to confirm
    // the date provided is greater than 0 and a valid timestamp
    if (_maturityDate < 1580752251) {
      revert InvalidMaturityDate();
    }

    // This mints bonds based on the config given in the auction contract and
    // sends them to the auction contract,
    __ERC20_init("SimpleBond", "LUG");
    __ERC20Burnable_init();
    __Ownable_init();

    maturityDate = _maturityDate;
    collateralAddress = _collateralAddress;
    collateralizationRatio = _collateralizationRatio;
    isConvertible = _isConvertible;
    convertibilityRatio = _convertibilityRatio;
    borrowingAddress = _borrowingAddress;
    issuer = _issuer;
    maxBondSupply = _maxBondSupply;

    _transferOwnership(_owner);
  }

  // /// @notice To be set after the auction ends
  // function setBondStanding(BondStanding newStanding) external onlyOwner {
  //   emit BondStandingChange(currentBondStanding, newStanding);

  //   currentBondStanding = newStanding;
  // }

  /// @notice Deposit collateral into bond contract
  /// @param amount the amount of collateral to deposit
  function collateralize(uint256 amount) external nonReentrant notPastMaturity {
    // After a successul transfer, set collateral in bond contract
    if (amount == 0) {
      revert ZeroCollateralizationAmount();
    }
    !IERC20(collateralAddress).transferFrom(msg.sender, address(this), amount);
    totalAssets += amount;
    emit CollateralDeposited(msg.sender, amount);
  }

  function uncollateralize() external onlyIssuer nonReentrant {
    _uncollateralize();
  }

  /// @notice Withdraw collateral from bond contract
  /// @notice After a bond has matured AND the issuer has returned the principal, the issuer can redeem the collateral.
  /// @notice The amount of collateral available to be withdrawn depends on the collateralization ratio
  function _uncollateralize() private onlyIssuer {
    // start with max collateral required to cover the amount of bonds
    uint256 totalRequiredCollateral = totalSupply() * collateralizationRatio;
    if (_isRepaid && isConvertible) {
      totalRequiredCollateral = totalSupply() * convertibilityRatio;
    } else if (_isRepaid) {
      totalRequiredCollateral = 0;
    }
    uint256 currentCollateral = IERC20(collateralAddress).balanceOf(
      address(this)
    );
    if (totalRequiredCollateral >= currentCollateral) {
      revert CollateralInContractInsufficientToCoverWithdraw();
    }
    uint256 withdrawableCollateral = currentCollateral -
      totalRequiredCollateral;
    totalAssets -= withdrawableCollateral;
    IERC20(collateralAddress).transfer(msg.sender, withdrawableCollateral);
    emit CollateralWithdrawn(msg.sender, withdrawableCollateral);
  }

  /// @dev nonReentrant needed as double minting would be possible otherwise
  function mint(uint256 tokensToMint) external onlyIssuer nonReentrant {
    uint256 outstandingBonds = totalSupply() - balanceOf(msg.sender);
    if (outstandingBonds > 0) {
      revert NoMintAfterIssuance();
    }

    uint256 currentRequiredCollateralAmount = (totalSupply() *
      collateralizationRatio) / 100;
    uint256 newRequiredCollateral = (tokensToMint * collateralizationRatio) /
      100;
    uint256 totalRequiredCollateral = currentRequiredCollateralAmount +
      newRequiredCollateral;
    if (
      IERC20(collateralAddress).balanceOf(address(this)) <
      totalRequiredCollateral
    ) {
      revert InusfficientCollateralToCoverTokenSupply();
    }

    if (totalSupply() + tokensToMint > maxBondSupply) {
      revert BondSupplyExceeded();
    }

    _mint(msg.sender, tokensToMint);
  }

  /// @notice Bond holder can convert their bond to underlying collateral
  /// @notice The bond must be convertible and not repaid
  function convert(uint256 amountOfBondsToConvert)
    external
    notPastMaturity
    nonReentrant
  {
    if (!isConvertible) {
      revert NotConvertible();
    }
    uint256 amountOfBondsConverted = amountOfBondsToConvert;
    uint256 amountOfCollateralReceived = (amountOfBondsToConvert *
      convertibilityRatio) / 100;
    burn(amountOfBondsToConvert);

    totalAssets -= amountOfCollateralReceived;
    IERC20(collateralAddress).transfer(msg.sender, amountOfCollateralReceived);
    emit Converted(
      msg.sender,
      amountOfBondsConverted,
      amountOfCollateralReceived
    );
  }

  function repay(uint256 amount) external notPastMaturity nonReentrant {
    _repay(amount);
  }

  function _repay(uint256 amount) private notPastMaturity {
    if (_isRepaid) {
      revert RepaymentMet();
    }
    IERC20(borrowingAddress).transferFrom(msg.sender, address(this), amount);
    if (IERC20(borrowingAddress).balanceOf(address(this)) >= totalSupply()) {
      _isRepaid = true;
      updateBondState();
      emit RepaymentInFull(msg.sender, amount);
    } else {
      emit RepaymentDeposited(msg.sender, amount);
    }
  }

  function redeem(uint256 bondShares)
    external
    nonReentrant
    pastMaturity
    repaid
  {
    if (bondShares == 0) {
      revert ZeroRedemptionAmount();
    }

    burn(bondShares);

    IERC20(borrowingAddress).transfer(msg.sender, bondShares);

    emit Redeem(msg.sender, bondShares);
  }

  function redeemDefaulted(uint256 bondShares)
    external
    nonReentrant
    pastMaturity
    defaulted
  {
    if (bondShares == 0) {
      revert ZeroRedemptionAmount();
    }

    uint256 collateralToWithdraw = (bondShares * totalAssets) / totalSupply();
    burn(bondShares);
    totalAssets -= collateralToWithdraw;
    IERC20(collateralAddress).transfer(msg.sender, collateralToWithdraw);

    emit Redeem(msg.sender, bondShares);
  }

  /// @notice atomic operation repaying and removing collateral
  function refinance() external onlyIssuer nonReentrant {
    burn(balanceOf(msg.sender));
    uint256 coveredBonds = IERC20(borrowingAddress).balanceOf(address(this));
    if (coveredBonds < totalSupply()) {
      _repay(totalSupply() - coveredBonds);
    }
    _uncollateralize();

    emit Refinance(msg.sender, totalSupply());
  }

  function sweep(IERC20 token) external nonReentrant {
    if (
      address(token) == collateralAddress ||
      address(token) == borrowingAddress ||
      address(token) == address(this)
    ) {
      revert SweepDisallowedForToken();
    }
    token.transfer(owner(), token.balanceOf(address(this)));
  }
}
