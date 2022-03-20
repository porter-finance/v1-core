# Bond

_Porter Finance_

> Bond

A custom ERC20 token that can be used to issue bonds.The contract handles issuance, conversion, and redemption of bonds.

_External calls to tokens used for collateral and payment are used throughout to transfer and check balances_

## Methods

### DEFAULT_ADMIN_ROLE

```solidity
function DEFAULT_ADMIN_ROLE() external view returns (bytes32)
```

#### Returns

| Name | Type    | Description |
| ---- | ------- | ----------- |
| \_0  | bytes32 | undefined   |

### MINT_ROLE

```solidity
function MINT_ROLE() external view returns (bytes32)
```

this role permits the minting of bonds

_this is assigned to owner in `initialize` the owner can assign other addresses with this role to enable their minting_

#### Returns

| Name | Type    | Description |
| ---- | ------- | ----------- |
| \_0  | bytes32 | undefined   |

### WITHDRAW_ROLE

```solidity
function WITHDRAW_ROLE() external view returns (bytes32)
```

this role permits the withdraw of collateral from the contract

_this is assigned to owner in `initialize` the owner can assign other addresses with this role to enable their withdraw_

#### Returns

| Name | Type    | Description |
| ---- | ------- | ----------- |
| \_0  | bytes32 | undefined   |

### allowance

```solidity
function allowance(address owner, address spender) external view returns (uint256)
```

_See {IERC20-allowance}._

#### Parameters

| Name    | Type    | Description |
| ------- | ------- | ----------- |
| owner   | address | undefined   |
| spender | address | undefined   |

#### Returns

| Name | Type    | Description |
| ---- | ------- | ----------- |
| \_0  | uint256 | undefined   |

### approve

```solidity
function approve(address spender, uint256 amount) external nonpayable returns (bool)
```

_See {IERC20-approve}. NOTE: If `amount` is the maximum `uint256`, the allowance is not updated on `transferFrom`. This is semantically equivalent to an infinite approval. Requirements: - `spender` cannot be the zero address._

#### Parameters

| Name    | Type    | Description |
| ------- | ------- | ----------- |
| spender | address | undefined   |
| amount  | uint256 | undefined   |

#### Returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| \_0  | bool | undefined   |

### balanceOf

```solidity
function balanceOf(address account) external view returns (uint256)
```

_See {IERC20-balanceOf}._

#### Parameters

| Name    | Type    | Description |
| ------- | ------- | ----------- |
| account | address | undefined   |

#### Returns

| Name | Type    | Description |
| ---- | ------- | ----------- |
| \_0  | uint256 | undefined   |

### burn

```solidity
function burn(uint256 amount) external nonpayable
```

_Destroys `amount` tokens from the caller. See {ERC20-\_burn}._

#### Parameters

| Name   | Type    | Description |
| ------ | ------- | ----------- |
| amount | uint256 | undefined   |

### burnFrom

```solidity
function burnFrom(address account, uint256 amount) external nonpayable
```

_Destroys `amount` tokens from `account`, deducting from the caller&#39;s allowance. See {ERC20-\_burn} and {ERC20-allowance}. Requirements: - the caller must have allowance for `accounts`&#39;s tokens of at least `amount`._

#### Parameters

| Name    | Type    | Description |
| ------- | ------- | ----------- |
| account | address | undefined   |
| amount  | uint256 | undefined   |

### collateralRatio

```solidity
function collateralRatio() external view returns (uint256)
```

the ratio of collateral tokens per bond with

_this amount is expressed as a deviation from 1-to-1 (equal to 1e18)_

#### Returns

| Name | Type    | Description |
| ---- | ------- | ----------- |
| \_0  | uint256 | undefined   |

### collateralToken

```solidity
function collateralToken() external view returns (address)
```

the address of the ERC20 token used as collateral backing the bond

#### Returns

| Name | Type    | Description |
| ---- | ------- | ----------- |
| \_0  | address | undefined   |

### convert

```solidity
function convert(uint256 bonds) external nonpayable
```

Bond holder can convert their bond to underlying collateral The bond must be convertible and not past maturity

#### Parameters

| Name  | Type    | Description                                                                                       |
| ----- | ------- | ------------------------------------------------------------------------------------------------- |
| bonds | uint256 | the number of bonds which will be burnt and converted into the collateral at the convertibleRatio |

### convertibleRatio

```solidity
function convertibleRatio() external view returns (uint256)
```

