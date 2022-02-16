/*SPDX-License-Identifier: AGPL-3.0-or-later
┌────────────┐ ┌────────────┐ ┌────────────┐  ┌────────────┐ ┌────────────┐ ┌────────────┐ 
│            │ │            │ │            │  │            │ │            │ │            │ 
│            │ │            │ │            │  │            │ │            │ │            │ 
│            │ │            │ │            │  │            │ │            │ │            │ 
│            │ │            │ │            │  │            │ │            │ │            │ 
│            │ │            │ │            │  │            │ │            │ │            │ 
├──────┬─────┘ │            │ ├────┬────┬──┴┐ └───┬────┬───┘ ├────┬───────┘ ├────┬────┬──┴┐
│      │       │            │ │    │    │   │     │    │     │    │         │    │    │   │
│      │       │            │ │    │    │   │     │    │     │    ├───────┐ │    │    │   │
│      │       │            │ │    │    │   │     │    │     │    │       │ │    │    │   │
│      │       │            │ │    │    │   │     │    │     │    ├───────┘ │    │    │   │
│      │       │            │ │    │    │   │     │    │     │    │         │    │    │   │
│      │       │            │ │    │    │   │     │    │     │    ├───────┐ │    │    │   │
│      │       │            │ │    │    │   │     │    │     │    │       │ │    │    │   │
└──────┘       └────────────┘ └────┘    └───┘     └────┘     └────┴───────┘ └────┘    └───┘
 */
pragma solidity 0.8.9;

// --- Import statements ---
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./TestERC20.sol";
import "../SimpleBond.sol";
import "./interfaces/IGnosisAuction.sol";
import "./interfaces/IBondFactoryClone.sol";
import "hardhat/console.sol";

// --- Interfaces ---
// --- Libraries ---

