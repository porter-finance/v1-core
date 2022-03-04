// SPDX-License-Identifier: AGPL
pragma solidity 0.8.9;
import "./SimpleBond.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract BondFactoryClone is AccessControl {
    address public immutable tokenImplementation;
    bool public isAllowListEnabled = true;
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");

    error onlyApprovedIssuersCanCallThis();

    event BondCreated(address newBond);

    constructor() {
        tokenImplementation = address(new SimpleBond());
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    modifier onlyIssuer() {
        if (isAllowListEnabled && !hasRole(ISSUER_ROLE, msg.sender)) {
            revert onlyApprovedIssuersCanCallThis();
        }
        _;
    }

    function setIsAllowListEnabled(bool _isAllowListEnabled)
        public
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        isAllowListEnabled = _isAllowListEnabled;
    }

    function setupIssuers(address[] memory issuers)
        public
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        for (uint256 i = 0; i < issuers.length; i++) {
            _setupRole(ISSUER_ROLE, issuers[i]);
        }
    }

    function revokeIssuers(address[] memory issuers)
        public
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        for (uint256 i = 0; i < issuers.length; i++) {
            revokeRole(ISSUER_ROLE, issuers[i]);
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
    ) external onlyIssuer returns (address clone) {
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
