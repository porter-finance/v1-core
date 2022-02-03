// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract BondToken is ERC20 {
    constructor(
        string memory name,
        string memory symbol,
        uint96 _mintAmount
    ) public ERC20(name, symbol) {
        _mint(msg.sender, _mintAmount);
    }
}