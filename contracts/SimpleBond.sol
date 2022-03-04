// SPDX-License-Identifier: AGPL
pragma solidity 0.8.9;
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "hardhat/console.sol";

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
    using SafeERC20 for IERC20;

    /// @notice this would go into default if maturityDate passes and the loan contract has not been paid back
    /// @notice to be set from the auction
    enum BondStanding {
        // the auction completed
        GOOD,
        // when maturity date passes and its unpaid
        DEFAULTED,
        // after DAO pays
        PAID,
        // when something goes wrong and this contract becomes nullified
        NULL
    }

    /// @notice emitted when a collateral is deposited for a bond
    /// @param collateralDepositor the address of the caller of the deposit
    /// @param collateralAddress the address of the collateral
    /// @param amount the number of the tokens being deposited
    event CollateralDeposited(
        address indexed collateralDepositor,
        address indexed collateralAddress,
        uint256 amount
    );

    /// @notice emitted when a bond's issuer withdraws collateral
    /// @param amount the number of the tokens withdrawn
    event CollateralWithdrawn(
        address indexed collateralWithdrawer,
        address indexed collateralAddress,
        uint256 amount
    );

    /// @notice emitted when a portion of the bond's principal is paid back
    event RepaymentDeposited(
        address indexed repaymentDepositor,
        uint256 amount
    );

    /// @notice emitted when all of the bond's principal is paid back
    event RepaymentInFull(address indexed repaymentDepositor, uint256 amount);

    /// @notice emitted when bond tokens are converted by a borrower
    event Converted(
        address indexed convertorAddress,
        address indexed collateralAddress,
        uint256 amountOfBondsConverted,
        uint256 amountOfCollateralReceived
    );

    /// @notice emitted when a bond is redeemed by a borrower
    event Redeem(
        address indexed receiver,
        address indexed borrowingAddress,
        uint256 amountOfBondsRedeemed,
        uint256 amountOfTokensReceived
    );

    /// @notice emitted when a bond is redeemed by a borrower
    event RedeemDefaulted(
        address indexed receiver,
        address indexed collateralAddress,
        uint256 amountOfBondsRedeemed,
        uint256 amountOfCollateralReceived
    );

    /// @notice emitted when a bond is refinanced by a lender
    event Refinance(address refinancer, uint256 totalShares);

    /// @notice emitted when a bond changes state
    event BondStandingChange(
        BondStanding oldStanding,
        BondStanding newStanding
    );

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
    error ZeroMintAmount();

    // Collateralization
    error ZeroCollateralizationAmount();

    // Uncollateralization
    error CollateralInContractInsufficientToCoverWithdraw();

    // Conversion
    error NotConvertible();

    // Repayment
    error RepaymentMet();

    // Redemption
    error ZeroRedemptionAmount();

    // Sweep
    error SweepDisallowedForToken();

    // Helper
    error TokenOverflow();

    modifier onlyIssuer() {
        if (issuer != _msgSender()) {
            revert OnlyIssuerOfBondMayCallThisFunction();
        }
        _;
    }

    modifier pastMaturity() {
        if (block.timestamp < maturityDate) {
            revert BondNotYetMatured();
        }
        _;
    }

    modifier notPastMaturity() {
        if (block.timestamp >= maturityDate) {
            revert BondPastMaturity();
        }
        _;
    }

    modifier repaid() {
        if (!_isRepaid) {
            revert BondNotYetRepaid();
        }
        _;
    }

    modifier redeemed() {
        if (totalSupply() > 0) {
            revert BondNotYetRedeemed();
        }
        _;
    }

    modifier defaulted() {
        if (block.timestamp < maturityDate) {
            revert BondNotDefaulted();
        }
        _;
    }

    address public issuer;
    /// @notice this date is when the DAO must have repaid its debt
    /// @notice when bondholders can redeem their bonds
    uint256 public maturityDate;
    address public borrowingAddress;
    address[] public collateralAddresses;
    uint256[] public collateralRatios;
    uint256[] public convertibilityRatios;
    BondStanding public currentBondStanding;

    bool private _isRepaid;

    mapping(address => uint256) public totalCollateral;

    function state() public view returns (BondStanding newStanding) {
        if (
            block.timestamp >= maturityDate && !_isRepaid && totalSupply() > 0
        ) {
            newStanding = BondStanding.GOOD;
        } else if (block.timestamp >= maturityDate && !_isRepaid) {
            newStanding = BondStanding.DEFAULTED;
        } else if (_isRepaid) {
            newStanding = BondStanding.PAID;
        } else {
            newStanding = BondStanding.NULL;
        }
    }

    /// @dev New bond contract deployed via clone
    function initialize(
        string memory _name,
        string memory _symbol,
        address _issuer,
        uint256 _maturityDate,
        address _borrowingAddress,
        address[] memory _collateralAddresses,
        uint256[] memory _collateralRatios,
        uint256[] memory _convertibilityRatios
    ) external initializer {
        // this timestamp is a date in 2020, which basically is here to confirm
        // the date provided is greater than 0 and a valid timestamp
        if (_maturityDate < 1580752251) {
            revert InvalidMaturityDate();
        }

        __ERC20_init(_name, _symbol);
        __ERC20Burnable_init();
        __Ownable_init();

        issuer = _issuer;
        maturityDate = _maturityDate;
        borrowingAddress = _borrowingAddress;
        collateralAddresses = _collateralAddresses;
        collateralRatios = _collateralRatios;
        convertibilityRatios = _convertibilityRatios;

        _transferOwnership(_issuer);
    }

    /// @notice Deposit collateral into bond contract
    /// @param amounts the amount of collateral to deposit
    function depositCollateral(
        address[] memory _collateralAddresses,
        uint256[] memory amounts
    ) external nonReentrant notPastMaturity {
        for (uint256 j = 0; j < _collateralAddresses.length; j++) {
            for (uint256 k = 0; k < collateralAddresses.length; k++) {
                if (_collateralAddresses[j] == collateralAddresses[k]) {
                    IERC20 collateralToken = IERC20(collateralAddresses[j]);
                    uint256 amount = amounts[j];

                    if (amount == 0) {
                        revert ZeroCollateralizationAmount();
                    }
                    uint256 balanceBefore = collateralToken.balanceOf(
                        address(this)
                    );
                    collateralToken.safeTransferFrom(
                        _msgSender(),
                        address(this),
                        amounts[j]
                    );
                    uint256 balanceAfter = collateralToken.balanceOf(
                        address(this)
                    );
                    if (balanceAfter <= balanceBefore) {
                        revert ZeroCollateralizationAmount();
                    }
                    uint256 balanceChange = balanceAfter - balanceBefore;
                    totalCollateral[address(collateralToken)] += balanceChange;
                    emit CollateralDeposited(
                        _msgSender(),
                        address(collateralToken),
                        balanceChange
                    );
                }
            }
        }
    }

    /// @notice Withdraw collateral from bond contract
    /// @notice The amount of collateral available to be withdrawn depends on the collateralization ratio(s)
    function withdrawCollateral(
        address[] memory _collateralAddresses,
        uint256[] memory _amounts
    ) public nonReentrant onlyIssuer {
        for (uint256 j = 0; j < _collateralAddresses.length; j++) {
            for (uint256 k = 0; k < collateralAddresses.length; k++) {
                if (_collateralAddresses[j] == collateralAddresses[k]) {
                    address collateralAddress = collateralAddresses[k];
                    uint256 collateralRatio = collateralRatios[k];
                    uint256 convertibilityRatio = convertibilityRatios[k];
                    uint256 tokensNeededToCoverCollateralRatio = totalSupply() *
                        collateralRatio;
                    uint256 tokensNeededToCoverConvertibilityRatio = totalSupply() *
                            convertibilityRatio;
                    uint256 totalRequiredCollateral = tokensNeededToCoverCollateralRatio +
                            tokensNeededToCoverConvertibilityRatio;
                    if (
                        _isRepaid && tokensNeededToCoverConvertibilityRatio > 0
                    ) {
                        totalRequiredCollateral = tokensNeededToCoverConvertibilityRatio;
                    } else if (_isRepaid) {
                        totalRequiredCollateral = 0;
                    }
                    uint256 balanceBefore = IERC20(collateralAddress).balanceOf(
                        address(this)
                    );
                    if (totalRequiredCollateral >= balanceBefore) {
                        revert CollateralInContractInsufficientToCoverWithdraw();
                    }
                    uint256 withdrawableCollateral = balanceBefore -
                        totalRequiredCollateral;
                    if (_amounts[j] > withdrawableCollateral) {
                        revert CollateralInContractInsufficientToCoverWithdraw();
                    }
                    IERC20(collateralAddress).safeTransfer(
                        _msgSender(),
                        _amounts[j]
                    );
                    uint256 balanceAfter = IERC20(collateralAddress).balanceOf(
                        address(this)
                    );
                    totalCollateral[collateralAddress] -=
                        balanceBefore -
                        balanceAfter;
                    emit CollateralWithdrawn(
                        _msgSender(),
                        collateralAddress,
                        balanceBefore - balanceAfter
                    );
                }
            }
        }
    }

    /// @notice mints the maximum amount of tokens restricted by the collateral(s)
    /// @dev nonReentrant needed as double minting would be possible otherwise
    function mint() external onlyIssuer nonReentrant {
        if (totalSupply() > 0) {
            revert NoMintAfterIssuance();
        }
        uint256 tokensToMint = 0;
        for (uint256 i = 0; i < collateralAddresses.length; i++) {
            IERC20 collateralToken = IERC20(collateralAddresses[i]);
            uint256 collateralDeposited = collateralToken.balanceOf(
                address(this)
            );
            uint256 collateralRatio = collateralRatios[i];
            uint256 convertibilityRatio = convertibilityRatios[i];
            // Each collateral type restricts the amount of mintable tokens by the ratio required to satisfy "collateralized"
            // 100 deposited collateral with a 1:5 ratio would allow for 100/5 tokens minted for THIS collateral type
            uint256 tokensCanMint = 0;
            if (
                convertibilityRatio == 0 ||
                convertibilityRatio < collateralRatio
            ) {
                tokensCanMint = collateralDeposited / collateralRatio;
            } else {
                tokensCanMint = collateralDeposited / convertibilityRatio;
            }

            // First collateral sets the minimum mint amount after each loop,
            // tokensToMint can decrease if there is not enough collateral of another type
            if (tokensToMint == 0 || tokensToMint > tokensCanMint) {
                tokensToMint = tokensCanMint;
            }
        }
        // At this point, tokensToMint is the maximum possible to mint
        if (tokensToMint == 0) {
            revert ZeroMintAmount();
        }

        _mint(_msgSender(), tokensToMint);
    }

    /// @notice Bond holder can convert their bond to underlying collateral(s)
    /// @notice The bond must be convertible and not past maturity
    function convert(uint256 amountOfBondsToConvert)
        external
        notPastMaturity
        nonReentrant
    {
        bool isConvertible = false;
        for (uint256 i = 0; i < collateralAddresses.length; i++) {
            if (convertibilityRatios[i] > 0) {
                isConvertible = true;
            }
        }
        if (!isConvertible) {
            revert NotConvertible();
        }

        burn(amountOfBondsToConvert);
        // iterate over all collateral tokens and withdraw a proportional amount
        for (uint256 i = 0; i < collateralAddresses.length; i++) {
            IERC20 collateralToken = IERC20(collateralAddresses[i]);
            uint256 convertibilityRatio = convertibilityRatios[i];
            if (convertibilityRatio > 0) {
                uint256 collateralToReceive = amountOfBondsToConvert /
                    convertibilityRatio;
                uint256 balanceBefore = collateralToken.balanceOf(
                    address(this)
                );
                collateralToken.safeTransfer(_msgSender(), collateralToReceive);
                uint256 balanceAfter = collateralToken.balanceOf(address(this));
                if (balanceAfter > balanceBefore) {
                    revert TokenOverflow();
                }
                totalCollateral[address(collateralToken)] -=
                    balanceBefore -
                    balanceAfter;
                emit Converted(
                    _msgSender(),
                    address(collateralToken),
                    amountOfBondsToConvert,
                    balanceBefore - balanceAfter
                );
            }
        }
    }

    /// @notice allows the issuer to repay the bond by depositing borrowing token
    /// @dev emits RepaymentInFull if the full balance has been repaid, RepaymentDeposited otherwise
    function repay(uint256 amount) public nonReentrant notPastMaturity {
        if (_isRepaid) {
            revert RepaymentMet();
        }
        IERC20(borrowingAddress).safeTransferFrom(
            _msgSender(),
            address(this),
            amount
        );
        if (
            IERC20(borrowingAddress).balanceOf(address(this)) >= totalSupply()
        ) {
            _isRepaid = true;
            emit RepaymentInFull(_msgSender(), amount);
        } else {
            emit RepaymentDeposited(_msgSender(), amount);
        }
    }

    /// @notice this function burns bonds in return for the token borrowed against the bond
    /// @param bondShares the amount of bonds to redeem and burn
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

        uint256 balanceBefore = IERC20(borrowingAddress).balanceOf(
            address(this)
        );
        IERC20(borrowingAddress).safeTransfer(_msgSender(), bondShares);
        uint256 balanceAfter = IERC20(borrowingAddress).balanceOf(
            address(this)
        );

        emit Redeem(
            _msgSender(),
            borrowingAddress,
            balanceAfter - balanceBefore,
            bondShares
        );
    }

    /// @notice this function returns an amount of collateral proportional to the bonds burnt
    /// @param bondShares the amount of bonds to burn into collateral
    function redeemDefaulted(uint256 bondShares)
        external
        nonReentrant
        pastMaturity
        defaulted
    {
        if (bondShares == 0) {
            revert ZeroRedemptionAmount();
        }
        burn(bondShares);

        // iterate over all collateral tokens and withdraw a proportional amount
        for (uint256 i = 0; i < collateralAddresses.length; i++) {
            IERC20 collateralToken = IERC20(collateralAddresses[i]);
            uint256 collateralRatio = collateralRatios[i];
            if (collateralRatio > 0) {
                uint256 collateralToReceive = bondShares * collateralRatio;
                uint256 balanceBefore = collateralToken.balanceOf(
                    address(this)
                );
                collateralToken.safeTransfer(_msgSender(), collateralToReceive);
                uint256 balanceAfter = collateralToken.balanceOf(address(this));
                totalCollateral[address(collateralToken)] -=
                    balanceAfter -
                    balanceBefore;
                emit RedeemDefaulted(
                    _msgSender(),
                    address(collateralToken),
                    bondShares,
                    balanceAfter - balanceBefore
                );
            }
        }
    }

    /// @notice sends tokens to the issuer that were sent to this contract
    /// @dev collateral, borrowing, and the bond itself cannot be swept
    /// @param token send the entire token balance of this address to the owner
    function sweep(IERC20 token) external nonReentrant {
        if (
            address(token) == borrowingAddress ||
            address(token) == address(this)
        ) {
            revert SweepDisallowedForToken();
        }
        for (uint256 i = 0; i < collateralAddresses.length; i++) {
            if (address(token) == collateralAddresses[i]) {
                revert SweepDisallowedForToken();
            }
        }
        token.transfer(owner(), token.balanceOf(address(this)));
    }
}
