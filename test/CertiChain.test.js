const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { ONE, h, REASON, Status, idOf } = require("./helpers");

async function deployFixture() {
  const [admin, issuerA, issuerB, holder, outsider, admin2] = await ethers.getSigners();
  const cc = await ethers.deployContract("CertiChain", [admin.address]);
  await cc.waitForDeployment();
  // onboarding dua issuer
  for (const s of [issuerA, issuerB]) {
    await cc.connect(s).depositStake({ value: ONE });
    await cc.connect(admin).approveIssuer(s.address);
  }
  return { cc, admin, issuerA, issuerB, holder, outsider, admin2 };
}

describe("CertiChain v2 - unit test", function () {
  describe("Deployment & konfigurasi", function () {
    it("T-01 admin awal diset, adminCount=1, konstanta benar", async function () {
      const { cc, admin } = await loadFixture(deployFixture);
      expect(await cc.hasRole(await cc.ADMIN_ROLE(), admin.address)).to.equal(true);
      expect(await cc.adminCount()).to.equal(1n);
      expect(await cc.MIN_STAKE()).to.equal(ONE);
      expect(await cc.MAX_BATCH()).to.equal(50n);
    });
    it("T-02 constructor menolak admin address(0)", async function () {
      const F = await ethers.getContractFactory("CertiChain");
      await expect(F.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(F, "ZeroAddress");
    });
  });

  describe("Tata kelola & kontrol akses (ADMIN)", function () {
    it("T-03 [akses] non-admin tidak dapat approveIssuer / setPaused / slash / grantAdmin", async function () {
      const { cc, outsider, issuerA } = await loadFixture(deployFixture);
      await expect(cc.connect(outsider).approveIssuer(issuerA.address)).to.be.revertedWithCustomError(cc, "NotAuthorized");
      await expect(cc.connect(outsider).setPaused(true)).to.be.revertedWithCustomError(cc, "NotAuthorized");
      await expect(cc.connect(outsider).slash(issuerA.address, 1)).to.be.revertedWithCustomError(cc, "NotAuthorized");
      await expect(cc.connect(outsider).grantAdmin(outsider.address)).to.be.revertedWithCustomError(cc, "NotAuthorized");
    });
    it("T-04 admin dapat menambah admin kedua dan mencabutnya; admin terakhir tidak dapat dicabut", async function () {
      const { cc, admin, admin2 } = await loadFixture(deployFixture);
      await cc.connect(admin).grantAdmin(admin2.address);
      expect(await cc.adminCount()).to.equal(2n);
      await cc.connect(admin2).revokeAdmin(admin.address);
      expect(await cc.adminCount()).to.equal(1n);
      await expect(cc.connect(admin2).revokeAdmin(admin2.address)).to.be.revertedWithCustomError(cc, "LastAdmin");
    });
    it("T-05 [batas] grantAdmin(address(0)) ditolak", async function () {
      const { cc, admin } = await loadFixture(deployFixture);
      await expect(cc.connect(admin).grantAdmin(ethers.ZeroAddress)).to.be.revertedWithCustomError(cc, "ZeroAddress");
    });
  });

  describe("Stake & onboarding issuer", function () {
    it("T-06 [batas] approve gagal pada stake MIN_STAKE-1 wei, berhasil tepat MIN_STAKE", async function () {
      const { cc, admin, outsider } = await loadFixture(deployFixture);
      await cc.connect(outsider).depositStake({ value: ONE - 1n });
      await expect(cc.connect(admin).approveIssuer(outsider.address))
        .to.be.revertedWithCustomError(cc, "StakeTooLow").withArgs(ONE - 1n, ONE);
      await cc.connect(outsider).depositStake({ value: 1n });
      await expect(cc.connect(admin).approveIssuer(outsider.address)).to.emit(cc, "RoleGranted");
      expect(await cc.hasRole(await cc.ISSUER_ROLE(), outsider.address)).to.equal(true);
    });
    it("T-07 depositStake bernilai 0 ditolak", async function () {
      const { cc, outsider } = await loadFixture(deployFixture);
      await expect(cc.connect(outsider).depositStake({ value: 0 })).to.be.revertedWithCustomError(cc, "ZeroValue");
    });
    it("T-08 issuer aktif tidak dapat menarik stake; setelah resign dapat menarik penuh", async function () {
      const { cc, issuerA } = await loadFixture(deployFixture);
      await expect(cc.connect(issuerA).withdrawStake()).to.be.revertedWithCustomError(cc, "StillIssuer");
      await cc.connect(issuerA).resignIssuer();
      await expect(cc.connect(issuerA).withdrawStake()).to.changeEtherBalances([cc, issuerA], [-ONE, ONE]);
      expect(await cc.stakeOf(issuerA.address)).to.equal(0n);
    });
    it("T-09 withdrawStake tanpa stake ditolak (NoStake)", async function () {
      const { cc, outsider } = await loadFixture(deployFixture);
      await expect(cc.connect(outsider).withdrawStake()).to.be.revertedWithCustomError(cc, "NoStake");
    });
    it("T-10 slash mengurangi stake, menangguhkan issuer otomatis, dan admin dapat menarik slashedPool", async function () {
      const { cc, admin, issuerA, outsider } = await loadFixture(deployFixture);
      await expect(cc.connect(admin).slash(issuerA.address, ONE / 2n)).to.emit(cc, "Slashed").withArgs(issuerA.address, ONE / 2n);
      expect(await cc.hasRole(await cc.ISSUER_ROLE(), issuerA.address)).to.equal(false);
      expect(await cc.slashedPool()).to.equal(ONE / 2n);
      await expect(cc.connect(admin).withdrawSlashed(outsider.address)).to.changeEtherBalance(outsider, ONE / 2n);
      await expect(cc.connect(admin).withdrawSlashed(outsider.address)).to.be.revertedWithCustomError(cc, "NoStake");
    });
    it("T-11 [batas] slash melebihi stake ditolak; withdrawSlashed ke address(0) ditolak", async function () {
      const { cc, admin, issuerA } = await loadFixture(deployFixture);
      await expect(cc.connect(admin).slash(issuerA.address, ONE + 1n)).to.be.revertedWithCustomError(cc, "InsufficientStake");
      await expect(cc.connect(admin).withdrawSlashed(ethers.ZeroAddress)).to.be.revertedWithCustomError(cc, "ZeroAddress");
    });
    it("T-12 suspendIssuer mencabut hak menerbitkan", async function () {
      const { cc, admin, issuerA, holder } = await loadFixture(deployFixture);
      await cc.connect(admin).suspendIssuer(issuerA.address);
      await expect(cc.connect(issuerA).issueCertificate(h("x"), holder.address, 0))
        .to.be.revertedWithCustomError(cc, "NotAuthorized");
    });
  });

  describe("Penerbitan sertifikat", function () {
    it("T-13 [positif] issuer menerbitkan sertifikat; event & state sesuai", async function () {
      const { cc, issuerA, holder } = await loadFixture(deployFixture);
      const doc = h("ijazah-001");
      const id = idOf(issuerA.address, doc);
      const exp = BigInt((await time.latest()) + 86400);
      await expect(cc.connect(issuerA).issueCertificate(doc, holder.address, exp))
        .to.emit(cc, "CertificateIssued").withArgs(id, issuerA.address, holder.address, doc, exp);
      const v = await cc.verifyCertificate(id);
      expect(v.status).to.equal(Status.Valid);
      expect(v.issuer).to.equal(issuerA.address);
      expect(v.holder).to.equal(holder.address);
      expect(v.docHash).to.equal(doc);
      expect(await cc.holderCertificateCount(holder.address)).to.equal(1n);
    });
    it("T-14 [akses] non-issuer / admin tidak dapat menerbitkan", async function () {
      const { cc, admin, outsider, holder } = await loadFixture(deployFixture);
      await expect(cc.connect(outsider).issueCertificate(h("a"), holder.address, 0)).to.be.revertedWithCustomError(cc, "NotAuthorized");
      await expect(cc.connect(admin).issueCertificate(h("a"), holder.address, 0)).to.be.revertedWithCustomError(cc, "NotAuthorized");
    });
    it("T-15 [negatif][A-05] hash nol, holder nol ditolak", async function () {
      const { cc, issuerA, holder } = await loadFixture(deployFixture);
      await expect(cc.connect(issuerA).issueCertificate(ethers.ZeroHash, holder.address, 0)).to.be.revertedWithCustomError(cc, "InvalidHash");
      await expect(cc.connect(issuerA).issueCertificate(h("a"), ethers.ZeroAddress, 0)).to.be.revertedWithCustomError(cc, "ZeroAddress");
    });
    it("T-16 [batas][A-05] expiry tepat = waktu blok ditolak, = waktu blok+1 diterima, 0 = tanpa kedaluwarsa", async function () {
      const { cc, issuerA, holder } = await loadFixture(deployFixture);
      const t = (await time.latest()) + 100;
      await time.setNextBlockTimestamp(t);
      await expect(cc.connect(issuerA).issueCertificate(h("e1"), holder.address, t)).to.be.revertedWithCustomError(cc, "InvalidExpiry");
      await time.setNextBlockTimestamp(t + 1);
      await cc.connect(issuerA).issueCertificate(h("e2"), holder.address, t + 2);
      await cc.connect(issuerA).issueCertificate(h("e3"), holder.address, 0);
      expect(await cc.holderCertificateCount(holder.address)).to.equal(2n);
    });
    it("T-17 [negatif] penerbitan ganda oleh issuer yang sama ditolak", async function () {
      const { cc, issuerA, holder } = await loadFixture(deployFixture);
      await cc.connect(issuerA).issueCertificate(h("dup"), holder.address, 0);
      await expect(cc.connect(issuerA).issueCertificate(h("dup"), holder.address, 0)).to.be.revertedWithCustomError(cc, "AlreadyIssued");
    });
    it("T-18 [A-03 retest] issuer lain tidak dapat menyerobot hash yang sama; kedua ID berbeda", async function () {
      const { cc, issuerA, issuerB, holder, outsider } = await loadFixture(deployFixture);
      const doc = h("sama");
      await cc.connect(issuerB).issueCertificate(doc, outsider.address, 0); // "front-run" oleh B
      await cc.connect(issuerA).issueCertificate(doc, holder.address, 0);   // A tetap berhasil
      expect((await cc.verifyCertificate(idOf(issuerA.address, doc))).holder).to.equal(holder.address);
      expect((await cc.verifyCertificate(idOf(issuerB.address, doc))).holder).to.equal(outsider.address);
    });
    it("T-19 setPaused menghentikan penerbitan; unpause memulihkan; pencabutan tetap bisa saat pause", async function () {
      const { cc, admin, issuerA, holder } = await loadFixture(deployFixture);
      const doc = h("p1");
      await cc.connect(issuerA).issueCertificate(doc, holder.address, 0);
      await cc.connect(admin).setPaused(true);
      await expect(cc.connect(issuerA).issueCertificate(h("p2"), holder.address, 0)).to.be.revertedWithCustomError(cc, "Paused");
      await expect(cc.connect(issuerA).revokeCertificate(idOf(issuerA.address, doc), REASON)).to.emit(cc, "CertificateRevoked");
      await cc.connect(admin).setPaused(false);
      await cc.connect(issuerA).issueCertificate(h("p2"), holder.address, 0);
    });
  });

  describe("Verifikasi & pencabutan", function () {
    it("T-20 verifikasi ID tak dikenal = NotFound", async function () {
      const { cc } = await loadFixture(deployFixture);
      expect((await cc.verifyCertificate(h("nope"))).status).to.equal(Status.NotFound);
    });
    it("T-21 [batas] sertifikat menjadi Expired tepat pada expiresAt", async function () {
      const { cc, issuerA, holder } = await loadFixture(deployFixture);
      const doc = h("exp"); const id = idOf(issuerA.address, doc);
      const exp = (await time.latest()) + 1000;
      await cc.connect(issuerA).issueCertificate(doc, holder.address, exp);
      await time.setNextBlockTimestamp(exp - 1); await ethers.provider.send("evm_mine", []);
      expect((await cc.verifyCertificate(id)).status).to.equal(Status.Valid);
      await time.setNextBlockTimestamp(exp); await ethers.provider.send("evm_mine", []);
      expect((await cc.verifyCertificate(id)).status).to.equal(Status.Expired);
    });
    it("T-22 issuer asli dapat mencabut; event & status Revoked", async function () {
      const { cc, issuerA, holder } = await loadFixture(deployFixture);
      const doc = h("r1"); const id = idOf(issuerA.address, doc);
      await cc.connect(issuerA).issueCertificate(doc, holder.address, 0);
      await expect(cc.connect(issuerA).revokeCertificate(id, REASON)).to.emit(cc, "CertificateRevoked").withArgs(id, issuerA.address, REASON);
      expect((await cc.verifyCertificate(id)).status).to.equal(Status.Revoked);
    });
    it("T-23 ADMIN dapat mencabut sertifikat issuer mana pun", async function () {
      const { cc, admin, issuerA, holder } = await loadFixture(deployFixture);
      const doc = h("r2"); const id = idOf(issuerA.address, doc);
      await cc.connect(issuerA).issueCertificate(doc, holder.address, 0);
      await cc.connect(admin).revokeCertificate(id, REASON);
      expect((await cc.verifyCertificate(id)).status).to.equal(Status.Revoked);
    });
    it("T-24 [akses][A-02 retest] issuer lain & pihak luar tidak dapat mencabut", async function () {
      const { cc, issuerA, issuerB, outsider, holder } = await loadFixture(deployFixture);
      const doc = h("r3"); const id = idOf(issuerA.address, doc);
      await cc.connect(issuerA).issueCertificate(doc, holder.address, 0);
      await expect(cc.connect(issuerB).revokeCertificate(id, REASON)).to.be.revertedWithCustomError(cc, "NotAuthorized");
      await expect(cc.connect(outsider).revokeCertificate(id, REASON)).to.be.revertedWithCustomError(cc, "NotAuthorized");
      expect((await cc.verifyCertificate(id)).status).to.equal(Status.Valid);
    });
    it("T-25 [negatif] cabut dua kali / ID tak ada ditolak", async function () {
      const { cc, issuerA, holder } = await loadFixture(deployFixture);
      const doc = h("r4"); const id = idOf(issuerA.address, doc);
      await cc.connect(issuerA).issueCertificate(doc, holder.address, 0);
      await cc.connect(issuerA).revokeCertificate(id, REASON);
      await expect(cc.connect(issuerA).revokeCertificate(id, REASON)).to.be.revertedWithCustomError(cc, "AlreadyRevoked");
      await expect(cc.connect(issuerA).revokeCertificate(h("zzz"), REASON)).to.be.revertedWithCustomError(cc, "CertNotFound");
    });
    it("T-26 issuer yang sudah resign tetap dapat mencabut sertifikat miliknya", async function () {
      const { cc, issuerA, holder } = await loadFixture(deployFixture);
      const doc = h("r5"); const id = idOf(issuerA.address, doc);
      await cc.connect(issuerA).issueCertificate(doc, holder.address, 0);
      await cc.connect(issuerA).resignIssuer();
      await cc.connect(issuerA).revokeCertificate(id, REASON);
      expect((await cc.verifyCertificate(id)).status).to.equal(Status.Revoked);
    });
  });

  describe("Batch & paginasi [A-04 retest]", function () {
    async function issueMany(cc, issuer, holder, n, prefix) {
      const ids = [];
      for (let i = 0; i < n; i++) {
        const d = h(prefix + i);
        await cc.connect(issuer).issueCertificate(d, holder.address, 0);
        ids.push(idOf(issuer.address, d));
      }
      return ids;
    }
    it("T-27 [batas] revokeBatch 50 item berhasil, 51 item ditolak BatchTooLarge", async function () {
      const { cc, issuerA, holder } = await loadFixture(deployFixture);
      const ids = await issueMany(cc, issuerA, holder, 51, "b");
      await expect(cc.connect(issuerA).revokeBatch(ids, REASON)).to.be.revertedWithCustomError(cc, "BatchTooLarge").withArgs(51n, 50n);
      await cc.connect(issuerA).revokeBatch(ids.slice(0, 50), REASON);
      expect((await cc.verifyCertificate(ids[49])).status).to.equal(Status.Revoked);
      expect((await cc.verifyCertificate(ids[50])).status).to.equal(Status.Valid);
    });
    it("T-28 [akses] batch yang memuat sertifikat issuer lain di-revert seluruhnya (atomik)", async function () {
      const { cc, issuerA, issuerB, holder } = await loadFixture(deployFixture);
      const a = await issueMany(cc, issuerA, holder, 2, "ma");
      const b = await issueMany(cc, issuerB, holder, 1, "mb");
      await expect(cc.connect(issuerA).revokeBatch([a[0], b[0]], REASON)).to.be.revertedWithCustomError(cc, "NotAuthorized");
      expect((await cc.verifyCertificate(a[0])).status).to.equal(Status.Valid);
    });
    it("T-29 [batas] paginasi getHolderCertificates (offset/limit/di luar rentang)", async function () {
      const { cc, issuerA, holder } = await loadFixture(deployFixture);
      const ids = await issueMany(cc, issuerA, holder, 5, "pg");
      expect(await cc.getHolderCertificates(holder.address, 0, 2)).to.deep.equal(ids.slice(0, 2));
      expect(await cc.getHolderCertificates(holder.address, 3, 10)).to.deep.equal(ids.slice(3));
      expect((await cc.getHolderCertificates(holder.address, 5, 1)).length).to.equal(0);
      expect((await cc.getHolderCertificates(holder.address, 99, 1)).length).to.equal(0);
    });
  });

  describe("Retest kerentanan finansial [A-01, A-07]", function () {
    it("T-30 [A-01 retest] serangan reentrancy pada withdrawStake gagal; dana kontrak utuh", async function () {
      const { cc } = await loadFixture(deployFixture); // kontrak menyimpan 2 ETH (issuer A & B)
      const atk = await ethers.deployContract("ReentrancyAttacker", [await cc.getAddress()]);
      await expect(atk.attack({ value: ONE })).to.be.revertedWithCustomError(cc, "TransferFailed");
      expect(await ethers.provider.getBalance(await cc.getAddress())).to.equal(2n * ONE);
      expect(await ethers.provider.getBalance(await atk.getAddress())).to.equal(0n);
    });
    it("T-31 [A-07 retest] penarikan ke kontrak yang menolak ETH di-revert dan stake tidak hilang", async function () {
      const { cc } = await loadFixture(deployFixture);
      const rr = await ethers.deployContract("RejectingReceiver");
      await rr.deposit(await cc.getAddress(), { value: ONE });
      await expect(rr.withdraw(await cc.getAddress())).to.be.revertedWithCustomError(cc, "TransferFailed");
      expect(await cc.stakeOf(await rr.getAddress())).to.equal(ONE);
    });
  });
});
