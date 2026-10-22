# Skenario Video Demo (cadangan, ±5 menit) – direkam sendiri

Video belum direkam; berkas `Video_Demo.mp4` harus dibuat sendiri dari skenario berikut (rekam layar terminal + browser).
1. (0:00) Konteks masalah, stakeholder, alasan blockchain (slide 2).
2. (0:40) `npx hardhat compile` lalu `npx hardhat test` → tunjukkan 37 lulus dan PoC A-01 (saldo attacker 3 ETH pada V1).
3. (1:40) `npx hardhat node` (terminal 1), `deploy.js` → catat contract address & tx hash.
4. (2:20) `interact.js` → stake, approve, issue, verify=Valid, revoke, verify=Revoked, queryFilter event.
5. (3:20) Frontend: hubungkan wallet/RPC, pilih berkas, verifikasi (NotFound → Valid → Revoked).
6. (4:15) Audit: tabel A-01..A-07, retest, keterbatasan, roadmap.
Jelaskan kontribusi pribadi sesuai riwayat commit repositori.
