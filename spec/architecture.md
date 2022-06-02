# V1 Architecture

The V1 Architecture consists of a [Bond](/contracts/Bond.sol) and an OpenZeppelin clone factory, [BondFactory](/contracts/BondFactory.sol), to create new instances of the Bond contract.

## Entities
The two entities, Bond and BondFactory, make up the protocol.  

An Issuer (EOA) first creates a Bond comprised of many bond shares via the BondFactory. The Issuer can then distribute those bond shares to BondHolder(s) (EOA(s)).  

```mermaid
erDiagram
    Issuer-EOA }|..|| BondFactory: uses
    Issuer-EOA ||--|{ Bond : creates
    Bond ||--o{ BondHolder-EOA : has
    Bond {
        string bondName
        string bondSymbol
        address bondOwner
        uint256 maturity
        address paymentToken
        address collateralToken
        uint256 collateralRatio
        uint256 convertibleRatio
        uint256 maxSupply
    }
    BondFactory {
        uint256 MAX_TIME_TO_MATURITY "3650"
        uint8 MAX_DECIMALS "18"
        bytes32 ISSUER_ROLE
        bytes32 ALLOWED_TOKEN
        address tokenImplementation
        mapping isBond "(address => bool)"
        bool isIssuerAllowListEnabled
        bool isTokenAllowListEnabled
    }
```

## Lifecycle

A typical lifecycle starts from issuance and ends when all bond shares have either been redeemed / converted by the bond holders, or burnt by the issuer.

### 1. Porter Finance Initializes BondFactory Contract
The Bond Factory contract is deployed by the Porter Admin (multi-sig). The contract assigns the admin role to the deployer and the proxy contract is [initialized](/contracts/BondFactory.sol#L97) with the token implementation (Bond contract).
```mermaid
  flowchart RL
    BondFactory--grant admin role---->porterAdmin
    Bond<-.uses.->BondFactory
    porterAdmin((Porter Admin))--deploys---->BondFactory
    Bond["Bond (tokenImplementation)"]
```
### 2. Issuer Contacts Porter Finance
   - Porter Finance evaluates Issuer's credit worthyness
   - Porter Finance creates parameters for the issuance
     - Amount of ERC20 token backing each share (Collateral Token)
     - Amount of collateral each share would convert into
     - Maturity date 
     - Total issuance size
     - The ERC20 token the Bond is denominated in (Payment Token)
   - Porter Finance adds Issuer to allow list
   - Porter Finance adds Collateral Token & Payment Token to allow list
   
### 3. Issuer Creates a Bond
After the issuance has been approved, the issuer will be on the allowed issuer list and their intended collateral token and payment token will be added to the allowed token list. The Bonds are created (minted) at the same time that the collateral is deposited. After a Bond is created, the issuer can sell the Bond through the [Porter Finance App](https://app.porter.finance) (we use [Gnosis' Batch Auction](https://github.com/gnosis/ido-contracts)).

These are sold as [Zero Coupon Bonds](https://docs.porter.finance/portal/financial-concepts/zero-coupon-bonds). Another party will purchase these bond shares at a discount by paying with the Payment Token. The purchasers are known as **bond holders**. At maturity, the bond holders can redeem their bond shares at 1 to 1 for Payment Tokens.

```mermaid
  flowchart LR
    issuer((Issuer))
    subgraph Bond Factory
    issuerList{Is issuer allow list enabled?}
    tokenList{Is token allow list enabled?}
    hasIssuerRole{Has Issuer Role?}
    hasTokenRole{Has Token Role?}
    createBond[Create Bond]
    deposit{Has enough collateral?}
    NewBond[Deposit & Create new Bond]
    end
    
    issuer--with configuration-->createBond
    createBond-->issuerList
    issuerList--yes-->hasIssuerRole
    issuerList--no-->tokenList
    tokenList--yes-->hasTokenRole
    tokenList--no-->deposit
    hasIssuerRole--yes-->tokenList
    hasTokenRole--yes-->deposit
    hasIssuerRole & hasTokenRole--no-->End
    deposit--yes-->NewBond
    deposit--no-->End
```
### Bond Actions
Issuers and Bond Holders can both interact with the bond in a few ways.

#### Issuers
```mermaid
  flowchart LR
    subgraph Bond [Bond]
      pay
      withdrawExcessCollateral
      withdrawExcessPayment
      sweep
    end
    issuer((Issuer))

    issuer-->pay
    issuer-->withdrawExcessCollateral
    issuer-->withdrawExcessPayment
    issuer-->sweep
```

#### Bond Holders

```mermaid
  flowchart LR
    subgraph Bond [Bond]
      redeem
      convert
    end
    bondHolder((Bond Holder))

    bondHolder<--burn bonds for collateral---->convert
    bondHolder<--burn bonds for payment---->redeem
```


