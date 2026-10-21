require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("@nomicfoundation/hardhat-network-helpers");
require("solidity-coverage");
const fs = require("fs");
const path = require("path");
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");

// Opsional: jika SOLC_PATH diisi (mis. lingkungan tanpa akses internet ke binaries.soliditylang.org),
// gunakan binary solc 0.8.24 lokal. Jika tidak diisi, Hardhat mengunduh compiler seperti biasa.
const LOCAL_SOLC = process.env.SOLC_PATH || path.join(__dirname, ".solc-0.8.24");
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args, hre, runSuper) => {
  if (args.solcVersion === "0.8.24" && fs.existsSync(LOCAL_SOLC)) {
    return { compilerPath: LOCAL_SOLC, isSolcJs: false, version: "0.8.24", longVersion: "0.8.24+commit.e11b9ed9" };
  }
  return runSuper();
});

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: { version: "0.8.24", settings: { optimizer: { enabled: true, runs: 200 } } },
  networks: {
    // Local blockchain (npx hardhat node) - chain ID 31337, akun uji bawaan Hardhat (BUKAN akun nyata)
    localhost: { url: "http://127.0.0.1:8545", chainId: 31337 },
  },
};
