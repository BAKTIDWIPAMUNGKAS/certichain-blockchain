// Skrip integrasi client: terhubung ke node lokal via provider, memanggil kontrak, memverifikasi event & perubahan state.
const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

const STATUS = ["NotFound", "Valid", "Revoked", "Expired"];

async function main() {
  const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", `${network.name}.json`)));
  const [admin, issuer, holder, verifier] = await ethers.getSigners();
  const cc = await ethers.getContractAt("CertiChain", dep.address);
  const log = { network: network.name, chainId: dep.chainId, contract: dep.address, steps: [] };
  const step = async (name, txPromise) => {
    const tx = await txPromise; const r = await tx.wait();
    const events = r.logs.map((l) => { try { return cc.interface.parseLog(l); } catch { return null; } }).filter(Boolean)
      .map((e) => ({ name: e.name, args: e.args.toObject ? Object.fromEntries(Object.entries(e.args.toObject()).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v])) : {} }));
    log.steps.push({ step: name, txHash: tx.hash, block: r.blockNumber, gasUsed: r.gasUsed.toString(), events });
    console.log(`[${name}] tx=${tx.hash} block=${r.blockNumber} gas=${r.gasUsed} events=${events.map((e) => e.name).join(",")}`);
    return r;
  };

  // 1) onboarding issuer
  await step("depositStake(issuer, 1 ETH)", cc.connect(issuer).depositStake({ value: ethers.parseEther("1") }));
  await step("approveIssuer(admin)", cc.connect(admin).approveIssuer(issuer.address));

  // 2) dokumen sertifikat disimpan OFF-CHAIN; hanya hash yang dicatat
  const pdfBytes = ethers.toUtf8Bytes("Sertifikat Kompetensi Blockchain - Nama: Contoh Peserta - No: CERT/2026/0001");
  const docHash = ethers.keccak256(pdfBytes);
  const id = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "bytes32"], [issuer.address, docHash]));
  const expires = (await ethers.provider.getBlock("latest")).timestamp + 365 * 24 * 3600;
  await step("issueCertificate(issuer)", cc.connect(issuer).issueCertificate(docHash, holder.address, expires));

  // 3) verifikasi publik (view, tanpa biaya) -> perubahan state terbukti
  let v = await cc.connect(verifier).verifyCertificate(id);
  console.log(`verify#1 -> ${STATUS[v.status]} issuer=${v.issuer} holder=${v.holder}`);
  log.verifyBeforeRevoke = STATUS[v.status];

  // 4) pencabutan lalu verifikasi ulang
  await step("revokeCertificate(issuer)", cc.connect(issuer).revokeCertificate(id, ethers.encodeBytes32String("SALAH_DATA")));
  v = await cc.connect(verifier).verifyCertificate(id);
  console.log(`verify#2 -> ${STATUS[v.status]}`);
  log.verifyAfterRevoke = STATUS[v.status];

  // 5) bukti query event dari log blockchain
  const issued = await cc.queryFilter(cc.filters.CertificateIssued(id));
  const revoked = await cc.queryFilter(cc.filters.CertificateRevoked(id));
  console.log(`queryFilter -> Issued=${issued.length} Revoked=${revoked.length}`);
  log.certificateId = id; log.docHash = docHash;
  log.eventCount = { issued: issued.length, revoked: revoked.length };
  fs.writeFileSync(path.join(__dirname, "..", "deployments", `${network.name}-interaction.json`), JSON.stringify(log, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
