# WIFI5soft Vendo OPI1 Boot and Portal Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a software/emulation-verified Orange Pi One release candidate whose LAN is deterministically `10.0.0.1`, DHCP works before persistent storage is ready, `/mnt/wifi5` is initialized safely, the clean-room backend starts only after storage readiness, and portal/admin/local functions work without WAN.

**Architecture:** Keep the verified OpenWrt LAN/Nginx/network contract and the existing clean-room SQLite backend. Make early DHCP independent of `/mnt/wifi5`, add one idempotent storage-bootstrap helper for partition 3, gate the OpenWrt launcher on storage/runtime readiness, and verify the resulting rootfs/image with static, host-runtime, ARM/proot, isolated no-WAN, and image-integrity tests. The original release candidate remains immutable; all image work happens on disposable copies.

**Tech Stack:** Node.js 18+ CommonJS, built-in `node:test`, OpenWrt rc.common/procd/UCI, POSIX shell, `lsblk`, `fdisk`, `partx`, `mkfs.ext4`, `mount`, Nginx, nftables, `qemu-arm`, `proot`, `bwrap`, `debugfs`, gzip/SHA-256.

**Spec:** `docs/superpowers/specs/2026-10-06-opi1-boot-portal-recovery-design.md`

## Global Constraints

- Authoritative firmware input: `/home/ethylnet/Downloads/ETHYLNET-OrangePiOne-UNLIMITED-Release-Candidate/ETHYLNET-OrangePiOne-SNAPSHOT-r32868-1ceaac207b-UNLIMITED.img.gz`.
- Known source raw SHA-256: `eb23e7e2d8cd2067d692e981b643872d68a3ae767877c80743819aab06a50a53`.
- Never modify the original release package or original raw image in place.
- LAN remains `br-lan` with `eth1`, `vlan.22`, `vlan.13` and `10.0.0.1/19`; WAN remains `eth0` DHCP unless evidence proves a separate defect.
- Base DHCP uses `/tmp/dhcp.leases` before persistent storage is available.
- `/mnt/wifi5` must be mounted and writable before the production backend starts.
- Partition creation is bounded: no recursive retry loop and no repeated formatting.
- Format partition 3 only when it has no filesystem; never format an existing non-empty filesystem to make tests pass.
- Reuse the existing clean-room backend and UI/API modules; do not create parallel replacements.
- Preserve Dropbear/local SSH, PPPoE, vouchers, vending, rental/sub-vendo, reseller, media, admin, and other required local functions.
- No local startup dependency on WAN, external DNS, activation, or cloud services.
- Do not run the opaque original ARM application directly on the Ubuntu host with unrestricted network access.
- Software/emulation PASS is not hardware verification; physical items remain `HARDWARE_TEST_PENDING`.
- Final artifact remains `.img.gz` and gets a new filename/hash/manifest; never overwrite the prior candidate.

## Review Focus

1. **No space for p3:** bootstrap must hard-fail and leave p1/p2 unchanged.
2. **p3 has unexpected non-empty filesystem:** never auto-format; backend stays gated.
3. **p3 created but device node appears only after reboot:** allow one controlled reboot path; never loop.
4. **Ports 3000/3001/3002 occupied:** launcher logs conflict and does not respawn-loop.
5. **WAN/DNS unavailable:** `/`, `/admin`, local APIs, SQLite persistence, vouchers/vendo/settings/sales/PPPoE-data remain locally usable.

---

### Task 1: Pin Early-DHCP Staging Contract

**Files:**
- Modify: `integration/openwrt/stage-rootfs.js`
- Modify: `tests/integration/openwrt/stage-rootfs.test.js`

**Interfaces:**
- Consumes: `stageRootfs({ projectRoot, targetRoot })`.
- Produces: staged `/etc/config/dhcp` with `/tmp/dhcp.leases`, while preserving `/etc/config/network` byte-for-byte.

- [ ] **Step 1: Write failing test** — fixture uses `/mnt/wifi5/dhcp.leases`; verified network contains `br-lan`, `eth1`, `10.0.0.1`; assert only lease path changes.
- [ ] **Step 2: Run RED** — `node --test tests/integration/openwrt/stage-rootfs.test.js`; expect FAIL.
- [ ] **Step 3: Implement minimal helper** — replace exactly one leasefile value and reject missing/ambiguous config; do not touch network.
- [ ] **Step 4: Run GREEN** — same command; expect PASS.
- [ ] **Step 5: Commit** — `git add integration/openwrt/stage-rootfs.js tests/integration/openwrt/stage-rootfs.test.js && git commit -m "fix: decouple early DHCP from wifi5 storage"`.

