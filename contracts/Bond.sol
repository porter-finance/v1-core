// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.9;

import {IBond} from "./interfaces/IBond.sol";

import {ERC20BurnableUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {FixedPointMathLib} from "./utils/FixedPointMathLib.sol";

/**
    @title Bond
    @author Porter Finance
    @notice A custom ERC20 token that can be used to issue bonds.
    @notice The contract handles issuance, payment, conversion, and redemption of bonds.
    @dev External calls to tokens used for collateral and payment are used throughout to transfer and check balances
        there is risk that these tokens are malicious and each one should be carefully inspected before being trusted. 
    @dev does not inherit from ERC20Upgradeable or Initializable since ERC20BurnableUpgradeable inherits from them
*/
contract Bond is
    IBond,
    AccessControlUpgradeable,
    ERC20BurnableUpgradeable,
    ReentrancyGuard
{
    using SafeERC20 for IERC20Metadata;

    using FixedPointMathLib for uint256;

    /// @inheritdoc IBond
    uint256 public maturityDate;

    /// @inheritdoc IBond
    address public paymentToken;

    /// @inheritdoc  IBond
    address public collateralToken;

    /// @inheritdoc  IBond
    uint256 public collateralRatio;

    /// @inheritdoc IBond
    uint256 public convertibleRatio;

    /**
        @notice this role permits the withdraw of collateral from the contract
        @dev this is assigned to owner in `initialize`
            the owner can assign other addresses with this role to enable their withdraw
    */
    bytes32 public constant WITHDRAW_ROLE = keccak256("WITHDRAW_ROLE");

    /// @dev used to confirm the bond has not yet matured
    modifier beforeMaturity() {
        if (isMature()) {
            revert BondPastMaturity();
        }
        _;
    }

    /// @dev used to confirm that the maturity date has passed or the bond has been repaid
    modifier afterMaturityOrPaid() {
        if (!isMature() && !isFullyPaid()) {
            revert BondNotYetMaturedOrPaid();
        }
        _;
    }

    /// @inheritdoc IBond
    function initialize(
        string memory bondName,
        string memory bondSymbol,
        address owner,
        uint256 _maturityDate,
        address _paymentToken,
        address _collateralToken,
        uint256 _collateralRatio,
        uint256 _convertibleRatio,
        uint256 maxSupply
    ) external initializer {
        __ERC20_init(bondName, bondSymbol);

        maturityDate = _maturityDate;
        paymentToken = _paymentToken;
        collateralToken = _collateralToken;
        collateralRatio = _collateralRatio;
        convertibleRatio = _convertibleRatio;
        _grantRole(DEFAULT_ADMIN_ROLE, owner);
        _grantRole(WITHDRAW_ROLE, owner);
        _mint(owner, maxSupply);
    }

    /// @inheritdoc IBond
    function convert(uint256 bonds) external nonReentrant beforeMaturity {
        if (bonds == 0) {
            revert ZeroAmount();
        }
        uint256 convertibleTokensToSend = previewConvertBeforeMaturity(bonds);
        if (convertibleTokensToSend == 0) {
            revert ZeroAmount();
        }

        burn(bonds);

        //  Reentrancy possibility: the bonds are already burnt - if there weren't enough bonds to burn, an error is thrown
        IERC20Metadata(collateralToken).safeTransfer(
            _msgSender(),
            convertibleTokensToSend
        );

        emit Convert(
            _msgSender(),
            collateralToken,
            bonds,
            convertibleTokensToSend
        );
    }

    /// @inheritdoc IBond
    function withdrawCollateral()
        external
        nonReentrant
        onlyRole(WITHDRAW_ROLE)
    {
        uint256 collateralToSend = previewWithdraw();

        IERC20Metadata(collateralToken).safeTransfer(
            _msgSender(),
            collateralToSend
        );

        emit CollateralWithdraw(
            _msgSender(),
            collateralToken,
            collateralToSend
        );
    }

    /// @inheritdoc IBond
    function pay(uint256 amount) external nonReentrant {
        if (isFullyPaid()) {
            revert PaymentMet();
        }
        if (amount == 0) {
            revert ZeroAmount();
        }

        IERC20Metadata(paymentToken).safeTransferFrom(
            _msgSender(),
            address(this),
            amount
        );
        emit Payment(_msgSender(), amount);
    }

    /// @inheritdoc IBond
    function redeem(uint256 bonds) external nonReentrant afterMaturityOrPaid {
        if (bonds == 0) {
            revert ZeroAmount();
        }
        // calculate amount before burning as the preview function uses totalSupply.
        (
            uint256 paymentTokensToSend,
            uint256 collateralTokensToSend
        ) = previewRedeemAtMaturity(bonds);

        if (paymentTokensToSend == 0 && collateralTokensToSend == 0) {
            revert ZeroAmount();
        }

        burn(bonds);

        // reentrancy possibility: the bonds are burnt here already - if there weren't enough bonds to burn, an error is thrown
        if (paymentTokensToSend != 0) {
            IERC20Metadata(paymentToken).safeTransfer(
                _msgSender(),
                paymentTokensToSend
            );
        }
        if (collateralTokensToSend != 0) {
            // reentrancy possibility: the bonds are burnt here already - if there weren't enough bonds to burn, an error is thrown
            IERC20Metadata(collateralToken).safeTransfer(
                _msgSender(),
                collateralTokensToSend
            );
        }
        emit Redeem(
            _msgSender(),
            paymentToken,
            collateralToken,
            bonds,
            paymentTokensToSend,
            collateralTokensToSend
        );
    }

    /// @inheritdoc IBond
    function sweep(IERC20Metadata token)
        external
        nonReentrant
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (
            address(token) == paymentToken || address(token) == collateralToken
        ) {
            revert SweepDisallowedForToken();
        }
        uint256 tokenBalance = token.balanceOf(address(this));
        token.safeTransfer(_msgSender(), tokenBalance);
        emit TokenSweep(_msgSender(), token, tokenBalance);
    }

    /// @inheritdoc IBond
    function previewConvertBeforeMaturity(uint256 bonds)
        public
        view
        returns (uint256)
    {
        return bonds.mulWadDown(convertibleRatio);
    }

    /// @inheritdoc IBond
    function previewWithdraw() public view returns (uint256) {
        uint256 tokensCoveredByPayment = paymentBalance();
        uint256 collateralTokensRequired = 0;
        if (tokensCoveredByPayment < totalSupply()) {
            collateralTokensRequired = (totalSupply() - tokensCoveredByPayment)
                .mulWadUp(collateralRatio);
        }

        uint256 convertibleTokensRequired = totalSupply().mulWadUp(
            convertibleRatio
        );

        uint256 totalRequiredCollateral;

        if (isFullyPaid()) {
            totalRequiredCollateral = isMature()
                ? 0 // Paid
                : convertibleTokensRequired; // PaidEarly
        } else {
            uint256 convertibleOrCollateral = convertibleTokensRequired >
                collateralTokensRequired
                ? convertibleTokensRequired
                : collateralTokensRequired;
            totalRequiredCollateral = isMature()
                ? collateralTokensRequired // Defaulted
                : convertibleOrCollateral; // Active
        }

        if (totalRequiredCollateral >= collateralBalance()) {
            return 0;
        }

        return collateralBalance() - totalRequiredCollateral;
    }

    /// @inheritdoc IBond
    function previewRedeemAtMaturity(uint256 bonds)
        public
        view
        returns (uint256, uint256)
    {
        uint256 paidAmount = isFullyPaid() ? totalSupply() : paymentBalance();
        uint256 paymentTokensToSend = bonds.mulDivDown(
            (paidAmount),
            totalSupply()
        );

        uint256 nonPaidAmount = totalSupply() - paidAmount;
        uint256 collateralTokensToSend = collateralRatio.mulWadDown(
            bonds.mulDivDown(nonPaidAmount, totalSupply())
        );

        return (paymentTokensToSend, collateralTokensToSend);
    }

    /// @inheritdoc IBond
    function paymentBalance() public view returns (uint256) {
        return IERC20Metadata(paymentToken).balanceOf(address(this));
    }

    /// @inheritdoc IBond
    function withdrawExcessPayment()
        external
        nonReentrant
        onlyRole(WITHDRAW_ROLE)
    {
        uint256 overpayment = amountOverPaid();
        if (overpayment <= 0) {
            revert NoPaymentToWithdraw();
        }
        IERC20Metadata(paymentToken).safeTransfer(_msgSender(), overpayment);
        emit ExcessPaymentWithdraw(_msgSender(), paymentToken, overpayment);
    }

    /// @inheritdoc  IBond
    function collateralBalance() public view returns (uint256) {
        return IERC20Metadata(collateralToken).balanceOf(address(this));
    }

    /// @inheritdoc IBond
    function isFullyPaid() public view returns (bool) {
        return paymentBalance() >= totalSupply();
    }

    /// @inheritdoc IBond
    function isMature() public view returns (bool) {
        return block.timestamp >= maturityDate;
    }

    /// @inheritdoc IBond
    function amountOwed() external view returns (uint256) {
        if (totalSupply() <= paymentBalance()) {
            return 0;
        }
        uint256 amountUnpaid = totalSupply() - paymentBalance();
        return (amountUnpaid);
    }

    /// @inheritdoc  IBond
    function amountOverPaid() public view returns (uint256 overpayment) {
        if (totalSupply() >= paymentBalance()) {
            return 0;
        }
        uint256 amountOverpaid = paymentBalance() - totalSupply();
        return (amountOverpaid);
    }

    function decimals() public view override returns (uint8) {
        return IERC20Metadata(paymentToken).decimals();
    }
}
