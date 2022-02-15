# Contracts Overview

# Main contracts

## [Broker](./broker.md)
* Initiates the Bond Auction

### Auction 
Borrowers have the option to use an auction to sell their bonds. The borrower sets the parameters of the auction then a gnosis auction is created.

## BondFactory
This uses [CloneFactory](https://github.com/porter-finance/v1-core/issues/15) for significant gas savings. 
* Creates the `bondTokens` (collateral address, amount, convertibility, convertibility ratio) all parameters.

## [BondTokens](./bondToken.md)

`BondTokens` represent [zero coupon bonds](https://docs.porter.finance/portal/intro-to-bonds/zero-coupon-bonds) that can be purchased by [lenders](https://docs.porter.finance/portal/protocol/lenders). They implement the standard EIP-20/ERC20 token methods as well as Porter specific methods including:
* `depositCollateral()`
* `withdrawCollateral()`
* `convertBond()`
* `repayBond()`
* `redeemBond()`


A new `BondToken` is created for each [borrower](https://docs.porter.finance/portal/protocol/borrowers)

BondTokens support the following functionality: 

* Depositing/withdrawing collateral
* Handling convertibility
* Handling repayment
* Allowing bond redemption

### Collateral 
Borrowers specify the ERC20 token they would like to use as collateral when creating the bond. Only a single collateral type is supported per bond.

### Convertibility 
If convertability in enabled for the bond, 
Bondholders will have an option to redeem their bond tokens for the underlying collateral at a predefined ratio. 
For example - when the bond is created the ratio may be 1 bond : .5. This gives the lenders equity upside where they can redeem their bonds for the underlying token if the collateral token goes up in price. Convertibility cannot be changed once set and after repayment, the bond can no longer be redeemed for the underlying collateral.

### Repayment
This gives the ability for a borrower to repay their debt. Repaying unlocks their collateral and sets the bond state to `paid`.

### Bond Redemption
#### if repaid 
Bonds can be redeemed for a pro rata share of the repayment amount. 
#### if defaulted
Bonds can be redeemed for a pro rata share of the collateral + repayment amount. 

TODO: below needs rethought

Bondholder tokens are not burnt on default - instead they are set to a `defaulted` state and are used to represent the debt still owed to the lenders.






# Design Decisions 

## No Oracles
* We are designing the protocol in a way that we can avoid price oracles

## Broker pattern vs token pattern
* https://github.com/porter-finance/v1-core/issues/29

## Allow multiple ways of selling bonds
* Bonds should be decoupled from gnosis auction. Gnosis auction is just a mechanism for selling the bonds. They should be designed in a way where they could be sold directly to lenders - or through other means. 


## Supporting multiple collateral types
* https://github.com/porter-finance/v1-core/issues/28

## Upgradability strategy
 * https://github.com/porter-finance/v1-core/issues/40
