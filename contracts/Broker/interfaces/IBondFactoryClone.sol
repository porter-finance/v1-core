// SPDX-License-Identifier: AGPL
pragma solidity 0.8.9;

interface IBondFactoryClone {
  event BondCreated(address newBond);

  function createBond(
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
  ) external returns (address);
}
