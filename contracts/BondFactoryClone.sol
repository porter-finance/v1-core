// SPDX-License-Identifier: AGPL
pragma solidity 0.8.9;
import "./SimpleBond.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

contract BondFactoryClone {
    address public immutable tokenImplementation;
    event BondCreated(address newBond);

    constructor() {
        tokenImplementation = address(new SimpleBond());
    }

    function createBond(
        string memory _name,
        string memory _symbol,
        address _owner,
        uint256 _maturityDate,
        address _borrowingAddress,
        address[] memory _collateralAddresses,
        uint256[] memory _collateralizationRatios,
        uint256[] memory _convertibilityRatios
    ) external returns (address clone) {
        clone = Clones.clone(tokenImplementation);
        SimpleBond(clone).initialize(
            _name,
            _symbol,
            _owner,
            _maturityDate,
            _borrowingAddress,
            _collateralAddresses,
            _collateralizationRatios,
            _convertibilityRatios
        );
        emit BondCreated(clone);
    }
}