/// @title Porter auction wrapping Gnosis EasyAuction
/// @author Porter
/// @notice Single instance which maps to one EasyAuction
/// @notice Controlls the auction, collateral, and bond issuace
/// @dev This deviates from EasyAuction by not having an auctioning token until the auction is settling
contract Broker is Ownable, ReentrancyGuard {
  // --- Type Declarations ---
  struct BondData {
    address bondContract;
  }

  struct CollateralData {
    address bondAddress;
    address collateralAddress;
    uint256 collateralAmount;
  }

  struct Bond {
    address bondContract;
    uint256 maturityDate;
  }
  // --- State Variables ---
  address public immutable gnosisAuctionAddress;
  address public immutable bondFactoryAddress;
  address[] public bondHolders;

  /// @notice The bond data for a specific auction
  /// @dev uint256 auctionId is the id of the auction
  /// @dev BondData the bond data
  mapping(uint256 => BondData) public auctionToBondData;

  mapping(address => Bond[]) public issuerToBonds;
  mapping(address => address) public bondToIssuer;

  // --- Events ---
  /// @notice A GnosisAuction is created with auction parameters
  /// @dev auctionId is returned from the auction contract
  /// @param creator the caller of the auction
  /// @param auctionId the id of the auction
  event AuctionCreated(
    address indexed creator,
    uint256 indexed auctionId,
    address porterBondAddress
  );

  /// @notice Collateral for an auctioneer is added to the porter auction contract
  /// @param collateralDepositor the address of the caller of the deposit
  /// @param collateralAddress the address of the token being deposited
  /// @param collateralAmount the number of the tokens being deposited
  event CollateralDeposited(
    address indexed collateralDepositor,
    address indexed collateralAddress,
    uint256 collateralAmount
  );

  /// @notice Collateral for an auctioneer is removed from the auction contract
  /// @param collateralRedeemer the address of the caller of the redemption
  /// @param collateralAddress the address of the token being redeemed
  /// @param collateralAmount the number of the tokens redeemed
  event CollateralRedeemed(
    address indexed collateralRedeemer,
    address indexed collateralAddress,
    uint256 collateralAmount
  );

  event RepaymentDeposited(
    address indexed borrower,
    address indexed principalTokenAddress,
    uint256 principalAmount
  );

  event RepaymentInFull(
    address indexed borrower,
    address indexed principalTokenAddress,
    uint256 principalAmount
  );

  event Converted(
    address indexed porterBondAddress,
    uint256 indexed amountOfBondsConverted,
    uint256 indexed amountOfCollateralReceived
  );

  event Redeemed(
    address indexed porterBondAddress,
    uint256 indexed amountOfBondsRedeemed,
    uint256 indexed amountOfPrincipalReceived
  );

  event BondCreated(address newBond);
  // --- Errors ---
  error InadequateCollateralBalance(
    address collateralAddress,
    uint256 collateralAmount
  );

  error MaturityDateNotReached(uint256 blockTimestamp, uint256 maturityDate);

  error TransferCollateralFailed();

  error InsufficientCollateralInContract(
    address collateralAddress,
    uint256 collateralAmount
  );

  error InvalidMaturityDate(uint256 maturityDate, uint256 auctionEndDate);

  error AuctioningTokenTransferFail(
    address auctioningTokenAddress,
    uint256 auctionedSellAmount
  );

  error NonZeroAuctionFee();

  error BondAddressNotSet();

  error UnauthorizedInteractionWithBond();

  // --- Modifiers ---
  using SafeERC20 for IERC20;

  // --- Functions ---
  constructor(address gnosisAuctionAddress_, address bondFactoryAddress_) {
    gnosisAuctionAddress = gnosisAuctionAddress_;
    bondFactoryAddress = bondFactoryAddress_;
  }

  function createBond(
    string memory _name,
    string memory _symbol,
    uint256 _totalBondSupply,
    uint256 _maturityDate
  ) external {
    address bond = IBondFactoryClone(bondFactoryAddress).createBond(
      _name,
      _symbol,
      _totalBondSupply,
      _maturityDate,
      address(this)
    );
    issuerToBonds[msg.sender].push(Bond(bond, _maturityDate));
    bondToIssuer[bond] = msg.sender;
    if (issuerToBonds[msg.sender].length == 0) {
      bondHolders.push(msg.sender);
    }
    emit BondCreated(bond);
  }

  /// @notice Transfer collateral from the caller to the auction. The collateral is stored in the auction.
  /// @dev The collateral is mapped from the msg.sender & address to the collateral value.
  /// @dev Required msg.sender to have adequate balance, and the transfer to be successful (returns true).
  /// @param collateralData is a struct containing the address of the collateral and the value of the collateral
  function depositCollateral(CollateralData memory collateralData) external {
    // After a successul transfer, set collateral in bond contract
    if (collateralData.bondAddress == address(0)) {
      revert BondAddressNotSet();
    }
    if (bondToIssuer[collateralData.bondAddress] != msg.sender) {
      revert UnauthorizedInteractionWithBond();
    }
    SimpleBond(collateralData.bondAddress).depositCollateral(
      collateralData.collateralAddress,
      collateralData.collateralAmount
    );
    emit CollateralDeposited(
      msg.sender,
      collateralData.collateralAddress,
      collateralData.collateralAmount
    );
  }

  /// @notice After a bond has matured AND the issuer has returned the auctioningToken, the issuer can redeem the collateral.
  /// @dev Required timestamp to be later than bond maturity timestamp.
  /// @dev Required bond to have been repaid.
  /// @param bondAddress todo
  function redeemCollateral(address bondAddress) external {
    SimpleBond bond = SimpleBond(bondAddress);

    bond.redeemCollateral();

    emit CollateralRedeemed(msg.sender, address(bondAddress), 0);
  }

  function repayBond(address bondAddress, uint256 principalAmount) external {
    SimpleBond bond = SimpleBond(bondAddress);
    bond.repay();
    if (
      false /*bond.isRepaid()*/
    ) {
      emit RepaymentInFull(msg.sender, address(bond), principalAmount);
    } else {
      emit RepaymentDeposited(msg.sender, address(0), principalAmount);
    }
  }

  function redeem(address bondAddress, uint256 bondsToBeRedeemed) external {
    SimpleBond bond = SimpleBond(bondAddress);
    bond.redeem(bondsToBeRedeemed);
    emit Redeemed(
      bondAddress,
      bondsToBeRedeemed,
      0 /* principalAmountReceived*/
    );
  }

  /// @notice This entry needs a bond config + auction config + collateral config
  /// @dev required to have a 0 fee gnosis auction
  /// @dev auctionId is returned from the newly created auction contract
  /// @dev New PorterBonds are minted from the auctionData._auctionedSellAmount
  /// @notice collateral must be deposited before the auction is created
  /// @param auctionData the auction data
  /// @param bondData the bond data
  /// @return auctionId the id of the auction
  function createAuction(
    AuctionType.AuctionData memory auctionData,
    BondData memory bondData
  ) external returns (uint256 auctionId) {
    // only create auction if there is no fee: gnosis says it won't add one https://github.com/gnosis/ido-contracts/issues/143
    if (IGnosisAuction(gnosisAuctionAddress).feeNumerator() > 0) {
      revert NonZeroAuctionFee();
    }
    SimpleBond auctioningToken = SimpleBond(bondData.bondContract);
    if (
      auctioningToken.maturityDate() < block.timestamp ||
      auctioningToken.maturityDate() < auctionData.auctionEndDate
    ) {
      revert InvalidMaturityDate(
        auctioningToken.maturityDate(),
        auctionData.auctionEndDate
      );
    }

    // Approve the auction to transfer all the tokens
    if (
      !auctioningToken.approve(
        gnosisAuctionAddress,
        auctionData._auctionedSellAmount
      )
    ) {
      revert AuctioningTokenTransferFail(
        address(auctioningToken),
        auctionData._auctionedSellAmount
      );
    }

    auctionId = initiateAuction(auctionData, auctioningToken);

    // set the bond data
    auctionToBondData[auctionId] = bondData;

    emit AuctionCreated(msg.sender, auctionId, address(auctioningToken));
  }

  /// @notice Use to create an auction after collateral has been deposited
  /// @dev auctionId is returned from the newly created auction contract
  /// @dev New PorterBonds are minted from the auctionData._auctionedSellAmount
  /// @param auctionData the auction data
  function initiateAuction(
    AuctionType.AuctionData memory auctionData,
    SimpleBond auctioningToken
  ) internal returns (uint256 auctionId) {
    console.log("Broker/initiateAuction");
    // Create a new GnosisAuction
    auctionId = IGnosisAuction(gnosisAuctionAddress).initiateAuction(
      IERC20(address(auctioningToken)),
      auctionData._biddingToken,
      auctionData.orderCancellationEndDate,
      auctionData.auctionEndDate,
      auctionData._auctionedSellAmount,
      auctionData._minBuyAmount,
      auctionData.minimumBiddingAmountPerOrder,
      auctionData.minFundingThreshold,
      auctionData.isAtomicClosureAllowed,
      auctionData.accessManagerContract,
      auctionData.accessManagerContractData
    );
  }
  // TODO: on auction fail or ending, burn remaining tokens feeAmount.mul(fillVolumeOfAuctioneerOrder).div(
  // TODO: on return of principle, check that principle == total supply of bond token
}
