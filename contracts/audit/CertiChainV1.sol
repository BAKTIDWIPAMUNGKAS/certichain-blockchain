// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ICertificateRegistry} from "../interfaces/ICertificateRegistry.sol";
import {AccessRoles} from "../access/AccessRoles.sol";

/// @title CertiChainV1 - BASELINE AUDIT (vulnerable-by-design)
/// @notice JANGAN DIPAKAI DI PRODUKSI. Versi awal sebelum audit yang sengaja memuat pola kerentanan umum
///         (A-01..A-05, A-07) agar efektivitas mitigasi dapat dibuktikan lewat PoC dan retest.
///         Versi perbaikan: contracts/CertiChain.sol.
contract CertiChainV1 is ICertificateRegistry, AccessRoles {
    uint256 public constant MIN_STAKE = 1 ether;

    struct Certificate {
        bytes32 docHash;
        address issuer;
        uint64 issuedAt;
        Status status;
        address holder;
        uint64 expiresAt;
    }

    mapping(bytes32 => Certificate) private _certs;
    mapping(address => bytes32[]) private _holderCerts;
    mapping(address => uint256) public stakeOf;
    bool public paused;

    error Paused();
    error StakeTooLow(uint256 have, uint256 required);
    error AlreadyIssued(bytes32 id);
    error CertNotFound(bytes32 id);
    error AlreadyRevoked(bytes32 id);
    error NoStake();

    event StakeDeposited(address indexed account, uint256 amount);
    event StakeWithdrawn(address indexed account, uint256 amount);

    constructor(address admin) {
        _grant(ADMIN_ROLE, admin);
    }

    function setPaused(bool value) external onlyRole(ADMIN_ROLE) { paused = value; }

    function depositStake() external payable {
        stakeOf[msg.sender] += msg.value;
        emit StakeDeposited(msg.sender, msg.value);
    }

    function approveIssuer(address account) external onlyRole(ADMIN_ROLE) {
        if (stakeOf[account] < MIN_STAKE) revert StakeTooLow(stakeOf[account], MIN_STAKE);
        _grant(ISSUER_ROLE, account);
    }

    /// @dev [A-01] Reentrancy: interaction dilakukan SEBELUM saldo di-nol-kan, tanpa guard.
    /// @dev [A-07] Hasil low-level call tidak diperiksa: bila gagal, stake sudah terhapus dan dana terkunci.
    function withdrawStake() external {
        uint256 amount = stakeOf[msg.sender];
        if (amount == 0) revert NoStake();
        msg.sender.call{value: amount}("");
        stakeOf[msg.sender] = 0;
        emit StakeWithdrawn(msg.sender, amount);
    }

    /// @dev [A-03] ID = docHash saja (dapat diserobot issuer lain). [A-05] Tidak ada validasi input.
    function issueCertificate(bytes32 docHash, address holder, uint64 expiresAt)
        external
        onlyRole(ISSUER_ROLE)
        returns (bytes32 id)
    {
        if (paused) revert Paused();
        id = docHash;
        if (_certs[id].status != Status.NotFound) revert AlreadyIssued(id);
        _certs[id] = Certificate(docHash, msg.sender, uint64(block.timestamp), Status.Valid, holder, expiresAt);
        _holderCerts[holder].push(id);
        emit CertificateIssued(id, msg.sender, holder, docHash, expiresAt);
    }

    /// @dev [A-02] Access-control flaw: issuer mana pun dapat mencabut sertifikat issuer lain.
    function revokeCertificate(bytes32 id, bytes32 reasonCode) external onlyRole(ISSUER_ROLE) {
        Certificate storage c = _certs[id];
        if (c.status == Status.NotFound) revert CertNotFound(id);
        if (c.status == Status.Revoked) revert AlreadyRevoked(id);
        c.status = Status.Revoked;
        emit CertificateRevoked(id, msg.sender, reasonCode);
    }

    /// @dev [A-04] DoS: loop tak terbatas atas seluruh sertifikat holder (gas tumbuh linear tanpa batas).
    function revokeAllForHolder(address holder, bytes32 reasonCode) external onlyRole(ADMIN_ROLE) {
        bytes32[] storage ids = _holderCerts[holder];
        for (uint256 i = 0; i < ids.length; ++i) {
            Certificate storage c = _certs[ids[i]];
            if (c.status == Status.Valid) {
                c.status = Status.Revoked;
                emit CertificateRevoked(ids[i], msg.sender, reasonCode);
            }
        }
    }

    function verifyCertificate(bytes32 id)
        external
        view
        returns (Status status, address issuer, address holder, bytes32 docHash, uint64 issuedAt, uint64 expiresAt)
    {
        Certificate storage c = _certs[id];
        status = c.status;
        if (status == Status.Valid && c.expiresAt != 0 && block.timestamp >= c.expiresAt) status = Status.Expired;
        return (status, c.issuer, c.holder, c.docHash, c.issuedAt, c.expiresAt);
    }

    function getHolderCertificates(address holder) external view returns (bytes32[] memory) {
        return _holderCerts[holder];
    }
}
