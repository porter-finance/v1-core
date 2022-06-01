# V1 Architecture


# Flowcharts

## Initialize BondFactory Contract
The Bond Factory contract is deployed and created by the Porter Admin (multi-sig). The contract assigns the admin role to the deployer and the proxy contract is initialized with the token implementation (Bond contract).
```mermaid
  flowchart RL
    BondFactory--grant admin role---->porterAdmin
    tokenImplementation<-.uses.->BondFactory
    porterAdmin((Porter Admin))--deploys---->BondFactory
    tokenImplementation[token implementation]
```
## CreateBond
After the Bond Factory has been created, the issuer can create a Bond if they are on the allowed issuer list and the token used is on the allowed token list. The Bonds are created (minted) at the same time that the collateral is deposited.
```mermaid
  flowchart LR
    issuer((Issuer))
    subgraph BondFactory [BondFactory]
      createBond
      issuerRole{Issuer list Enabled\nand\nhas ISSUER_ROLE}
      allowedToken{Token list Enabled\nand\nhas ALLOWED_TOKEN}
      NewBond[New Bond]
      deposit["deposit collateral (_deposit)"]
    end
    NewBond[New Bond]
    createBond-->issuerRole & allowedToken
    issuerRole & allowedToken-->deposit
    deposit-->NewBond
    issuer-->createBond
```
## Bond Actions
Issuers and Bond Holders can both interact with the bond in a few ways.

```mermaid
  flowchart LR
    subgraph Bond [Bond]
      redeem
      convert
      pay
      withdrawExcessCollateral
      withdrawExcessPayment
    end
    issuer((Issuer))
    bondHolder((Bond Holder))

    issuer-->pay
    issuer-->withdrawExcessCollateral
    issuer-->withdrawExcessPayment
    bondHolder<--burn bonds for collateral---->convert
    bondHolder<--burn bonds for payment---->redeem
```

## ER Diagram
There are two entities in the protocol. A Bond and a BondFactory.  

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
