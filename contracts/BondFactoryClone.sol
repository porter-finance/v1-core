// SPDX-License-Identifier: AGPL
pragma solidity 0.8.9;
import "./SimpleBond.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract BondFactoryClone is AccessControl {
    address public immutable tokenImplementation;

    bytes32 public constant ISSUER = keccak256("ISSUER");

    event BondCreated(address newBond);

    constructor() {
        tokenImplementation = address(new SimpleBond());
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function setupIssuers(address[] memory issuers)
        public
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        for (uint256 i = 0; i < issuers.length; i++) {
            _setupRole(ISSUER, issuers[i]);
        }
    }

    function revokeIssuers(address[] memory issuers)
        public
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        for (uint256 i = 0; i < issuers.length; i++) {
            revokeRole(ISSUER, issuers[i]);
        }
    }

    function createBond(
        address _owner,
        address _issuer,
        uint256 _maturityDate,
        uint256 _maxBondSupply,
        address _collateralAddress,
        uint256 _collateralizationRatio,
        address _borrowingAddress,
        bool _isConvertible,
        uint256 _convertibilityRatio
    ) external onlyRole(ISSUER) returns (address clone) {
        clone = Clones.clone(tokenImplementation);
        SimpleBond(clone).initialize(
            _owner,
            _issuer,
            _maturityDate,
            _maxBondSupply,
            _collateralAddress,
            _collateralizationRatio,
            _borrowingAddress,
            _isConvertible,
            _convertibilityRatio
        );
        emit BondCreated(clone);
    }
}
