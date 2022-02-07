// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Bond {
  address _tokenContract;
  address _recipient;
  uint256 _startDate;
  uint256 _interval;

  constructor(
    address tokenContract_,
    address recipient_,
    uint256 interval_
  ) {
    _tokenContract = tokenContract_;
    _startDate = block.timestamp;
    _interval = interval_;
    _recipient = recipient_;
  }

  function recipient() external view returns (address) {
    return _recipient;
  }

  function startDate() external view returns (uint256) {
    return _startDate;
  }

  function withdraw() external returns (uint256) {
    uint256 _owed = (block.timestamp - _startDate) / _interval;
    if (IERC20(_tokenContract).transfer(_recipient, _owed)) {
      // happy path, transferred the owed balance to the recipient
      return _owed;
    } else {
      uint256 _available = IERC20(_tokenContract).balanceOf(address(this));
      require(
        _available < _owed,
        "I could not transfer these tokens even though I possess them. This probably indicates a buggy ERC20 contract."
      );
      require(
        IERC20(_tokenContract).transfer(_recipient, _available * _coupon),
        "Could not even transfer the tokens that the contract owns. This probably indicates a buggy ERC20 contract."
      );
      return _available;
    }
  }
}
