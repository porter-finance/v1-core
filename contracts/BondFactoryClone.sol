// SPDX-License-Identifier: AGPL
pragma solidity 0.8.9;
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./SimpleBond.sol";

contract BondFactoryClone is AccessControl {
    address public immutable tokenImplementation;
    bool public isAllowListEnabled = true;
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");

    event BondCreated(address newBond);

    /// @notice emitted when a allow list is toggled
    event AllowListEnabled(bool isAllowListEnabled);

    modifier onlyIssuer() {
        if (isAllowListEnabled) {
            _checkRole(ISSUER_ROLE, msg.sender);
        }
        _;
    }

    constructor() {
        tokenImplementation = address(new SimpleBond());
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function setIsAllowListEnabled(bool _isAllowListEnabled)
        public
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        isAllowListEnabled = _isAllowListEnabled;
        emit AllowListEnabled(isAllowListEnabled);
    }

    function createBond(
        string memory _name,
        string memory _symbol,
        address _owner,
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
            _name,
            _symbol,
            _owner,
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
