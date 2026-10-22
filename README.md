# CertiChain – Registri Sertifikat Digital Berbasis Smart Contract

UAS Blockchain (KP70067008) · Program Studi Informatika · Universitas Siliwangi · TA 2026/2027 Ganjil
Dosen pengampu: Dr. Ir. Nur Widiyasono, M.Kom.

> **Use case:** penerbitan dan verifikasi sertifikat/ijazah digital lintas pihak (issuer, holder, verifier, admin). Hanya *hash* dokumen yang dicatat on-chain. UAS ini dikerjakan secara individu.

## Peringatan keamanan
Semua pengujian memakai **local blockchain Hardhat (chain ID 31337)**. Akun yang dipakai adalah akun uji bawaan Hardhat yang kuncinya publik. **Dilarang** memakai private key utama, seed phrase pribadi, aset kripto nyata, atau jaringan produksi. Jangan menyimpan kunci di repositori (`.env` sudah di-`.gitignore`).

## Struktur
```
contracts/
  CertiChain.sol                v2 (setelah audit)
  audit/CertiChainV1.sol        baseline vulnerable-by-design (JANGAN dipakai produksi)
  interfaces/ libraries/ access/   interface, CertLib, AccessRoles (RBAC)
  mocks/                        ReentrancyAttacker, RejectingReceiver (khusus tes)
test/                           CertiChain.test.js (31 tes V2) · Audit.V1.PoC.test.js (6 PoC V1)
scripts/                        deploy.js · interact.js (integrasi client)
frontend/index.html             klien web (ethers.js lokal, MetaMask/JSON-RPC)
deployments/                    catatan deployment & interaksi (JSON)
docs/                           Security_Audit.md, Deployment_Record.md, diagram, evidence/
```

## Dependensi
Node.js ≥ 18 (diuji v22), npm ≥ 9, Hardhat 2.22.17, ethers 6.13.4, solc 0.8.24 (diunduh otomatis oleh Hardhat; bila jaringan memblokir `binaries.soliditylang.org`, set `SOLC_PATH` ke binary solc 0.8.24 lokal).

## Reproduksi
```bash
npm install --legacy-peer-deps
npx hardhat compile
npx hardhat test                  # 37 lulus
npx hardhat coverage              # laporan coverage
npx hardhat node                  # terminal 1: local blockchain
npx hardhat run scripts/deploy.js   --network localhost   # terminal 2
npx hardhat run scripts/interact.js --network localhost
```
Frontend: jalankan `npx http-server frontend` (atau buka berkas langsung), tempel alamat kontrak dari `deployments/localhost.json`, tambahkan jaringan Localhost 8545 (chain ID 31337) di MetaMask dan impor akun uji Hardhat **hanya untuk jaringan lokal**. Tanpa MetaMask, halaman memakai JSON-RPC lokal (akun #0).

## Role & aturan bisnis
- **ADMIN**: approve/suspend issuer, slash stake, pause, kelola admin (tidak boleh mencabut admin terakhir).
- **ISSUER**: wajib stake ≥ 1 ETH (uji); menerbitkan dan mencabut sertifikatnya sendiri.
- **Siapa pun**: `verifyCertificate(id)` (view, gratis). ID = `keccak256(issuer, docHash)`.

## Hasil ringkas
37 tes lulus; coverage `CertiChain.sol`: 100 % statement/function/line, 90 % branch. Detail: `docs/Security_Audit.md`, `docs/Deployment_Record.md`.

## Lisensi & atribusi
MIT. Kode kontrak ditulis sendiri oleh penulis; pola Checks-Effects-Interactions dan reentrancy guard mengikuti praktik umum (rujukan: dokumentasi Solidity, OpenZeppelin ReentrancyGuard sebagai pembanding konsep). Diagram dibuat dengan Graphviz.
