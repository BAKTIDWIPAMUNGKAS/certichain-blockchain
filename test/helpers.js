const { ethers } = require("hardhat");
const ONE = ethers.parseEther("1");
const h = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));
const REASON = ethers.encodeBytes32String("REVOKED");
const Status = { NotFound: 0n, Valid: 1n, Revoked: 2n, Expired: 3n };
const idOf = (issuer, docHash) =>
  ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "bytes32"], [issuer, docHash]));
module.exports = { ONE, h, REASON, Status, idOf };
