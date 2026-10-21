// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
// Kasus debugging terkontrol: dua kesalahan umum pada fungsi penerbitan.
contract Broken {
    mapping(bytes32 => address) public issuerOf;
    function issue(bytes32 docHash, uint256 expiresAt) external returns (uint64) {
        uint64 exp = expiresAt;          // KESALAHAN 1: konversi implisit uint256 -> uint64 tidak diizinkan
        issuerOf[docHash] = msg.sender
        return exp;                      // KESALAHAN 2: titik koma hilang di baris sebelumnya
    }
}
