// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ICertificateRegistry} from "./interfaces/ICertificateRegistry.sol";
import {CertLib} from "./libraries/CertLib.sol";
import {AccessRoles} from "./access/AccessRoles.sol";

/// @title CertiChain v2 (setelah audit)
/// @notice Registri sertifikat digital multi-pihak. Issuer wajib menyetor stake (jaminan integritas).
///         Hanya hash dokumen yang dicatat on-chain; berkas asli dan data pribadi disimpan off-chain.
/// @dev Seluruh temuan audit A-01..A-07 pada CertiChainV1 diperbaiki di versi ini (lihat docs/Security_Audit.md).
contract CertiChain is ICertificateRegistry, AccessRoles {
    using CertLib for bytes32;

    // ---------------------------------------------------------------- konstanta & state
    uint256 public constant MIN_STAKE = 1 ether;
    uint256 public constant MAX_BATCH = 50;

    struct Certificate {
        bytes32 docHash;   // slot 1
        address issuer;    // slot 2 (dipadatkan dengan issuedAt & status)
        uint64 issuedAt;
        Status status;
        address holder;    // slot 3
        uint64 expiresAt;
    }

    mapping(bytes32 => Certificate) private _certs;
    mapping(address => bytes32[]) private _holderCerts;
    mapping(address => uint256) public stakeOf;
    uint256 public slashedPool;
    bool public paused;
    uint256 private _lock = 1; // 1 = bebas, 2 = terkunci (guard reentrancy)

    // ---------------------------------------------------------------- error & event
    error Paused();
    error Reentrancy();
    error StakeTooLow(uint256 have, uint256 required);
    error StillIssuer();
    error NoStake();
    error InsufficientStake(uint256 have, uint256 requested);
    error TransferFailed();
    error LastAdmin();
    error ZeroValue();
    error InvalidHash();
    error InvalidExpiry();
    error AlreadyIssued(bytes32 id);
    error CertNotFound(bytes32 id);
    error AlreadyRevoked(bytes32 id);
    error BatchTooLarge(uint256 size, uint256 max);

    event StakeDeposited(address indexed account, uint256 amount);
    event StakeWithdrawn(address indexed account, uint256 amount);
    event Slashed(address indexed issuer, uint256 amount);
    event SlashedWithdrawn(address indexed to, uint256 amount);
    event PausedSet(bool paused, address indexed by);

    // ---------------------------------------------------------------- modifier
    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier nonReentrant() {
        if (_lock == 2) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address admin) {
        _grant(ADMIN_ROLE, admin);
    }

    // ---------------------------------------------------------------- tata kelola (ADMIN)
    function setPaused(bool value) external onlyRole(ADMIN_ROLE) {
        paused = value;
        emit PausedSet(value, msg.sender);
    }

    function grantAdmin(address account) external onlyRole(ADMIN_ROLE) {
        _grant(ADMIN_ROLE, account);
    }

    function revokeAdmin(address account) external onlyRole(ADMIN_ROLE) {
        if (hasRole(ADMIN_ROLE, account) && adminCount <= 1) revert LastAdmin(); // cegah lockout tata kelola
        _revokeRole(ADMIN_ROLE, account);
    }

    function approveIssuer(address account) external onlyRole(ADMIN_ROLE) {
        uint256 s = stakeOf[account];
        if (s < MIN_STAKE) revert StakeTooLow(s, MIN_STAKE);
        _grant(ISSUER_ROLE, account);
    }

    function suspendIssuer(address account) external onlyRole(ADMIN_ROLE) {
        _revokeRole(ISSUER_ROLE, account);
    }

    /// @notice Sanksi: memindahkan sebagian stake issuer ke slashedPool; issuer otomatis ditangguhkan bila stake < MIN_STAKE.
    function slash(address issuer, uint256 amount) external onlyRole(ADMIN_ROLE) {
        uint256 s = stakeOf[issuer];
        if (amount > s) revert InsufficientStake(s, amount);
        unchecked { stakeOf[issuer] = s - amount; }
        slashedPool += amount;
        if (stakeOf[issuer] < MIN_STAKE) _revokeRole(ISSUER_ROLE, issuer);
        emit Slashed(issuer, amount);
    }

    function withdrawSlashed(address payable to) external onlyRole(ADMIN_ROLE) nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 amount = slashedPool;
        if (amount == 0) revert NoStake();
        slashedPool = 0; // effects sebelum interaction
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit SlashedWithdrawn(to, amount);
    }

    // ---------------------------------------------------------------- stake issuer
    function depositStake() external payable {
        if (msg.value == 0) revert ZeroValue();
        stakeOf[msg.sender] += msg.value;
        emit StakeDeposited(msg.sender, msg.value);
    }

    function resignIssuer() external onlyRole(ISSUER_ROLE) {
        _revokeRole(ISSUER_ROLE, msg.sender);
    }

    /// @notice [Perbaikan A-01 & A-07] Checks-Effects-Interactions + nonReentrant + pemeriksaan hasil transfer.
    function withdrawStake() external nonReentrant {
        if (hasRole(ISSUER_ROLE, msg.sender)) revert StillIssuer();
        uint256 amount = stakeOf[msg.sender];
        if (amount == 0) revert NoStake();
        stakeOf[msg.sender] = 0; // effects
        (bool ok, ) = msg.sender.call{value: amount}(""); // interaction
        if (!ok) revert TransferFailed(); // seluruh transaksi di-revert, stake tidak hilang
        emit StakeWithdrawn(msg.sender, amount);
    }

    // ---------------------------------------------------------------- sertifikat
    /// @notice [Perbaikan A-03 & A-05] ID = keccak256(issuer, docHash) dan validasi input lengkap.
    function issueCertificate(bytes32 docHash, address holder, uint64 expiresAt)
        external
        onlyRole(ISSUER_ROLE)
        whenNotPaused
        returns (bytes32 id)
    {
        if (docHash == bytes32(0)) revert InvalidHash();
        if (holder == address(0)) revert ZeroAddress();
        if (expiresAt != 0 && expiresAt <= block.timestamp) revert InvalidExpiry();

        id = CertLib.computeId(msg.sender, docHash);
        if (_certs[id].status != Status.NotFound) revert AlreadyIssued(id);

        _certs[id] = Certificate({
            docHash: docHash,
            issuer: msg.sender,
            issuedAt: uint64(block.timestamp),
            status: Status.Valid,
            holder: holder,
            expiresAt: expiresAt
        });
        _holderCerts[holder].push(id);
        emit CertificateIssued(id, msg.sender, holder, docHash, expiresAt);
    }

    /// @notice [Perbaikan A-02] Hanya issuer asli sertifikat atau ADMIN yang boleh mencabut.
    function revokeCertificate(bytes32 id, bytes32 reasonCode) external {
        _revokeCert(id, reasonCode);
    }

    /// @notice [Perbaikan A-04] Pencabutan massal dibatasi MAX_BATCH agar gas tidak tak terbatas.
    function revokeBatch(bytes32[] calldata ids, bytes32 reasonCode) external {
        if (ids.length > MAX_BATCH) revert BatchTooLarge(ids.length, MAX_BATCH);
        for (uint256 i = 0; i < ids.length; ++i) {
            _revokeCert(ids[i], reasonCode);
        }
    }

    function _revokeCert(bytes32 id, bytes32 reasonCode) private {
        Certificate storage c = _certs[id];
        if (c.status == Status.NotFound) revert CertNotFound(id);
        if (c.status == Status.Revoked) revert AlreadyRevoked(id);
        if (msg.sender != c.issuer && !hasRole(ADMIN_ROLE, msg.sender)) {
            revert NotAuthorized(ISSUER_ROLE, msg.sender);
        }
        c.status = Status.Revoked;
        emit CertificateRevoked(id, msg.sender, reasonCode);
    }

    // ---------------------------------------------------------------- baca
    function verifyCertificate(bytes32 id)
        external
        view
        returns (Status status, address issuer, address holder, bytes32 docHash, uint64 issuedAt, uint64 expiresAt)
    {
        Certificate storage c = _certs[id];
        status = CertLib.effectiveStatus(c.status, c.expiresAt);
        return (status, c.issuer, c.holder, c.docHash, c.issuedAt, c.expiresAt);
    }

    function holderCertificateCount(address holder) external view returns (uint256) {
        return _holderCerts[holder].length;
    }

    /// @notice Paginasi daftar sertifikat milik holder (offset, limit) agar pembacaan tidak tak terbatas.
    function getHolderCertificates(address holder, uint256 offset, uint256 limit) external view returns (bytes32[] memory page) {
        bytes32[] storage all = _holderCerts[holder];
        if (offset >= all.length) return new bytes32[](0);
        uint256 end = offset + limit;
        if (end > all.length) end = all.length;
        page = new bytes32[](end - offset);
        for (uint256 i = offset; i < end; ++i) page[i - offset] = all[i];
    }
}
