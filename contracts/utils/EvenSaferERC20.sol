// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.9;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "hardhat/console.sol";

library EvenSaferERC20 {
    /// @notice unexpected amount returned on external token transfer
    error UnexpectedTokenOperation();

    using SafeERC20 for IERC20Metadata;

    /**
        @dev returns the balance of this contract before and after a transfer into it
            safeTransferFrom is used to revert on any non-success return from the transfer
            the actual delta of tokens is returned to keep accurate balance in the case where the token has a fee
        @param token the ERC20 token being transferred from
        @param from the sender
        @param value the total number of tokens being transferred
    */
    function safeTransferIn(
        IERC20Metadata token,
        address from,
        address to,
        uint256 value
    ) internal returns (uint256) {
        uint256 balanceBefore = token.balanceOf(to);
        token.safeTransferFrom(from, to, value);
        uint256 balanceAfter = token.balanceOf(to);

        if (balanceAfter <= balanceBefore) {
            revert UnexpectedTokenOperation();
        }
        return balanceAfter - balanceBefore;
    }
}