---

### Task 2: Add Idempotent WiFi5 Storage Bootstrap

**Files:**
- Create: `integration/openwrt/wifi5-storage-bootstrap.sh`
- Create: `tests/integration/openwrt/wifi5-storage-bootstrap.test.js`
- Modify: `integration/openwrt/stage-rootfs.js`
- Modify: `tests/integration/openwrt/stage-rootfs.test.js`

**Interfaces:**
- Consumes target-proven tools: `lsblk`, `fdisk`, `partx`, `mkfs.ext4`, `mount`, `umount`, `sync`, `uci`, `logger`.
- Produces `/usr/libexec/ethyl/wifi5-storage-bootstrap.sh`: exit `0` = ready; `75` = p3 newly created and one reboot required; other nonzero = hard failure/no backend.

- [ ] **Step 1: Write RED state-machine tests** — fake `PATH` and command log; cover absent p3/create->75, ext4 p3->0, blank p3->exactly one format, unexpected fs->fail/no-format, existing table p3 but absent node after `partx -u`->hard fail, no-space fdisk->hard fail.
- [ ] **Step 2: Run RED** — `node --test tests/integration/openwrt/wifi5-storage-bootstrap.test.js`; expect missing-helper FAIL.
- [ ] **Step 3: Implement helper** — detect root disk via `lsblk`; derive p3 path for digit-ending disks (`mmcblk0`/`loop0` => `p3`) and `sda` => `3`; if absent create DOS primary p3 from `root_partition_end + 100` to remaining media using `fdisk`; check status, `sync`, verify table, `partx -u`; only newly-created-but-not-visible returns 75; already-listed-but-still-invisible hard-fails.
- [ ] **Step 4: Implement fs/mount/DHCP phase** — `lsblk` FSTYPE empty=>format once, ext4=>preserve, other non-empty=>fail; create/mount `/mnt/wifi5`; verify `/proc/mounts` and writable probe; switch UCI leasefile from `/tmp/dhcp.leases` to `/mnt/wifi5/dhcp.leases`, preserve temp leases when possible, restart dnsmasq only on change.
- [ ] **Step 5: Stage helper** — install mode `0755`; test it never references target-missing `sfdisk`, `blkid`, `findmnt`, `mountpoint`, `partprobe`.
- [ ] **Step 6: Run GREEN** — `node --test tests/integration/openwrt/wifi5-storage-bootstrap.test.js tests/integration/openwrt/stage-rootfs.test.js`; expect PASS.
- [ ] **Step 7: Commit** — `git add integration/openwrt tests/integration/openwrt && git commit -m "feat: add deterministic wifi5 storage bootstrap"`.

---

### Task 3: Gate the OpenWrt Backend Launcher

**Files:**
- Modify: `integration/openwrt/soft.init`
- Create: `tests/integration/openwrt/soft-init.test.js`
- Modify: `tests/integration/openwrt/stage-rootfs.test.js`

**Interfaces:**
- Consumes Task-2 bootstrap exit contract and `/usr/bin/node /soft/ethyl-core/bin/ethyl-core.js`.
- Produces launcher that never starts backend before storage/runtime preflight.

- [ ] **Step 1: Write RED launcher tests** — bootstrap before `procd_open_instance`; 75 logs and requests one `/sbin/reboot` without Node; other nonzero logs/returns; `/mnt/wifi5` mounted+writable; Node+entrypoint present; 3000/3001/3002 free using target-present `netstat`/`nc`; PASS launches clean-room entrypoint only.
- [ ] **Step 2: Run RED** — `node --test tests/integration/openwrt/soft-init.test.js`; expect FAIL.
- [ ] **Step 3: Implement minimal preflight** — keep `START=95`; on PASS launch once under procd with `ETHYL_STATE_ROOT=/mnt/wifi5`, `ETHYL_LOG_LEVEL=info`, `ETHYL_OPENWRT=1`.
- [ ] **Step 4: Run GREEN** — focused launcher+staging tests; expect PASS.
- [ ] **Step 5: Commit** — `git add integration/openwrt/soft.init tests/integration/openwrt && git commit -m "fix: gate backend startup on storage readiness"`.

---

### Task 4: Add Rootfs Boot/Portal Contract Verifier

**Files:**
- Create: `integration/openwrt/verify-rootfs-contract.js`
- Create: `tests/integration/openwrt/verify-rootfs-contract.test.js`

