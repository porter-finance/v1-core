// SPDX-License-Identifier: AGPL
pragma solidity 0.8.9;
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title SimpleBond
/// @notice A custom ERC20 token that can be used to issue bonds.
/// @notice The contract handles issuance, conversion, and redemption of bonds.
/// @dev External calls to tokens used for collateral and borrowing are used throughout to transfer and check balances
contract SimpleBond is
  Initializable,
  ERC20Upgradeable,
  AccessControlUpgradeable,
  ERC20BurnableUpgradeable,
  ReentrancyGuard
{
  using SafeERC20 for IERC20;

  /// @notice this would go into default if maturityDate passes and the loan contract has not been paid back
  /// @notice to be set from the auction
  enum BondStanding {
    // the auction completed
    GOOD,
    // when maturity date passes and its unpaid
    DEFAULTED,
    // after bond borrowing token is repaid
    PAID,
    // when something goes wrong and this contract becomes nullified
    NULL
  }

  /// @notice emitted when a collateral is deposited for a bond
  /// @param collateralDepositor the address of the caller of the deposit
  /// @param collateralToken the address of the collateral
  /// @param amount the number of the tokens being deposited
  event CollateralDeposited(
    address indexed collateralDepositor,
    address indexed collateralToken,
    uint256 amount
  );

  /// @notice emitted when a bond's issuer withdraws collateral
  /// @param collateralWithdrawer the address withdrawing collateral
  /// @param collateralToken the address of the ERC20 token
  /// @param amount the number of the tokens withdrawn
  event CollateralWithdrawn(
    address indexed collateralWithdrawer,
    address indexed collateralToken,
    uint256 amount
  );

  /// @notice emitted when a portion of the bond's principal is paid back
  /// @param repaymentDepositor the address depositing repayment
  /// @param amount the amount of repayment deposited
  event RepaymentDeposited(address indexed repaymentDepositor, uint256 amount);

  /// @notice emitted when all of the bond's principal is paid back
  /// @param repaymentDepositor the address depositing repayment
  /// @param amount the amount deposited to fully repay the bond
  event RepaymentInFull(address indexed repaymentDepositor, uint256 amount);

  /// @notice emitted when bond tokens are converted by a borrower
  /// @param convertorAddress the address converting their tokens
  /// @param collateralToken the address of the collateral received
  /// @param amountOfBondsConverted the number of burnt bonds
  /// @param amountOfCollateralReceived the number of collateral tokens received
  event Converted(
    address indexed convertorAddress,
    address indexed collateralToken,
    uint256 amountOfBondsConverted,
    uint256 amountOfCollateralReceived
  );

  /// @notice emitted when a bond is redeemed
  event Redeem(
    address indexed receiver,
    address indexed borrowingToken,
    address indexed collateralToken,
    uint256 amountOfBondsRedeemed,
    uint256 amountOfBorrowTokensReceived,
    uint256 amountOfCollateralReceived
  );

  /// @notice emitted when bonds are minted
  event Mint(address indexed receiver, uint256 amountOfBondsMinted);

  // modifiers
  error BondPastMaturity();
  error BondNotYetMatured();

  // Initialization
  error InvalidMaturityDate();
  error BackingRatioLessThanConvertibilityRatio();

  // Minting
  error BondSupplyExceeded();

  // Repayment
  error RepaymentMet();

  // Sweep
  error SweepDisallowedForToken();

  // Helper
  error ZeroAmount();
  error TokenOverflow();

  /// @dev used to confirm the bond has matured
  modifier pastMaturity() {
    if (block.timestamp < maturityDate) {
      revert BondNotYetMatured();
    }
    _;
  }

  /// @dev used to confirm the bond has not yet matured
  modifier notPastMaturity() {
    if (block.timestamp >= maturityDate) {
      revert BondPastMaturity();
    }
    _;
  }

  uint256 internal constant ONE = 1e18;

  /// @notice A date in the future set at bond creation at which the bond will mature.
  /// @notice Before this date, a bond token can be converted if convertible, but cannot be redeemed.
  /// @notice After this date, a bond token can be redeemed for the borrowing asset.
  uint256 public maturityDate;

  /// @notice The address of the ERC20 token this bond will be redeemable for at maturity
  address public borrowingToken;

  /// @notice this flag is set after the issuer has paid back the full amount of borrowing token needed to cover the outstanding bonds
  bool internal isRepaid;

  /// @notice the addresses of the ERC20 token backing the bond which can be converted into before maturity or, in the case of a default, redeemable for at maturity
  address public collateralToken;

  /// @notice the ratio of ERC20 tokens backing the bonds
  uint256 public backingRatio;

  /// @notice the ratio of ERC20 tokens the bonds will convert into before maturity
  /// @dev if this ratio is 0, the bond is not convertible.
  uint256 public convertibilityRatio;

  /// @notice the role ID for withdrawCollateral
  bytes32 public constant WITHDRAW_ROLE = keccak256("WITHDRAW_ROLE");

  /// @notice this mapping keeps track of the total collateral in this contract. this amount is used when determining the portion of collateral to return to the bond holders in event of a default
  uint256 public totalCollateral;

  /// @notice the max amount of bonds able to be minted
  uint256 public maxSupply;

  function state() external view returns (BondStanding newStanding) {
    if (block.timestamp < maturityDate && !isRepaid && totalSupply() > 0) {
      newStanding = BondStanding.GOOD;
    } else if (block.timestamp >= maturityDate && !isRepaid) {
      newStanding = BondStanding.DEFAULTED;
    } else if (isRepaid) {
      newStanding = BondStanding.PAID;
    } else {
      newStanding = BondStanding.NULL;
    }
  }

  /// @notice this function is called one time during initial bond creation and sets up the configuration for the bond
  /// @dev New bond contract deployed via clone
  /// @param _name passed into the ERC20 token
  /// @param _symbol passed into the ERC20 token
  /// @param _owner ownership of this contract transferred to this address
  /// @param _maturityDate the timestamp at which the bond will mature
  /// @param _borrowingToken the ERC20 token address the non-defaulted bond will be redeemable for at maturity
  /// @param _collateralToken the ERC20 token address for the bond
  /// @param _backingRatio the amount of tokens per bond needed
  /// @param _convertibilityRatio the amount of tokens per bond a convertible bond can be converted for
  function initialize(
    string memory _name,
    string memory _symbol,
    address _owner,
    uint256 _maturityDate,
    address _borrowingToken,
    address _collateralToken,
    uint256 _backingRatio,
    uint256 _convertibilityRatio,
    uint256 _maxSupply
  ) external initializer {
    if (_backingRatio < _convertibilityRatio) {
      revert BackingRatioLessThanConvertibilityRatio();
    }
    if (
      _maturityDate <= block.timestamp ||
      _maturityDate > block.timestamp + 3650 days
    ) {
      revert InvalidMaturityDate();
    }

    __ERC20_init(_name, _symbol);
    __ERC20Burnable_init();

    maturityDate = _maturityDate;
    borrowingToken = _borrowingToken;
    collateralToken = _collateralToken;
    backingRatio = _backingRatio;
    convertibilityRatio = _convertibilityRatio;
    maxSupply = _maxSupply;

    _grantRole(DEFAULT_ADMIN_ROLE, _owner);
    _grantRole(WITHDRAW_ROLE, _owner);
  }

  /// @notice Withdraw collateral from bond contract
  /// @notice The amount of collateral available to be withdrawn depends on the backing ratio
  function withdrawCollateral() external nonReentrant onlyRole(WITHDRAW_ROLE) {
    uint256 collateralToSend = previewWithdraw();

    totalCollateral -= collateralToSend;

    // @audit-ok reentrancy possibility: at the point of this transfer, the caller could attempt to reenter, but the totalCollateral updates beofre reaching this point, and is used in the previewWithdraw method to calculate the amount allowed to transfer out of the contract
    IERC20(collateralToken).safeTransfer(_msgSender(), collateralToSend);

    emit CollateralWithdrawn(_msgSender(), collateralToken, collateralToSend);
  }

  /// @notice mints the amount of specified bonds by transferring in collateral
  /// @dev CollateralDeposited + Mint events are both emitted. bonds to mint is bounded by maxSupply
  /// @param bonds the amount of bonds to mint
  function mint(uint256 bonds)
    external
    onlyRole(WITHDRAW_ROLE)
    nonReentrant
    notPastMaturity
  {
    if (bonds > maxSupply - totalSupply()) {
      revert BondSupplyExceeded();
    }

    uint256 collateralToDeposit = previewMint(bonds);

    if (collateralToDeposit == 0) {
      revert ZeroAmount();
    }

    // @audit-ok reentrancy possibility: totalCollateral is updated after transfer
    uint256 collateralDeposited = safeTransferIn(
      IERC20(collateralToken),
      _msgSender(),
      collateralToDeposit
    );

    totalCollateral += collateralDeposited;

    emit CollateralDeposited(
      _msgSender(),
      collateralToken,
      collateralDeposited
    );

    _mint(_msgSender(), bonds);

    emit Mint(_msgSender(), bonds);
  }

  /// @notice Bond holder can convert their bond to underlying collateral
  /// @notice The bond must be convertible and not past maturity
  /// @param bonds the number of bonds which will be burnt and converted into the collateral at the convertibility ratio
  function convert(uint256 bonds) external notPastMaturity nonReentrant {
    uint256 collateralToSend = previewConvert(bonds);
    if (collateralToSend == 0) {
      revert ZeroAmount();
    }

    burn(bonds);

    // @audit-ok Reentrancy possibility: the bonds are already burnt - if there weren't enough bonds to burn, an error is thrown
    IERC20(collateralToken).safeTransfer(_msgSender(), collateralToSend);

    totalCollateral -= collateralToSend;

    emit Converted(_msgSender(), collateralToken, bonds, collateralToSend);
  }

  /// @notice allows the issuer to repay the bond by depositing borrowing token
  /// @dev emits RepaymentInFull if the full balance has been repaid, RepaymentDeposited otherwise
  /// @dev the lower of outstandingAmount and amount is chosen to prevent overpayment
  /// @param amount the number of borrowing tokens to repay
  function repay(uint256 amount) external nonReentrant notPastMaturity {
    if (isRepaid) {
      revert RepaymentMet();
    }
    if (amount == 0) {
      revert ZeroAmount();
    }

    // @audit-ok Re-entrancy possibility: this is a transfer into the contract - isRepaid is updated after transfer
    uint256 amountRepaid = safeTransferIn(
      IERC20(borrowingToken),
      _msgSender(),
      amount
    );
    if (
      // @audit-ok Re-entrancy possibility: isRepaid is updated after balance check
      IERC20(borrowingToken).balanceOf(address(this)) >= totalSupply()
    ) {
      isRepaid = true;
      emit RepaymentInFull(_msgSender(), amountRepaid);
    } else {
      emit RepaymentDeposited(_msgSender(), amountRepaid);
    }
  }

  /// @notice this function burns bonds in return for the token borrowed against the bond
  /// @param bonds the amount of bonds to redeem and burn
  function redeem(uint256 bonds) external nonReentrant pastMaturity {
    if (bonds == 0) {
      revert ZeroAmount();
    }

    // calculate amount before burning as the preview function uses totalSupply.
    (
      uint256 borrowingTokensToSend,
      uint256 collateralTokensToSend
    ) = previewRedeem(bonds);

    totalCollateral -= collateralTokensToSend;

    burn(bonds);

    // @audit-ok reentrancy possibility: the bonds are burnt here already - if there weren't enough bonds to burn, an error is thrown
    if (borrowingTokensToSend > 0) {
      IERC20(borrowingToken).safeTransfer(_msgSender(), borrowingTokensToSend);
    }
    if (collateralTokensToSend > 0) {
      // @audit-ok reentrancy possibility: the bonds are burnt here already - if there weren't enough bonds to burn, an error is thrown
      IERC20(collateralToken).safeTransfer(
        _msgSender(),
        collateralTokensToSend
      );
    }
    emit Redeem(
      _msgSender(),
      borrowingToken,
      collateralToken,
      bonds,
      borrowingTokensToSend,
      collateralTokensToSend
    );
  }

  /// @notice sends tokens to the issuer that were sent to this contract
  /// @dev collateral, borrowing, and the bond itself cannot be swept
  /// @param token send the entire token balance of this address to the owner
  function sweep(IERC20 token)
    external
    nonReentrant
    onlyRole(DEFAULT_ADMIN_ROLE)
  {
    if (
      address(token) == borrowingToken ||
      address(token) == address(this) ||
      address(token) == collateralToken
    ) {
      revert SweepDisallowedForToken();
    }
    token.transfer(msg.sender, token.balanceOf(address(this)));
  }

  /// @notice this function returns the balance of this contract before and after a transfer into it
  /// @dev safeTransferFrom is used to revert on any non-success return from the transfer
  /// @dev the actual delta of tokens is returned to keep accurate balance in the case where the token has a fee
  /// @param token the ERC20 token being transferred from
  /// @param from the sender
  /// @param value the total number of tokens being transferred
  function safeTransferIn(
    IERC20 token,
    address from,
    uint256 value
  ) private returns (uint256) {
    uint256 balanceBefore = token.balanceOf(address(this));
    token.safeTransferFrom(from, address(this), value);

    uint256 balanceAfter = token.balanceOf(address(this));
    if (balanceAfter < balanceBefore) {
      revert TokenOverflow();
    }
    return balanceAfter - balanceBefore;
  }

  function previewMint(uint256 bonds) public view returns (uint256) {
    return (bonds * backingRatio) / ONE;
  }

  function previewConvert(uint256 bonds) public view returns (uint256) {
    return (bonds * convertibilityRatio) / ONE;
  }

  function previewWithdraw() public view returns (uint256) {
    uint256 tokensRepaid = IERC20(borrowingToken).balanceOf(address(this));
    uint256 tokensNotCoveredByRepayment = tokensRepaid > totalSupply()
      ? 0
      : totalSupply() - tokensRepaid;
    // bond is not paid and mature
    // to cover backing ratio = total supply (-bonds burned) * backing ratio
    // to cover convertibility = 0 (bonds cannot be converted)
    // bond is not paid and not mature:
    // to cover backing ratio = total supply (-bonds burned) * backing ratio
    // to cover convertibility = total supply (-bonds burned) * convertibility ratio
    // bond is paid and not mature
    // to cover backing ratio = 0 (bonds need not be backed by collateral)
    // to cover convertibility ratio = total supply (- bonds burned) * collateral ratio
    // bond is paid and mature
    // to cover backing ratio = 0
    // to cover convertibility ratio = 0
    // All outstanding bonds must be covered by the convertibility ratio
    uint256 maxCollateralRequiredForConvertibility = (totalSupply() *
      convertibilityRatio) / ONE;
    // The outstanding bonds already repaid need not be supported by the "backing" collateral
    uint256 maxCollateralRequiredForBacking = (tokensNotCoveredByRepayment *
      backingRatio) / ONE;
    uint256 totalRequiredCollateral;
    if (!isRepaid) {
      totalRequiredCollateral = maxCollateralRequiredForConvertibility >
        maxCollateralRequiredForBacking
        ? maxCollateralRequiredForConvertibility
        : maxCollateralRequiredForBacking;
    } else if (maturityDate < block.timestamp) {
      totalRequiredCollateral = maxCollateralRequiredForConvertibility;
    } else {
      // @audit-info redundant but explicit
      totalRequiredCollateral = 0;
    }

    if (totalRequiredCollateral >= totalCollateral) {
      return 0;
    }

    return totalCollateral - totalRequiredCollateral;
  }

  function previewRedeem(uint256 bonds)
    public
    view
    returns (uint256 borrowingTokenToSend, uint256 collateralTokenToSend)
  {
    if (block.timestamp < maturityDate) {
      return (0, 0);
    }
    if (isRepaid) {
      return (bonds, 0);
    } else {
      uint256 borrowingTokensInContract = IERC20(borrowingToken).balanceOf(
        address(this)
      );

      // A defaulted bond is redeemable for its portion of borrowing tokens posibly deposited and the portion of collateral in the contract.
      return (
        ((bonds * borrowingTokensInContract) / (totalSupply())),
        ((bonds * totalCollateral) / (totalSupply()))
      );
    }
  }
}
