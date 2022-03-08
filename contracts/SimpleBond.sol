// SPDX-License-Identifier: AGPL
pragma solidity 0.8.9;
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title SimpleBond
/// @notice A custom ERC20 token that can be used to issue bonds.
/// @notice The contract handles issuance, conversion, and redemption of bonds.
/// @dev External calls to tokens used for collateral and borrowing are used throughout to transfer and check balances
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
    event RepaymentDeposited(
        address indexed repaymentDepositor,
        uint256 amount
    );

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

    // todo: combine the two redeem events - defaulted or not
    /// @notice emitted when a bond is redeemed
    event Redeem(
        address indexed receiver,
        address indexed borrowingToken,
        uint256 amountOfBondsRedeemed,
        uint256 amountOfTokensReceived
    );

    /// @notice emitted when a bond is redeemed by a borrower
    event RedeemDefaulted(
        address indexed receiver,
        address indexed collateralToken,
        uint256 amountOfBondsRedeemed,
        uint256 amountOfCollateralReceived
    );

    // modifiers
    error BondPastMaturity();
    error BondNotYetMatured();
    error BondNotYetRepaid();
    error BondNotYetRedeemed();
    error BondNotDefaulted();

    // Initialization
    error InvalidMaturityDate();

    // Minting
    error InusfficientCollateralToCoverTokenSupply();
    error BondSupplyExceeded();
    error NoMintAfterIssuance();

    // Withdraw
    error CollateralInContractInsufficientToCoverWithdraw();

    // Conversion
    error NotConvertible();

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

    /// @dev used to ensure bond has been repaid in full
    modifier repaid() {
        if (!_isRepaid) {
            revert BondNotYetRepaid();
        }
        _;
    }

    /// @dev used to check if the bond has defaulted
    modifier defaulted() {
        if (block.timestamp < maturityDate && !_isRepaid) {
            revert BondNotDefaulted();
        }
        _;
    }

    /// @dev used to check if a bond is convertible
    modifier isConvertible() {
        bool _isConvertible = false;
        for (uint256 i = 0; i < collateralTokens.length; i++) {
            if (convertibilityRatios[i] > 0) {
                _isConvertible = true;
            }
        }
        if (!_isConvertible) {
            revert NotConvertible();
        }
        _;
    }

    /// @notice A date in the future set at bond creation at which the bond will mature.
    /// @notice Before this date, a bond token can be converted if convertible, but cannot be redeemed.
    /// @notice After this date, a bond token can be redeemed for the borrowing asset.
    uint256 public maturityDate;

    /// @notice The address of the ERC20 token this bond will be redeemable for at maturity
    address public borrowingToken;

    /// @notice this flag is set after the issuer has paid back the full amount of borrowing token needed to cover the outstanding bonds
    bool internal _isRepaid; // todo: can this be calculated on the fly?

    /// @notice this flag is set upon mint to disallow subsequent minting
    bool internal _isIssued; // todo: can this be calculated on the fly?

    /// @notice the addresses of the ERC20 tokens backing the bond which can be converted into before maturity or, in the case of a default, redeemable for at maturity
    address[] public collateralTokens;

    /// @notice the ratios of ERC20 tokens backing the bonds
    /// @dev these are related to the collateralTokens by index
    uint256[] public backingRatios;

    /// @notice the ratios of ERC20 tokens the bonds will convert into before maturity
    /// @dev if all of these ratios are 0, the bond is not convertible
    uint256[] public convertibilityRatios;

    // todo: figure out if we need this
    /// @notice this mapping keeps track of the total collateral per address that is in this contract. this amount is used when determining the portion of collateral to return to the bond holders in event of a default
    mapping(address => uint256) public totalCollateral;

    /// @return the collateral addresses for the bond
    function getCollateralTokens() external view returns (address[] memory) {
        return collateralTokens;
    }

    /// @return the backing ratios for the bond
    function getBackingRatios() external view returns (uint256[] memory) {
        return backingRatios;
    }

    /// @return the convertibility ratios for the bond
    function getConvertibilityRatios()
        external
        view
        returns (uint256[] memory)
    {
        return convertibilityRatios;
    }

    // todo: figure out why we need this
    function state() external view returns (BondStanding newStanding) {
        if (block.timestamp < maturityDate && !_isRepaid && totalSupply() > 0) {
            newStanding = BondStanding.GOOD;
        } else if (block.timestamp >= maturityDate && !_isRepaid) {
            newStanding = BondStanding.DEFAULTED;
        } else if (_isRepaid) {
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
    /// @param _collateralTokens the ERC20 token address(es) for the bond
    /// @param _backingRatios the amount of tokens per bond needed
    /// @param _convertibilityRatios the amount of tokens per bond a convertible bond can be converted for
    function initialize(
        string memory _name,
        string memory _symbol,
        address _owner,
        uint256 _maturityDate,
        address _borrowingToken,
        address[] memory _collateralTokens,
        uint256[] memory _backingRatios,
        uint256[] memory _convertibilityRatios
    ) external initializer {
        // todo: check validity of arrays - same length, non-zero, max length - backing ratio >= convertibility ratio
        // todo: enforce sorting of collateral tokens alphabetically by address by looping through and confirming it's bigger than the previous one, revert otherwise
        if (
            _maturityDate <= block.timestamp ||
            _maturityDate > block.timestamp + 3650 days
        ) {
            revert InvalidMaturityDate();
        }

        __ERC20_init(_name, _symbol);
        __ERC20Burnable_init();
        __Ownable_init();

        maturityDate = _maturityDate;
        borrowingToken = _borrowingToken;
        collateralTokens = _collateralTokens;
        backingRatios = _backingRatios;
        convertibilityRatios = _convertibilityRatios;

        _transferOwnership(_owner);
    }

    // todo: remove collateralTokens and iterate over only the existing addresses
    /// @notice Deposit collateral into bond contract
    /// @param _collateralTokens the array of addresses used to deposit
    /// @param amounts the array of collateral per address to deposit
    function depositCollateral(
        address[] memory _collateralTokens,
        uint256[] memory amounts
    ) external nonReentrant notPastMaturity {
        for (uint256 j = 0; j < _collateralTokens.length; j++) {
            for (uint256 k = 0; k < collateralTokens.length; k++) {
                if (_collateralTokens[j] == collateralTokens[k]) {
                    address collateralToken = collateralTokens[j];
                    uint256 amount = amounts[j];

                    if (amount == 0) {
                        revert ZeroAmount();
                    }
                    // reentrancy possibility: the totalCollateral is updated after the transfer
                    uint256 collateralDeposited = safeTransferIn(
                        IERC20(collateralToken),
                        _msgSender(),
                        amount
                    );

                    totalCollateral[collateralToken] += collateralDeposited;
                    emit CollateralDeposited(
                        _msgSender(),
                        collateralToken,
                        collateralDeposited
                    );
                }
            }
        }
    }

    // todo: refactor to an amount of bonds to burn and withdraw collateral automatically based off of the amount the issuer would receive for the bonds
    // todo: refactor the passed in list of collateral tokens
    /// @notice Withdraw collateral from bond contract
    /// @notice The amount of collateral available to be withdrawn depends on the backing ratio(s)
    /// @param _collateralTokens the tokens to withdraw
    /// @param _amounts the amounts of each token to withdraw
    function withdrawCollateral(
        address[] memory _collateralTokens,
        uint256[] memory _amounts
    ) external nonReentrant onlyOwner {
        for (uint256 j = 0; j < _collateralTokens.length; j++) {
            for (uint256 k = 0; k < collateralTokens.length; k++) {
                if (_collateralTokens[j] == collateralTokens[k]) {
                    address collateralToken = collateralTokens[k];
                    uint256 backingRatio = backingRatios[k];
                    uint256 convertibilityRatio = convertibilityRatios[k];
                    uint256 tokensNeededToCoverbackingRatio = totalSupply() *
                        backingRatio;
                    uint256 tokensNeededToCoverConvertibilityRatio = totalSupply() *
                            convertibilityRatio;
                    uint256 totalRequiredCollateral = tokensNeededToCoverbackingRatio +
                            tokensNeededToCoverConvertibilityRatio;
                    if (
                        _isRepaid && tokensNeededToCoverConvertibilityRatio > 0
                    ) {
                        totalRequiredCollateral = tokensNeededToCoverConvertibilityRatio;
                    } else if (_isRepaid) {
                        totalRequiredCollateral = 0;
                    }
                    uint256 balanceBefore = IERC20(collateralToken).balanceOf(
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
                    // reentrancy possibility: the issuer could try to transfer more collateral than is available - at the point of execution
                    // the amount of transferred funds is _amounts[j] which is taken directly from the function arguments.
                    // After re-entering into this function when at the time below is called, the balanceBefore
                    IERC20(collateralToken).safeTransfer(
                        _msgSender(),
                        _amounts[j]
                    );
                    totalCollateral[collateralToken] -= _amounts[j];
                    emit CollateralWithdrawn(
                        _msgSender(),
                        collateralToken,
                        _amounts[j]
                    );
                }
            }
        }
    }

    /// @notice mints the maximum amount of tokens restricted by the collateral(s)
    /// @dev nonReentrant needed as double minting would be possible otherwise
    function mint() external onlyOwner nonReentrant notPastMaturity {
        if (_isIssued) {
            revert NoMintAfterIssuance();
        }

        _isIssued = true;

        uint256 tokensToMint = 0;
        for (uint256 i = 0; i < collateralTokens.length; i++) {
            IERC20 collateralToken = IERC20(collateralTokens[i]);
            // external call reentrancy possibility: collateralDeposited is checked + used later
            uint256 collateralDeposited = collateralToken.balanceOf(
                address(this)
            );
            uint256 backingRatio = backingRatios[i];
            // Each collateral type restricts the amount of mintable tokens by the ratio required to satisfy "collateralized"
            // 100 deposited collateral with a 1:5 ratio would allow for 100/5 tokens minted for THIS collateral type
            uint256 tokensCanMint = 0;
            // totalBondSupply = collateralDeposited * backingRatio / 1e18
            // collateralDeposited * 1e18 / backingRatio = targetBondSupply * backingRatio / 1e18
            // since the convertibility ratio is less than or equal to the backing ratio, calculate with the backing ratio
            // todo: change ether to constant value
            tokensCanMint = (collateralDeposited * 1 ether) / backingRatio;

            // First collateral sets the minimum mint amount after each loop,
            // tokensToMint can decrease if there is not enough collateral of another type
            if (tokensToMint == 0 || tokensToMint > tokensCanMint) {
                tokensToMint = tokensCanMint;
            }
        }
        // At this point, tokensToMint is the maximum possible to mint
        if (tokensToMint == 0) {
            revert ZeroAmount();
        }

        _mint(_msgSender(), tokensToMint);
    }

    /// @notice Bond holder can convert their bond to underlying collateral(s)
    /// @notice The bond must be convertible and not past maturity
    /// @param amountOfBondsToConvert the number of bonds which will be burnt and converted into the collateral(s) at the convertibility ratio(s)
    function convert(uint256 amountOfBondsToConvert)
        external
        notPastMaturity
        nonReentrant
        isConvertible
    {
        if (amountOfBondsToConvert == 0) {
            revert ZeroAmount();
        }

        burn(amountOfBondsToConvert);
        // iterate over all collateral tokens and withdraw a proportional amount
        for (uint256 i = 0; i < collateralTokens.length; i++) {
            address collateralToken = collateralTokens[i];
            uint256 convertibilityRatio = convertibilityRatios[i];
            if (convertibilityRatio > 0) {
                uint256 collateralToSend = (amountOfBondsToConvert *
                    convertibilityRatio) / 1 ether;
                // external call reentrancy possibility: the bonds are burnt here already - if there weren't enough bonds to burn, an error is thrown
                IERC20(collateralToken).safeTransfer(
                    _msgSender(),
                    collateralToSend
                );
                totalCollateral[collateralToken] -= collateralToSend;
                emit Converted(
                    _msgSender(),
                    collateralToken,
                    amountOfBondsToConvert,
                    collateralToSend
                );
            }
        }
    }

    /// @notice allows the issuer to repay the bond by depositing borrowing token
    /// @dev emits RepaymentInFull if the full balance has been repaid, RepaymentDeposited otherwise
    /// @dev the lower of outstandingAmount and amount is chosen to prevent overpayment
    /// @param amount the number of borrowing tokens to repay
    function repay(uint256 amount) external nonReentrant notPastMaturity {
        if (_isRepaid) {
            revert RepaymentMet();
        }
        if (amount == 0) {
            revert ZeroAmount();
        }
        // external call reentrancy possibility: this is a transfer into the contract - _isRepaid is updated after transfer
        uint256 outstandingAmount = totalSupply() -
            IERC20(borrowingToken).balanceOf(address(this));

        uint256 amountRepaid = safeTransferIn(
            IERC20(borrowingToken),
            _msgSender(),
            amount >= outstandingAmount ? outstandingAmount : amount
        );

        if (amountRepaid >= outstandingAmount) {
            _isRepaid = true;
            emit RepaymentInFull(_msgSender(), amountRepaid);
        } else {
            emit RepaymentDeposited(_msgSender(), amountRepaid);
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
        // todo: make more like erc4626 solmate preview redeem to separate calculation logic
        if (bondShares == 0) {
            revert ZeroAmount();
        }

        burn(bondShares);

        // external call reentrancy possibility: the bonds are burnt here already - if there weren't enough bonds to burn, an error is thrown
        // todo: what if bondShares != borrowing token decimals?
        IERC20(borrowingToken).safeTransfer(_msgSender(), bondShares);
        emit Redeem(_msgSender(), borrowingToken, bondShares, bondShares);
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
            revert ZeroAmount();
        }
        burn(bondShares);

        // iterate over all collateral tokens and withdraw a proportional amount
        // todo: also give out possible partial borrowing token repaid
        // bondShares / total bond supply * total borrowing supply?
        for (uint256 i = 0; i < collateralTokens.length; i++) {
            address collateralToken = collateralTokens[i];
            uint256 backingRatio = backingRatios[i];
            if (backingRatio > 0) {
                uint256 collateralToReceive = (bondShares * backingRatio) /
                    1 ether;
                // external call reentrancy possibility: the bonds are burnt here already - if there weren't enough bonds to burn, an error is thrown
                IERC20(collateralToken).safeTransfer(
                    _msgSender(),
                    collateralToReceive
                );
                totalCollateral[collateralToken] -= collateralToReceive;
                emit RedeemDefaulted(
                    _msgSender(),
                    collateralToken,
                    bondShares,
                    collateralToReceive
                );
            }
        }
    }

    /// @notice sends tokens to the issuer that were sent to this contract
    /// @dev collateral, borrowing, and the bond itself cannot be swept
    /// @param token send the entire token balance of this address to the owner
    function sweep(IERC20 token) external nonReentrant {
        if (
            address(token) == borrowingToken || address(token) == address(this)
        ) {
            revert SweepDisallowedForToken();
        }
        for (uint256 i = 0; i < collateralTokens.length; i++) {
            if (address(token) == collateralTokens[i]) {
                revert SweepDisallowedForToken();
            }
        }
        token.transfer(owner(), token.balanceOf(address(this)));
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
}
