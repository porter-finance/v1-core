// SPDX-License-Identifier: AGPL
pragma solidity 0.8.9;
import "./SimpleBond.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

contract BondFactoryClone {
  address immutable tokenImplementation;
  event BondCreated(address newBond);

  constructor() {
    tokenImplementation = address(new SimpleBond());
  }

  function createBond(
    uint256 _totalBondSupply,
    uint256 _maturityDate,
    address _owner,
    address _issuer,
    address _collateralAddress,
    uint256 _collateralizationRatio,
    bool _isConvertible,
    uint256 _convertibilityRatio,
    address _borrowingAddress,
    uint256 _repaymentAmount
  ) external returns (address) {
    address clone = Clones.clone(tokenImplementation);
    SimpleBond(clone).initialize(
      _totalBondSupply,
      _maturityDate,
      _owner,
      _issuer,
      _collateralAddress,
      _collateralizationRatio,
      _isConvertible,
      _convertibilityRatio,
      _borrowingAddress,
      _repaymentAmount
    );
    emit BondCreated(clone);
    return clone;
  }
}
