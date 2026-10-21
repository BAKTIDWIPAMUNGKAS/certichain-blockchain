// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title AccessRoles - kontrol akses berbasis peran (RBAC) sederhana
/// @notice Ditulis sendiri agar mudah diaudit. Untuk produksi disarankan memakai OpenZeppelin AccessControl (MIT).
abstract contract AccessRoles {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");

    mapping(bytes32 => mapping(address => bool)) private _roles;
    uint256 public adminCount;

    error NotAuthorized(bytes32 role, address account);
    error ZeroAddress();

    event RoleGranted(bytes32 indexed role, address indexed account, address indexed by);
    event RoleRevoked(bytes32 indexed role, address indexed account, address indexed by);

    modifier onlyRole(bytes32 role) {
        if (!_roles[role][msg.sender]) revert NotAuthorized(role, msg.sender);
        _;
    }

    function hasRole(bytes32 role, address account) public view returns (bool) {
        return _roles[role][account];
    }

    function _grant(bytes32 role, address account) internal {
        if (account == address(0)) revert ZeroAddress();
        if (!_roles[role][account]) {
            _roles[role][account] = true;
            if (role == ADMIN_ROLE) adminCount++;
            emit RoleGranted(role, account, msg.sender);
        }
    }

    function _revokeRole(bytes32 role, address account) internal {
        if (_roles[role][account]) {
            _roles[role][account] = false;
            if (role == ADMIN_ROLE) adminCount--;
            emit RoleRevoked(role, account, msg.sender);
        }
    }
}
