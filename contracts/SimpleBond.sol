pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract SimpleBond is Ownable {
  event MintedBond(address buyer, uint256 bondsAmount);

  event RedeemedCoupons(address indexed caller, uint256[] bonds);

  event ClaimedPar(address indexed caller, uint256 amountClaimed);

  event Transferred(address indexed from, address indexed to, uint256[] bonds);

  string name;

  address tokenToRedeem;

  uint256 totalDebt;

  uint256 parDecimals;

  uint256 bondsNumber;

  uint256 cap;

  uint256 parValue;

  uint256 couponRate;

  uint256 term;

  uint256 loopLimit;

  uint256 nonce = 0;

  uint256 redeemThreshold = 0;

  IERC20 token;

  mapping(uint256 => address) bonds;
  mapping(uint256 => uint256) maturities;
  mapping(uint256 => uint256) couponsRedeemed;
  mapping(address => uint256) bondsAmount;

  constructor(
    string memory _name,
    uint256 _par,
    uint256 _parDecimals,
    uint256 _term,
    uint256 _cap,
    address _tokenToRedeem,
    uint256 _loopLimit
  ) {
    require(bytes(_name).length > 0);
    require(_par > 0);
    require(_term > 0);
    require(_loopLimit > 0);

    name = _name;

    parValue = _par;

    cap = _cap;

    loopLimit = _loopLimit;

    parDecimals = _parDecimals;

    term = _term;

    if (_tokenToRedeem == address(0)) tokenToRedeem = _tokenToRedeem;
    else token = IERC20(_tokenToRedeem);
  }

  /**
   * @notice Change the number of elements you can loop through in this contract
   * @param _loopLimit The new loop limit
   */
  function changeLoopLimit(uint256 _loopLimit) public onlyOwner {
    require(_loopLimit > 0);

    loopLimit = _loopLimit;
  }

  /**
   * @notice Mint bonds to a new buyer
   * @param buyer The buyer of the bonds
   * @param _bondsAmount How many bonds to mint
   */
  function mintBond(address buyer, uint256 _bondsAmount) public onlyOwner {
    require(buyer != address(0));
    require(_bondsAmount >= 1);
    require(_bondsAmount <= loopLimit);

    if (cap > 0) require(bondsNumber + (_bondsAmount) <= cap);

    bondsNumber = bondsNumber + (_bondsAmount);

    nonce = nonce + _bondsAmount;

    for (uint256 i = 0; i < _bondsAmount; i++) {
      maturities[nonce - (i)] = block.timestamp + (term);
      bonds[nonce - (i)] = buyer;
      bondsAmount[buyer] = bondsAmount[buyer] + (_bondsAmount);
    }

    totalDebt =
      totalDebt +
      (parValue * _bondsAmount) +
      (((parValue * couponRate) / 100) * _bondsAmount);

    emit MintedBond(buyer, _bondsAmount);
  }

  /**
   * @notice Redeem coupons on your bonds
   * @param _bonds An array of bond ids corresponding to the bonds you want to redeem apon
   */
  function redeemCoupons(uint256[] memory _bonds) public {
    require(_bonds.length > 0);
    require(_bonds.length <= loopLimit);
    require(_bonds.length <= getBalance(msg.sender));

    uint256 issueDate = 0;
    uint256 lastThresholdRedeemed = 0;
    uint256 toRedeem = 0;

    for (uint256 i = 0; i < _bonds.length; i++) {
      if (bonds[_bonds[i]] != msg.sender) continue;

      issueDate = maturities[_bonds[i]] - (term);

      lastThresholdRedeemed =
        issueDate +
        (couponsRedeemed[_bonds[i]] * (redeemThreshold));

      if (
        lastThresholdRedeemed + (redeemThreshold) >= maturities[_bonds[i]] ||
        block.timestamp < lastThresholdRedeemed + (redeemThreshold)
      ) continue;

      toRedeem =
        (block.timestamp - (lastThresholdRedeemed)) /
        (redeemThreshold);

      if (toRedeem == 0) continue;

      couponsRedeemed[_bonds[i]] = couponsRedeemed[_bonds[i]] + (toRedeem);

      getMoney(
        toRedeem * ((parValue * (couponRate)) / (10**(parDecimals + (2)))),
        msg.sender
      );

      bonds[_bonds[i]] = address(0);
      maturities[_bonds[i]] = 0;
      bondsAmount[msg.sender]--;

      getMoney(parValue / ((10**parDecimals)), msg.sender);
    }

    emit RedeemedCoupons(msg.sender, _bonds);
  }

  /**
   * @notice Transfer bonds to another address
   * @param receiver The receiver of the bonds
   * @param _bonds The ids of the bonds that you want to transfer
   */
  function transfer(address receiver, uint256[] memory _bonds) public {
    require(_bonds.length > 0);
    require(receiver != address(0));
    require(_bonds.length <= getBalance(msg.sender));

    for (uint256 i = 0; i < _bonds.length; i++) {
      if (bonds[_bonds[i]] != msg.sender) continue;

      bonds[_bonds[i]] = receiver;
      bondsAmount[msg.sender] = bondsAmount[msg.sender] - (1);
      bondsAmount[receiver] = bondsAmount[receiver] + (1);
    }

    emit Transferred(msg.sender, receiver, _bonds);
  }

  /**
   * @notice Donate money to this contract
   */
  function donate() public payable {
    require(address(token) == address(0));
  }

  //PRIVATE

  /**
   * @notice Transfer money to an address
   * @param amount The amount of money to be transferred
   * @param receiver The address which will receive the money
   */
  function getMoney(uint256 amount, address receiver) private {
    // TODO: burn address?
    // if (address(token) == address(0)) receiver.transfer(amount);
    token.transfer(msg.sender, amount);

    totalDebt = totalDebt - (amount);
  }

  //GETTERS

  /**
   * @dev Get the last time coupons for a particular bond were redeemed
   * @param bond The bond id to analyze
   */
  function getLastTimeRedeemed(uint256 bond) public view returns (uint256) {
    uint256 issueDate = maturities[bond] - (term);

    uint256 lastThresholdRedeemed = issueDate +
      (couponsRedeemed[bond] * (redeemThreshold));

    return lastThresholdRedeemed;
  }

  /**
   * @dev Get the owner of a specific bond
   * @param bond The bond id to analyze
   */
  function getBondOwner(uint256 bond) public view returns (address) {
    return bonds[bond];
  }

  /**
   * @dev Get the address of the token that is redeemed
   */
  function getTokenAddress() public view returns (address) {
    return (address(token));
  }

  /**
   * @dev Get how much time it takes for a bond to mature
   */
  function getTerm() public view returns (uint256) {
    return term;
  }

  /**
   * @dev Get the maturity date for a specific bond
   * @param bond The bond id to analyze
   */
  function getMaturity(uint256 bond) public view returns (uint256) {
    return maturities[bond];
  }

  /**
   * @dev Get how much money is redeemed
   */
  function getSimpleInterest() public view returns (uint256) {
    uint256 par = getParValue();

    return par / 100;
  }

  /**
   * @dev Get the par value for these bonds
   */
  function getParValue() public view returns (uint256) {
    return parValue;
  }

  /**
   * @dev Get the cap amount for these bonds
   */
  function getCap() public view returns (uint256) {
    return cap;
  }

  /**
   * @dev Get amount of bonds that an address has
   * @param who The address to analyze
   */
  function getBalance(address who) public view returns (uint256) {
    return bondsAmount[who];
  }

  /**
   * @dev If the par value is a real number, it might have decimals. Get the amount of decimals the par value has
   */
  function getParDecimals() public view returns (uint256) {
    return parDecimals;
  }

  /**
   * @dev Get the address of the token to redeem
   */
  function getTokenToRedeem() public view returns (address) {
    return tokenToRedeem;
  }

  /**
   * @dev Get the name of this simple bond contract
   */
  function getName() public view returns (string memory) {
    return name;
  }

  /**
   * @dev Get the current unpaid debt
   */
  function getTotalDebt() public view returns (uint256) {
    return totalDebt;
  }

  /**
   * @dev Get the total amount of bonds issued
   */
  function getTotalBonds() public view returns (uint256) {
    return bondsNumber;
  }

  /**
   * @dev Get the latest nonce
   */
  function getNonce() public view returns (uint256) {
    return nonce;
  }

  /**
   * @dev Get the amount of time that needs to pass between the dates when you can redeem
   */
  function getRedeemThreshold() public view returns (uint256) {
    return redeemThreshold;
  }
}
