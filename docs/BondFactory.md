# BondFactory

_Porter Finance_

> Bond Factory

This factory contract issues new bond contracts

_This uses a cloneFactory to save on gas costs during deployment see OpenZeppelin&#39;s &quot;Clones&quot; proxy_

## Methods

### DEFAULT_ADMIN_ROLE

```solidity
function DEFAULT_ADMIN_ROLE() external view returns (bytes32)
```

#### Returns

| Name | Type    | Description |
| ---- | ------- | ----------- |
| \_0  | bytes32 | undefined   |

### ISSUER_ROLE

```solidity
function ISSUER_ROLE() external view returns (bytes32)
```

the role required to issue bonds

#### Returns

| Name | Type    | Description |
| ---- | ------- | ----------- |
| \_0  | bytes32 | undefined   |

### createBond

```solidity
function createBond(string name, string symbol, address owner, uint256 maturityDate, address paymentToken, address collateralToken, uint256 collateralRatio, uint256 convertibleRatio, uint256 maxSupply) external nonpayable returns (address clone)
```

Creates a bond

_This uses a clone to save on deployment costs which adds a slight overhead everytime users interact with the bonds - but saves on gas during deployment_

#### Parameters

| Name             | Type    | Description                                             |
| ---------------- | ------- | ------------------------------------------------------- |
| name             | string  | Name of the bond                                        |
| symbol           | string  | Ticker symbol for the bond                              |
| owner            | address | Owner of the bond                                       |
| maturityDate     | uint256 | Timestamp of when the bond matures                      |
| paymentToken     | address | Address of the token being paid                         |
| collateralToken  | address | Address of the collateral to use for the bond           |
| collateralRatio  | uint256 | Ratio of bond: collateral token                         |
| convertibleRatio | uint256 | Ratio of bond:token that the bond can be converted into |
| maxSupply        | uint256 | Max amount of tokens able to mint                       |

#### Returns

| Name  | Type    | Description |
| ----- | ------- | ----------- |
| clone | address | undefined   |

### getRoleAdmin

```solidity
function getRoleAdmin(bytes32 role) external view returns (bytes32)
```

_Returns the admin role that controls `role`. See {grantRole} and {revokeRole}. To change a role&#39;s admin, use {\_setRoleAdmin}._

#### Parameters

| Name | Type    | Description |
| ---- | ------- | ----------- |
| role | bytes32 | undefined   |

#### Returns

| Name | Type    | Description |
| ---- | ------- | ----------- |
| \_0  | bytes32 | undefined   |

### grantRole

```solidity
function grantRole(bytes32 role, address account) external nonpayable
```

_Grants `role` to `account`. If `account` had not been already granted `role`, emits a {RoleGranted} event. Requirements: - the caller must have `role`&#39;s admin role._

#### Parameters

| Name    | Type    | Description |
| ------- | ------- | ----------- |
| role    | bytes32 | undefined   |
| account | address | undefined   |

### hasRole

```solidity
function hasRole(bytes32 role, address account) external view returns (bool)
```

_Returns `true` if `account` has been granted `role`._

#### Parameters

| Name    | Type    | Description |
| ------- | ------- | ----------- |
| role    | bytes32 | undefined   |
| account | address | undefined   |

#### Returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| \_0  | bool | undefined   |

### isAllowListEnabled

```solidity
function isAllowListEnabled() external view returns (bool)
```

when enabled, issuance is restricted to those with the ISSUER_ROLE

#### Returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| \_0  | bool | undefined   |

### renounceRole

```solidity
function renounceRole(bytes32 role, address account) external nonpayable
```

_Revokes `role` from the calling account. Roles are often managed via {grantRole} and {revokeRole}: this function&#39;s purpose is to provide a mechanism for accounts to lose their privileges if they are compromised (such as when a trusted device is misplaced). If the calling account had been revoked `role`, emits a {RoleRevoked} event. Requirements: - the caller must be `account`._

#### Parameters

| Name    | Type    | Description |
| ------- | ------- | ----------- |
| role    | bytes32 | undefined   |
| account | address | undefined   |

### revokeRole

```solidity
function revokeRole(bytes32 role, address account) external nonpayable
```

_Revokes `role` from `account`. If `account` had been granted `role`, emits a {RoleRevoked} event. Requirements: - the caller must have `role`&#39;s admin role._

#### Parameters

| Name    | Type    | Description |
| ------- | ------- | ----------- |
| role    | bytes32 | undefined   |
| account | address | undefined   |

### setIsAllowListEnabled

```solidity
function setIsAllowListEnabled(bool _isAllowListEnabled) external nonpayable
```

Turns the allow list on or off

_Must be called by the current owner_

#### Parameters

| Name                 | Type | Description                                |
| -------------------- | ---- | ------------------------------------------ |
| \_isAllowListEnabled | bool | If the allow list should be enabled or not |

### supportsInterface

```solidity
function supportsInterface(bytes4 interfaceId) external view returns (bool)
```

_See {IERC165-supportsInterface}._

#### Parameters

| Name        | Type   | Description |
| ----------- | ------ | ----------- |
| interfaceId | bytes4 | undefined   |

#### Returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| \_0  | bool | undefined   |

### tokenImplementation

```solidity
function tokenImplementation() external view returns (address)
```

#### Returns

| Name | Type    | Description |
| ---- | ------- | ----------- |
| \_0  | address | undefined   |

## Events

### AllowListEnabled

```solidity
event AllowListEnabled(bool isAllowListEnabled)
```

Emitted when the allow list is toggled on or off

#### Parameters

| Name               | Type | Description                     |
| ------------------ | ---- | ------------------------------- |
| isAllowListEnabled | bool | the new state of the allow list |

### BondCreated

```solidity
event BondCreated(address newBond, string name, string symbol, address indexed owner, uint256 maturityDate, address indexed paymentToken, address indexed collateralToken, uint256 collateralRatio, uint256 convertibleRatio, uint256 maxSupply)
```

Emitted when a new bond is created

#### Parameters

| Name                      | Type    | Description                                                |
| ------------------------- | ------- | ---------------------------------------------------------- |
| newBond                   | address | The address of the newley deployed bond Inherit createBond |
| name                      | string  | undefined                                                  |
| symbol                    | string  | undefined                                                  |
| owner `indexed`           | address | undefined                                                  |
| maturityDate              | uint256 | undefined                                                  |
| paymentToken `indexed`    | address | undefined                                                  |
| collateralToken `indexed` | address | undefined                                                  |
| collateralRatio           | uint256 | undefined                                                  |
| convertibleRatio          | uint256 | undefined                                                  |
| maxSupply                 | uint256 | undefined                                                  |

### RoleAdminChanged

```solidity
event RoleAdminChanged(bytes32 indexed role, bytes32 indexed previousAdminRole, bytes32 indexed newAdminRole)
```

#### Parameters

| Name                        | Type    | Description |
| --------------------------- | ------- | ----------- |
| role `indexed`              | bytes32 | undefined   |
| previousAdminRole `indexed` | bytes32 | undefined   |
| newAdminRole `indexed`      | bytes32 | undefined   |

### RoleGranted

```solidity
event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)
```

#### Parameters

| Name              | Type    | Description |
| ----------------- | ------- | ----------- |
| role `indexed`    | bytes32 | undefined   |
| account `indexed` | address | undefined   |
| sender `indexed`  | address | undefined   |

### RoleRevoked

```solidity
event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)
```

#### Parameters

| Name              | Type    | Description |
| ----------------- | ------- | ----------- |
| role `indexed`    | bytes32 | undefined   |
| account `indexed` | address | undefined   |
| sender `indexed`  | address | undefined   |
