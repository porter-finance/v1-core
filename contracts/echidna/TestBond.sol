// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.9;

import {Bond} from "../Bond.sol";
import {TestERC20} from "../test/TestERC20.sol";

contract TestBond {
    event AssertionFailed(string);
    Bond public bond;

    TestERC20 public paymentToken;
    TestERC20 public collateralToken;

    uint256 public constant MAX_SUPPLY = 50000000 ether;
    uint256 internal constant COLLATERAL_RATIO = 1.5 ether;
    uint256 internal constant CONVERTIBLE_RATIO = .5 ether;
    uint256 internal constant ONE = 1e18;
    uint256 internal constant MAX_INT = 2**256 - 1;

    constructor() {
        paymentToken = new TestERC20("PT", "PT", MAX_INT, 18);
        collateralToken = new TestERC20("CT", "CT", MAX_INT, 18);

        bond = new Bond();
        bond.initialize(
            "bondName",
            "bondSymbol",
            address(this),
            block.timestamp + 365 days,
            address(paymentToken),
            address(collateralToken),
            COLLATERAL_RATIO,
            CONVERTIBLE_RATIO,
            MAX_SUPPLY
        );
        collateralToken.transfer(address(this), MAX_INT);
        paymentToken.transfer(address(this), MAX_INT);
    }

    function approvePaymentTokenForBond() public {
        try paymentToken.approve(address(bond), MAX_INT) {} catch Error(
            string memory reason
        ) {
            emit AssertionFailed(reason);
        }
    }

    function approveCollateralTokenForBond() public {
        try collateralToken.approve(address(bond), MAX_INT) {} catch Error(
            string memory reason
        ) {
            emit AssertionFailed(reason);
        }
    }

    function mintShares(uint256 shares) public {
        if (
            collateralToken.allowance(address(this), address(bond)) >=
            (MAX_SUPPLY * COLLATERAL_RATIO) / ONE
        ) {
            uint256 balanceBefore = bond.balanceOf(address(this));
            shares = shares % MAX_SUPPLY;
            try bond.mint(shares) {} catch Error(string memory reason) {
                emit AssertionFailed(reason);
            }
            if (bond.balanceOf(address(this)) != balanceBefore + shares) {
                emit AssertionFailed("shares invariant");
            }
            if (bond.totalSupply() > MAX_SUPPLY) {
                emit AssertionFailed("max supply invariant");
            }
            if (
                collateralToken.balanceOf(address(bond)) <
                (bond.totalSupply() * COLLATERAL_RATIO) / ONE
            ) {
                emit AssertionFailed("invalid collateral in contract");
            }
        }
    }

    function mintSharesAlwaysReverts(uint256 sharesToMint) public {
        sharesToMint = sharesToMint % MAX_SUPPLY;
        if (
            collateralToken.allowance(address(this), address(bond)) <
            (sharesToMint * COLLATERAL_RATIO) / ONE
        ) {
            try bond.mint(sharesToMint) {
                emit AssertionFailed("mint didn't always revert");
            } catch {}
        }
    }

    function convertShares(uint256 sharesToConvert) public {
        sharesToConvert = sharesToConvert % MAX_SUPPLY;
        uint256 sharesBeforeConversion = bond.balanceOf(address(this));
        if (sharesBeforeConversion >= sharesToConvert) {
            uint256 balanceBefore = collateralToken.balanceOf(address(this));
            try bond.convert(sharesToConvert) {} catch Error(
                string memory reason
            ) {
                emit AssertionFailed(reason);
            }
            if (
                collateralToken.balanceOf(address(this)) !=
                balanceBefore + (sharesToConvert * CONVERTIBLE_RATIO) / ONE
            ) {
                emit AssertionFailed("convertShares collateral invariant");
            }
            if (
                bond.balanceOf(address(this)) !=
                sharesBeforeConversion - sharesToConvert
            ) {
                emit AssertionFailed("convertShares bond invariant");
            }
        }
    }

    function pay(uint256 amountToPay) public {
        amountToPay = amountToPay % MAX_SUPPLY;
        if (
            paymentToken.allowance(address(this), address(bond)) >
            amountToPay &&
            paymentToken.balanceOf(address(this)) > amountToPay
        ) {
            try bond.pay(amountToPay) {} catch Error(string memory reason) {
                emit AssertionFailed(reason);
            }
        }
    }

    function redeem(uint256 amountToRedeem) public {
        if (bond.balanceOf(address(this)) >= amountToRedeem) {
            uint256 balanceBefore = paymentToken.balanceOf(address(this));
            try bond.redeem(amountToRedeem) {} catch Error(
                string memory reason
            ) {
                emit AssertionFailed(reason);
            }
            if (
                paymentToken.balanceOf(address(this)) !=
                balanceBefore + amountToRedeem
            ) {
                emit AssertionFailed("redeem payment invariant");
            }
        }
    }

    function redeemAlwaysReverts(uint256 amountToRedeem) public {
        if (bond.balanceOf(address(this)) < amountToRedeem) {
            try bond.redeem(amountToRedeem) {
                emit AssertionFailed("redeem doesn't always revert");
            } catch {}
        }
    }
}
