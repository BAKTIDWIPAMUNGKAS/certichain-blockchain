# Deployment Record – CertiChain (UAS Blockchain TA 2026/2027 Ganjil)

| Item | Nilai |
|---|---|
| Jaringan | Hardhat local node (`npx hardhat node`), `http://127.0.0.1:8545` |
| Chain ID | 31337 |
| Kontrak | `CertiChain` (solc 0.8.24, optimizer 200 runs) |
| **Contract address** | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |
| Deployer / admin awal | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` (akun uji bawaan Hardhat #0, publik) |
| **Deployment tx hash** | `0x9845613a2f700b5d4ebe9708c6ac243b8cec9666d2a26506df2cf1d0410429de` |
| Block | 1 |
| Gas deployment | 1.515.744 |
| Waktu | 2026-10-21 (UTC) |
| Commit sumber | `0ebe60b` (cabang `main`) |

## Transaksi interaksi (scripts/interact.js, jaringan sama)

| Langkah | Tx hash | Block | Gas | Event |
|---|---|---|---|---|
| depositStake (issuer, 1 ETH uji) | `0x32eba769438b69862e2c233d6e3674520290f14c9f78c37c96a97ae3ab05d821` | 2 | 44.958 | StakeDeposited |
| approveIssuer (admin) | `0xd4b290a2f9c093020ddc0608c45f6f4786cda3fab7878a5dfbe1a7a5dc383000` | 3 | 50.907 | RoleGranted |
| issueCertificate (issuer) | `0xeca5fb4884b69e4a1861b1d6d05e14ac44c5948db7bbdba77735ff5eb3785013` | 4 | 141.450 | CertificateIssued |
| revokeCertificate (issuer) | `0x4d2fffe31230347c69aa0415c908ec064d6b4072ee88c8229bc1ad72ee842660` | 5 | 29.613 | CertificateRevoked |

Verifikasi state: sebelum pencabutan `verifyCertificate` → **Valid**; sesudah → **Revoked**. `queryFilter` menemukan 1 event Issued dan 1 event Revoked untuk ID sertifikat. Data mentah: `deployments/localhost.json`, `deployments/localhost-interaction.json`.

## Langkah reproduksi
```bash
npm install --legacy-peer-deps
npx hardhat compile
npx hardhat node                     # terminal 1 (biarkan berjalan)
npx hardhat run scripts/deploy.js --network localhost     # terminal 2
npx hardhat run scripts/interact.js --network localhost
```
Catatan: address dan hash bersifat deterministik hanya jika node baru dan urutan perintah identik; hasil pada mesin lain dapat berbeda pada nilai `deployedAt`.
