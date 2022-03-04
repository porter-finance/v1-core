// SPDX-License-Identifier: AGPL
pragma solidity 0.8.9;

interface IBondFactoryClone {
    event BondCreated(address newBond);

    function createBond(
        string memory _name,
        string memory _symbol,
        address _issuer,
        uint256 _maturityDate,
        address _borrowingAddress,
        address[] memory _collateralAddresses,
        uint256[] memory _collateralizationRatios,
        uint256[] memory _convertibilityRatios
    ) external returns (address);
}