**Interfaces:**
- Consumes: `verifyRootfsContract({ targetRoot })`.
- Produces frozen `{ ok, checks }`; CLI exits 0 only when required static contracts pass.

- [ ] **Step 1: Write RED verifier tests** — pin `br-lan`, `eth1`, `10.0.0.1`, early `/tmp/dhcp.leases`, Dropbear LAN, Nginx `/` and `/admin`, upstreams 3000/3001 and PPPoE 3002, nftables HTTP redirect, bootstrap helper, clean-room launcher, no `/soft/index.o`; negative fixtures for wrong IP, missing eth1/admin, legacy core.
- [ ] **Step 2: Run RED** — `node --test tests/integration/openwrt/verify-rootfs-contract.test.js`; expect FAIL.
- [ ] **Step 3: Implement read-only verifier** — deterministic check names: `LAN_10_0_0_1`, `LAN_ETH1`, `DHCP_EARLY_TMP`, `PORTAL_REDIRECT_80`, `ADMIN_ROUTE`, `BACKEND_3000_3001_3002`, `DROPBEAR_LAN`, `STORAGE_BOOTSTRAP`, `CLEAN_ROOM_ONLY`.
- [ ] **Step 4: Run GREEN** — focused test PASS.
- [ ] **Step 5: Commit** — `git add integration/openwrt/verify-rootfs-contract.js tests/integration/openwrt/verify-rootfs-contract.test.js && git commit -m "test: add opi1 rootfs boot and portal gate"`.

---

### Task 5: Verify Local Portal/Admin and No-WAN Persistence

**Files:**
- Create: `tests/integration/runtime/local-portal-admin-smoke.test.js`
- Modify only if RED proves defect: existing owner module under `src/http/`, `src/ui/`, `src/api/`, `src/core/`, or corresponding business service.

**Interfaces:**
- Consumes: `createProductionApp({ config, logger, ... })`.
- Produces regression proving local portal/admin/API and state persistence without WAN/provider success.

- [ ] **Step 1: Write smoke test** — temp persistent state; provider adapters fail like no WAN; assert startup, `health().local === true`, `wanRequired === false`, `database === 'sqlite'`; portal/admin response/redirect; representative settings, voucher/session, vendo/coin, sales/transaction, PPPoE data, rental, reseller mutation/read; stop/restart and assert persistence.
- [ ] **Step 2: Run** — `node --test tests/integration/runtime/local-portal-admin-smoke.test.js`; PASS if existing modules satisfy contract, otherwise RED names owning boundary.
- [ ] **Step 3: Repair only proven failure** — smallest existing owner module; no parallel service.
- [ ] **Step 4: Full regression** — `node --test tests/integration/runtime/local-portal-admin-smoke.test.js && npm test`; expect all PASS.
- [ ] **Step 5: Commit** — commit test and only proven repairs.

---

### Task 6: Add Isolated ARM Userspace Smoke Harness

**Files:**
- Create: `integration/emulation/run-arm-smoke.sh`
- Create: `tests/integration/emulation/arm-smoke-runner.test.js`

**Interfaces:**
- Consumes staged rootfs, writable test-state dir, target ARM `/usr/bin/node`, host `qemu-arm`, `proot`, `bwrap`.
- Produces no-WAN ARM smoke report; never invokes opaque core.

- [ ] **Step 1: Write RED runner tests** — refuse rootfs containing `/soft/index.o`; require target Node+clean-room entrypoint; require `bwrap --unshare-net`; `proot` + `qemu-arm`; only required writable binds; finite timeout.
- [ ] **Step 2: Run RED** — `node --test tests/integration/emulation/arm-smoke-runner.test.js`; expect FAIL.
- [ ] **Step 3: Implement runner** — use proven `bwrap --unshare-net`; execute target ARM Node via `proot -q /usr/bin/qemu-arm`; probe local listeners/routes inside isolation; stop/restart with same state; emit `ARM_RUNTIME`, `NO_WAN`, `PORTAL_ADMIN`, `RESTART_PERSISTENCE`.
- [ ] **Step 4: Run GREEN + real staged-rootfs smoke** — expect all four PASS markers.
- [ ] **Step 5: Commit** — `git add integration/emulation tests/integration/emulation && git commit -m "test: add isolated arm no-wan smoke harness"`.

---

### Task 7: Build Disposable Recovery Candidate

**Files:**
- Create: `integration/firmware/build-opi1-recovery-candidate.sh`
- Create: `tests/integration/firmware/build-candidate-contract.test.js`

