// SPDX-License-Identifier: AGPL
pragma solidity ^0.8.0;
import "./SimpleBond.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

contract BondFactoryClone {
  address immutable tokenImplementation;
  event BondCreated(address newFoundation);

  constructor() {
    tokenImplementation = address(new SimpleBond());
  }

  function createBond(
    string memory _name,
    string memory _symbol,
    uint256 _totalBondSupply,
    uint256 _maturityDate
  ) external returns (address) {
    address clone = Clones.clone(tokenImplementation);
    SimpleBond(clone).initialize(
      _name,
      _symbol,
      _totalBondSupply,
      _maturityDate
    );
    emit BondCreated(clone);
    return clone;
  }
}