the ratio of ERC20 tokens the bonds will convert into

_this amount is expressed as a deviation from 1-to-1 (equal to 1e18) if this ratio is 0, the bond is not convertible. after maturity, the bond is not convertible._

#### Returns

| Name | Type    | Description |
| ---- | ------- | ----------- |
| \_0  | uint256 | undefined   |

### decimals

```solidity
function decimals() external view returns (uint8)
```

_Returns the number of decimals used to get its user representation. For example, if `decimals` equals `2`, a balance of `505` tokens should be displayed to a user as `5.05` (`505 / 10 ** 2`). Tokens usually opt for a value of 18, imitating the relationship between Ether and Wei. This is the value {ERC20} uses, unless this function is overridden; NOTE: This information is only used for *display* purposes: it in no way affects any of the arithmetic of the contract, including {IERC20-balanceOf} and {IERC20-transfer}._

#### Returns

| Name | Type  | Description |
| ---- | ----- | ----------- |
| \_0  | uint8 | undefined   |

### decreaseAllowance

```solidity
function decreaseAllowance(address spender, uint256 subtractedValue) external nonpayable returns (bool)
```

_Atomically decreases the allowance granted to `spender` by the caller. This is an alternative to {approve} that can be used as a mitigation for problems described in {IERC20-approve}. Emits an {Approval} event indicating the updated allowance. Requirements: - `spender` cannot be the zero address. - `spender` must have allowance for the caller of at least `subtractedValue`._

#### Parameters

| Name            | Type    | Description |
| --------------- | ------- | ----------- |
| spender         | address | undefined   |
| subtractedValue | uint256 | undefined   |

#### Returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| \_0  | bool | undefined   |

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

### increaseAllowance

```solidity
function increaseAllowance(address spender, uint256 addedValue) external nonpayable returns (bool)
```

_Atomically increases the allowance granted to `spender` by the caller. This is an alternative to {approve} that can be used as a mitigation for problems described in {IERC20-approve}. Emits an {Approval} event indicating the updated allowance. Requirements: - `spender` cannot be the zero address._

#### Parameters

| Name       | Type    | Description |
| ---------- | ------- | ----------- |
| spender    | address | undefined   |
| addedValue | uint256 | undefined   |

#### Returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| \_0  | bool | undefined   |

### initialize

```solidity
function initialize(string bondName, string bondSymbol, address owner, uint256 _maturityDate, address _paymentToken, address _collateralToken, uint256 _collateralRatio, uint256 _convertibleRatio, uint256 _maxSupply) external nonpayable
```

this function is called one time during initial bond creation and sets up the configuration for the bond

_New bond contract deployed via clone_

#### Parameters

| Name               | Type    | Description                                                           |
| ------------------ | ------- | --------------------------------------------------------------------- |
| bondName           | string  | passed into the ERC20 token                                           |
| bondSymbol         | string  | passed into the ERC20 token                                           |
| owner              | address | ownership of this contract transferred to this address                |
| \_maturityDate     | uint256 | the timestamp at which the bond will mature                           |
| \_paymentToken     | address | the ERC20 token address the bond will be redeemable for at maturity   |
| \_collateralToken  | address | the ERC20 token address for the bond                                  |
| \_collateralRatio  | uint256 | the amount of tokens per bond needed                                  |
| \_convertibleRatio | uint256 | the amount of tokens per bond a convertible bond can be converted for |
| \_maxSupply        | uint256 | undefined                                                             |

### isFullyPaid

```solidity
function isFullyPaid() external view returns (bool)
```

checks if the balance of payment token covers the bond supply

_upscaling the token amount as there could be differing decimals_

#### Returns

| Name | Type | Description                           |
| ---- | ---- | ------------------------------------- |
| \_0  | bool | whether or not the bond is fully paid |

### isMature

```solidity
function isMature() external view returns (bool)
```

checks if the maturity date has passed (including current block timestamp)

#### Returns

| Name | Type | Description                                           |
| ---- | ---- | ----------------------------------------------------- |
| \_0  | bool | whether or not the bond has reached the maturity date |

### maturityDate

```solidity
function maturityDate() external view returns (uint256)
```

A date in the future set at bond creation at which the bond will mature. Before this date, a bond token can be converted if convertible, but cannot be redeemed. After this date, a bond token can be redeemed for the payment token, but cannot be converted.

#### Returns

