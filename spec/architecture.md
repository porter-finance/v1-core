# V1 Architecture

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
