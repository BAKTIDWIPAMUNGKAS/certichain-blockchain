// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IStakeTarget2 {
    function depositStake() external payable;
    function withdrawStake() external;
}

/// @notice Mock penerima yang menolak ETH (tidak punya receive/fallback) - untuk menguji penanganan error transfer.
contract RejectingReceiver {
    function deposit(address target) external payable { IStakeTarget2(target).depositStake{value: msg.value}(); }
    function withdraw(address target) external { IStakeTarget2(target).withdrawStake(); }
}