| Name | Type    | Description |
| ---- | ------- | ----------- |
| \_0  | uint256 | undefined   |

### maxSupply

```solidity
function maxSupply() external view returns (uint256)
```

the max amount of bonds able to be minted and cannot be changed

_checked in the `mint` function to limit `totalSupply` exceeding this number_

#### Returns

| Name | Type    | Description |
| ---- | ------- | ----------- |
| \_0  | uint256 | undefined   |

### mint

```solidity
function mint(uint256 bonds) external nonpayable
```

mints the amount of specified bonds by transferring in collateral

_CollateralDeposit + Mint events are both emitted. bonds to mint is bounded by maxSupply_

#### Parameters

| Name  | Type    | Description                 |
| ----- | ------- | --------------------------- |
| bonds | uint256 | the amount of bonds to mint |

### name

```solidity
function name() external view returns (string)
```

_Returns the name of the token._

#### Returns

| Name | Type   | Description |
| ---- | ------ | ----------- |
| \_0  | string | undefined   |

### pay

```solidity
function pay(uint256 amount) external nonpayable
```

allows the issuer to pay the bond by depositing payment token

_emits PaymentInFull if the full balance has been repaid, PaymentDeposited otherwise the lower of outstandingAmount and amount is chosen to prevent overpayment_

#### Parameters

| Name   | Type    | Description                         |
| ------ | ------- | ----------------------------------- |
| amount | uint256 | the number of payment tokens to pay |

### paymentToken

```solidity
function paymentToken() external view returns (address)
```

The address of the ERC20 token this bond will be redeemable for at maturity

#### Returns

| Name | Type    | Description |
| ---- | ------- | ----------- |
| \_0  | address | undefined   |

### previewConvertBeforeMaturity

```solidity
function previewConvertBeforeMaturity(uint256 bonds) external view returns (uint256)
```

the amount of collateral the given bonds would convert into if able

_this function rounds down the number of returned collateral_

#### Parameters

| Name  | Type    | Description                                                        |
| ----- | ------- | ------------------------------------------------------------------ |
| bonds | uint256 | the amount of bonds that would be burnt to convert into collateral |

#### Returns

| Name | Type    | Description                   |
| ---- | ------- | ----------------------------- |
| \_0  | uint256 | amount of collateral received |

### previewMintBeforeMaturity

```solidity
function previewMintBeforeMaturity(uint256 bonds) external view returns (uint256)
```

preview the amount of collateral tokens required to mint the given bond tokens

_this function rounds up the amount of required collateral for the number of bonds to mint_

#### Parameters

| Name  | Type    | Description                         |
| ----- | ------- | ----------------------------------- |
| bonds | uint256 | the amount of desired bonds to mint |

#### Returns

| Name | Type    | Description                   |
| ---- | ------- | ----------------------------- |
| \_0  | uint256 | amount of collateral required |

### previewRedeemAtMaturity

```solidity
function previewRedeemAtMaturity(uint256 bonds) external view returns (uint256, uint256)
```

the amount of collateral and payment tokens the bonds would redeem for at maturity

#### Parameters

| Name  | Type    | Description                                       |
| ----- | ------- | ------------------------------------------------- |
| bonds | uint256 | the amount of bonds to burn and redeem for tokens |

#### Returns

| Name | Type    | Description                                |
| ---- | ------- | ------------------------------------------ |
| \_0  | uint256 | the amount of payment tokens to receive    |
| \_1  | uint256 | the amount of collateral tokens to receive |

### previewWithdraw

```solidity
function previewWithdraw() external view returns (uint256)
```

the amount of collateral that the issuer would be able to withdraw from the contract

_this function calculates the amount of collateral tokens thatare able to be withdrawn by the issuer. The amount of tokens can increase by bonds being burnt and converted as well as payment made. Each bond is covered by a certain amount of collateral to fulfill collateralRatio and convertibleRatio. For convertible bonds, the totalSupply of bonds must be covered by the convertibleRatio. That means even if all of the bonds were covered by payment, there must still be enough collateral in the contract to cover the outstanding bonds convertible until the maturity date - at which point all collateral will be able to be withdrawn. There are the following scenarios: &quot;total uncovered supply&quot; is the tokens that are not covered by the amount repaid. bond is NOT paid AND NOT mature: to cover collateralRatio = total uncovered supply _ collateralRatio to cover convertibleRatio = total supply _ convertibleRatio bond is NOT paid AND mature to cover collateralRatio = total uncovered supply _ collateralRatio to cover convertibleRatio = 0 (bonds cannot be converted) bond IS paid AND NOT mature to cover collateralRatio = 0 (bonds need not be backed by collateral) to cover convertibleRatio = total supply _ collateral ratio bond IS paid AND mature to cover collateralRatio = 0 to cover convertibleRatio = 0 All outstanding bonds must be covered by the convertibleRatio_

