// Deploy CertiChain ke local blockchain (npx hardhat node). Akun = akun uji bawaan Hardhat; tidak ada private key di repositori.
const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  const cc = await ethers.deployContract("CertiChain", [deployer.address]);
  const tx = cc.deploymentTransaction();
  const receipt = await tx.wait();
  const record = {
    contract: "CertiChain",
    compiler: "solc 0.8.24 (optimizer 200 runs)",
    network: network.name,
    chainId: Number(net.chainId),
    address: await cc.getAddress(),
    deployer: deployer.address,
    adminInitial: deployer.address,
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    deployedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.join(__dirname, "..", "deployments"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "..", "deployments", `${network.name}.json`), JSON.stringify(record, null, 2));
  console.log(record);
}
main().catch((e) => { console.error(e); process.exit(1); });