**Interfaces:**
- Consumes immutable source `.img.gz`, clean-room project, `stageRootfs()`, `debugfs`.
- Produces new raw candidate plus staging/debugfs/delta reports under caller-supplied work dir; never overwrites source.

- [ ] **Step 1: Write RED builder contract** — explicit source/output; verify gzip/hash; decompress new raw; never write source; stage overlay; apply to p2 with proven step77 `debugfs` pattern; preserve p1/p2 geometry and non-sector trailer; invoke Task-4 verifier; abort on any gate failure.
- [ ] **Step 2: Run RED** — `node --test tests/integration/firmware/build-candidate-contract.test.js`; expect FAIL.
- [ ] **Step 3: Implement builder** — generate source hash record, staged rootfs, debugfs log, raw hash, delta manifest; no gzip yet.
- [ ] **Step 4: Build one raw disposable candidate** — source hash unchanged; new raw exists; rootfs verifier PASS; `/soft/index.o` absent; early DHCP/bootstrap/launcher installed.
- [ ] **Step 5: Commit** — `git add integration/firmware/build-opi1-recovery-candidate.sh tests/integration/firmware/build-candidate-contract.test.js && git commit -m "build: add opi1 recovery candidate pipeline"`.

---

### Task 8: Strict Candidate Verification

**Files:**
- Create: `integration/firmware/verify-opi1-recovery-candidate.sh`
- Create: `tests/integration/firmware/verify-candidate-contract.test.js`

**Interfaces:**
- Consumes Task-7 raw candidate plus source geometry/hash metadata.
- Produces machine-readable software gate report; never repairs image.

- [ ] **Step 1: Write RED verifier tests** — source unchanged; p1/p2 geometry; boot files preserved unless documented; p2 readable; trailer preserved; rootfs contract; early DHCP temp path; bootstrap; clean-room launcher; no legacy core; every target command referenced exists; gzip round-trip after packaging equals raw SHA; negative geometry/unsupported-command fixtures.
- [ ] **Step 2: Run RED** — `node --test tests/integration/firmware/verify-candidate-contract.test.js`; expect FAIL.
- [ ] **Step 3: Implement read-only verifier** — use `fdisk`, `debugfs -R`, byte/hash/trailer comparisons; no fsck/repair.
- [ ] **Step 4: Exercise partition bootstrap on enlarged disposable copy** — if interactive sudo/loop test is possible, run only on throwaway copy; otherwise state-machine test remains PASS and privileged loop subtest is `NOT_RUN_PRIVILEGED`, never PASS.
- [ ] **Step 5: Commit** — `git add integration/firmware/verify-opi1-recovery-candidate.sh tests/integration/firmware/verify-candidate-contract.test.js && git commit -m "test: add strict opi1 candidate integrity gates"`.

---

### Task 9: Full Software Gate and New Pre-release Package

**Files:**
- Generated outside Git in audit/output workspace: new `.img`, `.img.gz`, `.sha256`, manifest, verification report.
- Original release package remains untouched.

**Interfaces:**
- Consumes all prior outputs.
- Produces one new software/emulation-verified `.img.gz` pre-release candidate; physical hardware status remains pending.

- [ ] **Step 1: Run `npm test`** — expect all PASS.
- [ ] **Step 2: Run Task-4 and Task-8 rootfs/image gates** — expect all required static/software checks PASS.
- [ ] **Step 3: Run Task-6 isolated ARM smoke** — expect `ARM_RUNTIME=PASS`, `NO_WAN=PASS`, `PORTAL_ADMIN=PASS`, `RESTART_PERSISTENCE=PASS`.
- [ ] **Step 4: Run representative local business regression** — voucher/session, coin/vendo, settings, sales/transactions, PPPoE data/billing, rental/sub-vendo, reseller, SQLite persistence, portal/admin. Optional eLoad/ePay external providers may be unavailable offline but must not block local startup.
- [ ] **Step 5: Compress only verified raw candidate** — `gzip -t` PASS and decompressed SHA-256 equals raw SHA-256.
- [ ] **Step 6: Generate manifest/report** — source/output hashes, exact tests, PASS/NOT_RUN results, and `HARDWARE_TEST_PENDING` for physical Orange Pi One boot, USB-LAN enumeration timing, real AP association/broadcast DHCP, electrical coin pulses, and SD-card power-cycle behavior.
- [ ] **Step 7: Commit only code/tests/docs** — generated firmware stays outside Git unless separately requested for publication.