#### Returns

| Name | Type    | Description                       |
| ---- | ------- | --------------------------------- |
| \_0  | uint256 | the amount of collateral received |

### redeem

```solidity
function redeem(uint256 bonds) external nonpayable
```

this function burns bonds in return for the token borrowed against the bond

#### Parameters

| Name  | Type    | Description                            |
| ----- | ------- | -------------------------------------- |
| bonds | uint256 | the amount of bonds to redeem and burn |

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

### sweep

```solidity
function sweep(contract IERC20Metadata token) external nonpayable
```

sends tokens to the issuer that were sent to this contract

_collateral, payment, and the bond itself cannot be swept_

#### Parameters

| Name  | Type                    | Description                                                |
| ----- | ----------------------- | ---------------------------------------------------------- |
| token | contract IERC20Metadata | send the entire token balance of this address to the owner |

### symbol

```solidity
function symbol() external view returns (string)
```

_Returns the symbol of the token, usually a shorter version of the name._

#### Returns

| Name | Type   | Description |
| ---- | ------ | ----------- |
| \_0  | string | undefined   |

### totalCollateral

```solidity
function totalCollateral() external view returns (uint256)
```

gets the external balance of the ERC20 collateral token

#### Returns

| Name | Type    | Description                                    |
| ---- | ------- | ---------------------------------------------- |
| \_0  | uint256 | the amount of collateralTokens in the contract |

### totalPaid

```solidity
function totalPaid() external view returns (uint256)
```

gets the external balance of the ERC20 payment token

#### Returns

| Name | Type    | Description                                 |
| ---- | ------- | ------------------------------------------- |
| \_0  | uint256 | the amount of paymentTokens in the contract |

### totalSupply

```solidity
function totalSupply() external view returns (uint256)
```

_See {IERC20-totalSupply}._

#### Returns

| Name | Type    | Description |
| ---- | ------- | ----------- |
| \_0  | uint256 | undefined   |

### transfer

```solidity
function transfer(address to, uint256 amount) external nonpayable returns (bool)
```

_See {IERC20-transfer}. Requirements: - `to` cannot be the zero address. - the caller must have a balance of at least `amount`._

#### Parameters

| Name   | Type    | Description |
| ------ | ------- | ----------- |
| to     | address | undefined   |
| amount | uint256 | undefined   |

#### Returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| \_0  | bool | undefined   |

### transferFrom

```solidity
function transferFrom(address from, address to, uint256 amount) external nonpayable returns (bool)
```

_See {IERC20-transferFrom}. Emits an {Approval} event indicating the updated allowance. This is not required by the EIP. See the note at the beginning of {ERC20}. NOTE: Does not update the allowance if the current allowance is the maximum `uint256`. Requirements: - `from` and `to` cannot be the zero address. - `from` must have a balance of at least `amount`. - the caller must have allowance for `from`&#39;s tokens of at least `amount`._

#### Parameters

| Name   | Type    | Description |
| ------ | ------- | ----------- |
| from   | address | undefined   |
| to     | address | undefined   |
| amount | uint256 | undefined   |

#### Returns

| Name | Type | Description |
| ---- | ---- | ----------- |
| \_0  | bool | undefined   |

### withdrawCollateral

```solidity
function withdrawCollateral() external nonpayable
```

Withdraw collateral from bond contract the amount of collateral available to be withdrawn depends on the collateralRatio

## Events

### Approval

```solidity
event Approval(address indexed owner, address indexed spender, uint256 value)
```

#### Parameters

| Name              | Type    | Description |
| ----------------- | ------- | ----------- |
| owner `indexed`   | address | undefined   |
| spender `indexed` | address | undefined   |
| value             | uint256 | undefined   |

### CollateralDeposit

```solidity
event CollateralDeposit(address indexed from, address indexed token, uint256 amount)
```

emitted when a collateral is deposited for a bond

#### Parameters

| Name            | Type    | Description                         |
| --------------- | ------- | ----------------------------------- |
| from `indexed`  | address | the address depositing collateral   |
| token `indexed` | address | the address of the collateral token |
| amount          | uint256 | the number of the tokens deposited  |

