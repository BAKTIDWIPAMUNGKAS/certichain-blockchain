// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title ICertificateRegistry - kontrak antarmuka registri sertifikat digital
/// @notice Hanya hash dokumen (bukan isi dokumen) yang dicatat on-chain demi privasi.
interface ICertificateRegistry {
    enum Status { NotFound, Valid, Revoked, Expired }

    event CertificateIssued(bytes32 indexed id, address indexed issuer, address indexed holder, bytes32 docHash, uint64 expiresAt);
    event CertificateRevoked(bytes32 indexed id, address indexed revokedBy, bytes32 reasonCode);

    function issueCertificate(bytes32 docHash, address holder, uint64 expiresAt) external returns (bytes32 id);
    function revokeCertificate(bytes32 id, bytes32 reasonCode) external;
    function verifyCertificate(bytes32 id)
        external
        view
        returns (Status status, address issuer, address holder, bytes32 docHash, uint64 issuedAt, uint64 expiresAt);
}
