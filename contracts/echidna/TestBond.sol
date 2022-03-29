// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.9;

import {Bond} from "../Bond.sol";
import {TestERC20} from "../test/TestERC20.sol";

contract TestBond {
    address public echidnaCaller = msg.sender;

    Bond public bond;

    TestERC20 public paymentToken;
    TestERC20 public collateralToken;

    uint256 public constant MAX_SUPPLY = 50000000 ether;
    uint256 public constant COLLATERAL_RATIO = 1.5 ether;
    uint256 public constant CONVERTIBLE_RATIO = .5 ether;
    uint256 public constant ONE = 1e18;

    constructor() {
        paymentToken = new TestERC20("PT", "PT", MAX_SUPPLY, 18);
        collateralToken = new TestERC20("CT", "CT", MAX_SUPPLY, 18);
        bond = new Bond();
        bond.initialize(
            "bondName",
            "bondSymbol",
            echidnaCaller,
            block.timestamp + 365 days,
            address(paymentToken),
            address(collateralToken),
            COLLATERAL_RATIO,
            CONVERTIBLE_RATIO,
            MAX_SUPPLY
        );
        paymentToken.approve(address(bond), MAX_SUPPLY);
        collateralToken.approve(address(bond), MAX_SUPPLY);
    }

    function echidna_total_supply_not_exceeded() public view returns (bool) {
        return bond.totalSupply() <= MAX_SUPPLY;
    }

    function echidna_balance_under_total_supply() public view returns (bool) {
        return bond.balanceOf(msg.sender) <= bond.totalSupply();
    }

    function echidna_collateral_ratio_correct() public view returns (bool) {
        return
            (bond.totalSupply() * COLLATERAL_RATIO) / ONE ==
            collateralToken.balanceOf(address(bond));
    }

    function echidna_is_not_mature() public view returns (bool) {
        return !bond.isMature();
    }

    function echidna_is_not_fully_paid() public view returns (bool) {
        return bond.totalSupply() > 0 || !bond.isFullyPaid();
    }

    function echidna_is_not_supplied() public view returns (bool) {
        return bond.totalSupply() == 0;
    }

    function echidna_is_not_collateralized() public view returns (bool) {
        return collateralToken.balanceOf(address(bond)) == 0;
    }

    function balanceOf_never_reverts(address addr) public {
        try bond.balanceOf(addr) {} catch {
            assert(false);
        }
    }

    function previewMintBeforeMaturity_never_reverts(uint256 val) public {
        if (collateralToken.balanceOf(echidnaCaller) >= val) {
            try bond.previewMintBeforeMaturity(val) {} catch {
                assert(false);
            }
        }
    }

    function previewWithdraw_never_reverts(uint256 val) public {
        if (collateralToken.balanceOf(echidnaCaller) >= val) {
            try bond.previewWithdraw() {} catch {
                assert(false);
            }
        }
    }

    function previewRedeemAtMaturity_never_reverts(uint256 val) public {
        if (collateralToken.balanceOf(echidnaCaller) >= val) {
            try bond.previewRedeemAtMaturity(val) {} catch {
                assert(false);
            }
        }
    }

    function totalPaid_never_reverts(uint256 val) public {
        if (collateralToken.balanceOf(echidnaCaller) >= val) {
            try bond.totalPaid() {} catch {
                assert(false);
            }
        }
    }

    function totalCollateral_never_reverts(uint256 val) public {
        if (collateralToken.balanceOf(echidnaCaller) >= val) {
            try bond.totalCollateral() {} catch {
                assert(false);
            }
        }
    }

    function mint_can_revert(uint256 val) public {
        val = 1 ether;
        if (
            val + bond.totalSupply() <= bond.maxSupply() &&
            collateralToken.balanceOf(echidnaCaller) >=
            bond.previewMintBeforeMaturity(val)
        ) {
            try bond.mint(val) {
                assert(false);
            } catch {}
        }
    }

    function convert_can_revert(uint256 val) public {
        if (collateralToken.balanceOf(echidnaCaller) < val) {
            try bond.convert(val) {
                assert(false);
            } catch {}
        }
    }

    function withdrawCollateral_can_revert(uint256 val) public {
        if (bond.balanceOf(echidnaCaller) < val) {
            try bond.withdrawCollateral() {
                assert(false);
            } catch {}
        }
    }

    function pay_can_revert(uint256 val) public {
        if (bond.balanceOf(echidnaCaller) < val) {
            try bond.pay(val) {
                assert(false);
            } catch {}
        }
    }

    function redeem_can_revert(uint256 val) public {
        if (bond.balanceOf(echidnaCaller) < val) {
            try bond.redeem(val) {
                assert(false);
            } catch {}
        }
    }

    function sweep_can_revert(address addr) public {
        if (TestERC20(addr).balanceOf(echidnaCaller) > 0) {
            try bond.sweep(TestERC20(addr)) {
                assert(false);
            } catch {}
        }
    }

    function deposit_withdraw_shares_never_reverts(uint256 val) public {
        uint256 bondBalanceBefore = bond.balanceOf(echidnaCaller);
        uint256 collateralBalanceBefore = collateralToken.balanceOf(
            echidnaCaller
        );
        if (bondBalanceBefore >= val) {
            try bond.convert(val) {
                assert(false);
            } catch {
                assert(false);
            }
            uint256 collateralBalanceAfter = collateralToken.balanceOf(
                echidnaCaller
            );
            assert(collateralBalanceAfter > collateralBalanceBefore);
        }
    }

    // function _safeTransferIn_can_revert(uint256 val) public {
    //     if (bond.balanceOf(echidnaCaller) < val) {
    //         (bool b, ) = address(bond).call(
    //             abi.encodeWithSignature(
    //                 "_safeTransferIn(address, address, uint256)",
    //                 val
    //             )
    //         );
    //     }
    // }

    // function _computeScalingFactor_can_revert(uint256 val) public {
    //     if (bond.balanceOf(echidnaCaller) < val) {
    //         try bond._computeScalingFactor(collateralToken) {
    //             assert(false);
    //         } catch {}
    //     }
    // }

    // function _upscale_can_revert(uint256 val) public {
    //     if (bond.balanceOf(echidnaCaller) < val) {
    //         try bond._upscale(uint256) {
    //             assert(false);
    //         } catch {}
    //     }
    // }
}