### CollateralWithdraw

```solidity
event CollateralWithdraw(address indexed from, address indexed token, uint256 amount)
```

emitted when a bond&#39;s issuer withdraws collateral

#### Parameters

| Name            | Type    | Description                         |
| --------------- | ------- | ----------------------------------- |
| from `indexed`  | address | the address withdrawing collateral  |
| token `indexed` | address | the address of the collateral token |
| amount          | uint256 | the number of the tokens withdrawn  |

### Convert

```solidity
event Convert(address indexed from, address indexed collateralToken, uint256 amountOfBondsConverted, uint256 amountOfCollateralTokens)
```

emitted when bond tokens are converted by a borrower

#### Parameters

| Name                      | Type    | Description                              |
| ------------------------- | ------- | ---------------------------------------- |
| from `indexed`            | address | the address converting their tokens      |
| collateralToken `indexed` | address | the address of the collateral received   |
| amountOfBondsConverted    | uint256 | the number of burnt bonds                |
| amountOfCollateralTokens  | uint256 | the number of collateral tokens received |

### Mint

```solidity
event Mint(address indexed from, uint256 amount)
```

emitted when bonds are minted

#### Parameters

| Name           | Type    | Description                |
| -------------- | ------- | -------------------------- |
| from `indexed` | address | the address minting        |
| amount         | uint256 | the amount of bonds minted |

### Payment

```solidity
event Payment(address indexed from, uint256 amount)
```

emitted when a portion of the bond&#39;s principal is paid

#### Parameters

| Name           | Type    | Description                     |
| -------------- | ------- | ------------------------------- |
| from `indexed` | address | the address depositing payment  |
| amount         | uint256 | the amount of payment deposited |

### PaymentInFull

```solidity
event PaymentInFull(address indexed from, uint256 amount)
```

emitted when all of the bond&#39;s principal is paid back

#### Parameters

| Name           | Type    | Description                                |
| -------------- | ------- | ------------------------------------------ |
| from `indexed` | address | the address depositing payment             |
| amount         | uint256 | the amount deposited to fully pay the bond |

### Redeem

```solidity
event Redeem(address indexed from, address indexed paymentToken, address indexed collateralToken, uint256 amountOfBondsRedeemed, uint256 amountOfPaymentTokensReceived, uint256 amountOfCollateralTokens)
```

emitted when a bond is redeemed

#### Parameters

| Name                          | Type    | Description                               |
| ----------------------------- | ------- | ----------------------------------------- |
| from `indexed`                | address | the bond holder whose bonds are burnt     |
| paymentToken `indexed`        | address | the address of the payment token          |
| collateralToken `indexed`     | address | the address of the collateral token       |
| amountOfBondsRedeemed         | uint256 | the amount of bonds burned for redemption |
| amountOfPaymentTokensReceived | uint256 | the amount of payment tokens              |
| amountOfCollateralTokens      | uint256 | the amount of collateral tokens           |

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

### Transfer

```solidity
event Transfer(address indexed from, address indexed to, uint256 value)
```

#### Parameters

| Name           | Type    | Description |
| -------------- | ------- | ----------- |
| from `indexed` | address | undefined   |
| to `indexed`   | address | undefined   |
| value          | uint256 | undefined   |

## Errors

### BondNotYetMatured

```solidity
error BondNotYetMatured()
```

operation restricted because the bond is not yet mature

### BondPastMaturity

```solidity
error BondPastMaturity()
```

operation restricted because the bond has matured

### BondSupplyExceeded

```solidity
error BondSupplyExceeded()
```

attempted to mint bonds that would exceeded maxSupply

### CollateralRatioLessThanConvertibleRatio

```solidity
error CollateralRatioLessThanConvertibleRatio()
```

collateralRatio must be greater than convertibleRatio

### InvalidMaturityDate

```solidity
error InvalidMaturityDate()
```

maturity date is not valid

### PaymentMet

```solidity
error PaymentMet()
```

attempted to pay after payment was met

### SweepDisallowedForToken

```solidity
error SweepDisallowedForToken()
```

attempted to sweep a token used in the contract

### TokenOverflow

```solidity
error TokenOverflow()
```

unexpected amount returned on external token transfer

### ZeroAmount

```solidity
error ZeroAmount()
```

attempted to perform an action that would do nothing
