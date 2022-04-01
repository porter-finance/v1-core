// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.9;

import {Bond} from "../Bond.sol";
import {TestERC20} from "../test/TestERC20.sol";

contract EchidnaHelper {
    event AssertionFailed(string);

    address internal deployer = address(0x41414141);
    address internal issuer = address(0x42424242);
    address internal attacker = address(0x43434343);

    uint256 internal constant MAX_INT = 2**256 - 1;
}

/**
    @dev This contract is used in Echidna Testing.
        Instructions to run are located in the README
        This was created for running in assertion mode where
        each function is randomly called in different sequences
        and with different values in order to prove one of the
        assertions false. A quirk with the Bond contract is
        since the contract is a proxy, we instantiate with
        the initialize instead of the constructor. As a result
        all previously external calls were changed to public.
*/
contract TestBond is Bond, EchidnaHelper {
    uint256 public constant MAX_SUPPLY = 50000000 ether;
    uint256 internal constant COLLATERAL_RATIO = 1.5 ether;
    uint256 internal constant CONVERTIBLE_RATIO = .5 ether;
    TestERC20 internal _paymentToken;
    TestERC20 internal _collateralToken;

    constructor() {
        _paymentToken = new TestERC20("PT", "PT", MAX_INT, 18);
        _collateralToken = new TestERC20("CT", "CT", MAX_INT, 18);

        initialize(
            "bondName",
            "bondSymbol",
            issuer,
            block.timestamp + 365 days,
            address(_paymentToken),
            address(_collateralToken),
            COLLATERAL_RATIO,
            CONVERTIBLE_RATIO,
            MAX_SUPPLY
        );
        _collateralToken.transfer(issuer, MAX_INT);
        _paymentToken.transfer(issuer, MAX_INT);
    }

    function approvePaymentTokenForBond() public {
        _paymentToken.approve(address(this), MAX_INT);
    }

    function approveCollateralTokenForBond() public {
        _collateralToken.approve(address(this), MAX_INT);
        assert(_collateralToken.allowance(msg.sender, address(this)) > 0);
    }

    function mintShares(uint256 shares) public {
        if (
            _collateralToken.allowance(msg.sender, address(this)) >=
            (MAX_SUPPLY * COLLATERAL_RATIO) / ONE
        ) {
            assert(false);
            uint256 balanceBefore = balanceOf(msg.sender);
            shares = shares % MAX_SUPPLY;
            mint(shares);
            if (balanceOf(msg.sender) != balanceBefore + shares) {
                emit AssertionFailed("shares invariant");
            }
            if (totalSupply() > MAX_SUPPLY) {
                emit AssertionFailed("max supply invariant");
            }
            if (
                _collateralToken.balanceOf(address(this)) <
                (totalSupply() * COLLATERAL_RATIO) / ONE
            ) {
                emit AssertionFailed("invalid collateral in contract");
            }
        }
    }

    function mintSharesAlwaysReverts(uint256 sharesToMint) public {
        sharesToMint = sharesToMint % MAX_SUPPLY;
        if (
            _collateralToken.allowance(msg.sender, address(this)) <
            (sharesToMint * COLLATERAL_RATIO) / ONE
        ) {
            mint(sharesToMint);
        }
    }

    function convertShares(uint256 sharesToConvert) public {
        sharesToConvert = sharesToConvert % MAX_SUPPLY;
        uint256 sharesBeforeConversion = balanceOf(msg.sender);
        if (sharesBeforeConversion >= sharesToConvert) {
            uint256 balanceBefore = _collateralToken.balanceOf(msg.sender);
            convert(sharesToConvert);
            if (
                _collateralToken.balanceOf(msg.sender) !=
                balanceBefore + (sharesToConvert * CONVERTIBLE_RATIO) / ONE
            ) {
                emit AssertionFailed("convertShares collateral invariant");
            }
            if (
                balanceOf(msg.sender) !=
                sharesBeforeConversion - sharesToConvert
            ) {
                emit AssertionFailed("convertShares bond invariant");
            }
        }
    }

    function payAmount(uint256 amountToPay) public {
        amountToPay = amountToPay % MAX_SUPPLY;
        if (
            _paymentToken.allowance(msg.sender, address(this)) > amountToPay &&
            _paymentToken.balanceOf(msg.sender) > amountToPay
        ) {
            pay(amountToPay);
        }
    }

    function redeemAmount(uint256 amountToRedeem) public {
        if (balanceOf(msg.sender) >= amountToRedeem) {
            uint256 balanceBefore = _paymentToken.balanceOf(msg.sender);
            redeem(amountToRedeem);
            if (
                _paymentToken.balanceOf(msg.sender) !=
                balanceBefore + amountToRedeem
            ) {
                emit AssertionFailed("redeem payment invariant");
            }
        }
    }

    function redeemAlwaysReverts(uint256 amountToRedeem) public {
        if (balanceOf(msg.sender) < amountToRedeem) {
            redeem(amountToRedeem);
        }
    }
}
