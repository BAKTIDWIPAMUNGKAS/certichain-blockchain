// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ICertificateRegistry} from "../interfaces/ICertificateRegistry.sol";

/// @title CertLib - fungsi murni/pembantu untuk identitas dan status sertifikat
library CertLib {
    /// @dev ID terikat pada (issuer, docHash) sehingga issuer lain tidak dapat "menyerobot" ID yang sama (lihat temuan A-03).
    function computeId(address issuer, bytes32 docHash) internal pure returns (bytes32) {
        return keccak256(abi.encode(issuer, docHash));
    }

    /// @dev Status efektif: Valid otomatis menjadi Expired bila waktu blok >= expiresAt (0 = tidak kedaluwarsa).
    function effectiveStatus(ICertificateRegistry.Status stored, uint64 expiresAt)
        internal
        view
        returns (ICertificateRegistry.Status)
    {
        if (stored == ICertificateRegistry.Status.Valid && expiresAt != 0 && block.timestamp >= expiresAt) {
            return ICertificateRegistry.Status.Expired;
        }
        return stored;
    }
}
