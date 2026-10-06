# ETHYLNET No-License Backend Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Follow superpowers:test-driven-development for every production change and superpowers:verification-before-completion before each completion claim.

**Goal:** Replace the production `/soft/index.o` backend with ETHYLNET-owned clean-room Node.js code, preserve required Orange Pi One business/network behavior, and make hidden product-license, activation, trial, expiry, entitlement, or server-side limit logic impossible to execute in the final firmware because the legacy opaque executable is absent and has no startup fallback.

**Architecture:** Keep the verified OpenWrt/Nginx/network/storage boundary. Run the ETHYLNET application with the existing ARM `/usr/bin/node`. Build missing behavior as explicit clean-room modules behind adapters, using only evidence from `ETHYLNET-OrangePiOne-Audit-20261005-031126`. Integrate feature areas in dependency order, then perform a firmware cutover that changes `/etc/init.d/soft` to the ETHYLNET entrypoint and removes `/soft/index.o`. Preserve the frozen original only outside the firmware as audit evidence.

**Tech Stack:** Node.js 18+, CommonJS, built-in `node:test` + `node:assert/strict`, OpenWrt procd/UCI, Nginx, ARM musl runtime, shell integration scripts, read-only/debugfs firmware verification.

**Primary spec:** `docs/superpowers/specs/2026-10-05-ethyl-core-clean-room-design.md`

**Evidence:** `reports/step75-index-o-offline-sandbox/step75-evidence-summary.txt` in the audit root.

## Global Constraints

- Only the current WiFi5-Soft Orange Pi One audit defines compatibility behavior.
- Do not copy LPB, TarakiFi, MiniPC, WIFIngBAYAN, Ruijie, or another product implementation as compatibility evidence.
- Never patch opaque V8 bytecode or force opaque auth/license success.
- Never fabricate external provider/payment success.
- Never invent an original API route, payload schema, callback, or provider endpoint.
- No production code before a watched failing test.
- Preserve `/mnt/wifi5` business data; no destructive migration of unknown formats.
- Preserve local Dropbear SSH, generic WireGuard, PPPoE, ELOAD, vouchers, sessions, coin handling, rental/sub-vendo, admin/reseller/portal behavior as each area reaches its parity gate.
- Keep Ngrok and ZeroTier absent.
- Do not run filesystem repair commands against source or release images.
- Final packaging remains the literal last step and must retain `.img.gz`.
- Until Task 12 passes, `/soft/index.o` remains frozen and untouched in existing candidates; no premature deletion from a firmware intended for use.

## Non-Negotiable No-License Release Gates

The final cutover candidate MUST prove:

1. `/soft/index.o` does not exist in the release rootfs.
2. No executable/startup/fallback reference to `/soft/index.o` exists anywhere in the release rootfs.
3. `/etc/init.d/soft` starts only `/usr/bin/node` with the ETHYLNET-owned entrypoint.
4. No production source contains product-key validation, activation-server dependency, trial/expiry gate, board entitlement, feature entitlement, license refresh, or license-response cache.
5. No hard-coded vendor licensing hostname/IP exists in ETHYLNET production source/config.
6. Startup succeeds without any license/key file.
7. Startup succeeds with no WAN access for all local-only features.
8. Missing optional external providers degrade explicitly, never by disabling unrelated local features.
9. Frozen original core remains outside the release artifact for forensic comparison only.

---

## Task 1: Freeze Replacement Contracts and Regression Guards

**Files:**
- Create: `src/runtime/no-license-contract.js`
- Create: `tests/runtime/no-license-contract.test.js`
- Create: `tests/runtime/legacy-core-reference-guard.test.js`
- Update: `src/runtime/app-contract.js` only if the new contract must be exported through the existing immutable app contract.

- [ ] Write a failing test asserting the immutable no-license contract lists every forbidden subsystem and declares `legacyCoreAllowedInRelease: false`.
- [ ] Write a failing guard that scans production `src/` and `bin/` for forbidden product-license/activation/trial/entitlement implementation tokens while allowing documentation/tests.
- [ ] Add the minimal immutable contract implementation.
- [ ] Run target tests, then full `npm test`.
- [ ] Commit only after GREEN.

**Acceptance:** clean-room production source has an executable regression guard against reintroducing license/trial logic.

---

## Task 2: Persistent Storage Bootstrap Without Destructive Migration

**Files:**
- Create: `src/storage/storage-contract.js`
- Create: `src/storage/storage-paths.js`
- Create: `src/storage/storage-bootstrap.js`
- Create: `tests/storage/storage-contract.test.js`
- Create: `tests/storage/storage-bootstrap.test.js`

Use only verified/observed paths, including the Step 75 disposable-runtime directories. Do not infer legacy serialization.

- [ ] RED: exact safe root `/mnt/wifi5`, traversal rejection, no arbitrary absolute injection.
- [ ] RED: bootstrap creates missing directories only and never truncates/replaces an existing file.
- [ ] RED: unknown existing files remain byte-identical.
- [ ] Implement safe path/bootstrap helpers.
- [ ] Full regression.

**Acceptance:** ETHYLNET can initialize required storage without depending on or overwriting an opaque legacy schema.

---

## Task 3: System, UCI, Process, and Network Adapter Boundaries

**Files:**
- Create: `src/system/command-runner.js`
- Create: `src/system/uci-adapter.js`
- Create: `src/system/network-adapter.js`
- Create: `src/system/service-adapter.js`
- Create corresponding `tests/system/*.test.js`.

No customer-controlled shell interpolation.

- [ ] RED: command runner accepts argv arrays only; rejects shell-string construction.
- [ ] RED: UCI reads/writes are explicit and injectable.
- [ ] RED: network/service operations are mocked in unit tests and make no host changes.
- [ ] Implement minimum adapters needed by verified contracts.
- [ ] Full regression.

**Acceptance:** hardware/system side effects are isolated and testable; no license logic is mixed into system readiness.

---

## Task 4: Shared Business State Primitives

**Files:**
- Create: `src/business/money.js`
- Create: `src/business/ids.js`
- Create: `src/business/append-ledger.js`
- Create: `src/business/state-store.js`
- Create corresponding `tests/business/*.test.js`.

- [ ] RED: money uses integer minor units only.
- [ ] RED: stable IDs and idempotent append semantics.
- [ ] RED: atomic/versioned ETHYLNET-owned writes only; no opaque-format overwrite.
- [ ] Implement minimal primitives.
- [ ] Full regression.

**Acceptance:** later voucher/coin/ELOAD/rental modules share deterministic state primitives with no entitlement dependency.

---

## Task 5: Session, Voucher, and Customer-Time Engine

**Files:**
- Create: `src/session/session-contract.js`
- Create: `src/session/session-store.js`
- Create: `src/session/session-engine.js`
- Create: `src/voucher/voucher-contract.js`
- Create: `src/voucher/voucher-store.js`
- Create: `src/voucher/voucher-service.js`
- Create corresponding tests.

Use protected runtime paths as compatibility boundaries; unknown legacy formats stay read-only until independently proven.

- [ ] RED: session time only changes through explicit business events.
- [ ] RED: no expiry/trial behavior exists at application/product level.
- [ ] RED: voucher redemption is idempotent and cannot fabricate credit.
- [ ] RED: restart/persistence semantics are deterministic.
- [ ] Implement minimum clean-room engine.
- [ ] Full regression.

**Acceptance:** customer access time is business/session state, never product-license state.

---

## Task 6: Coin/Vendo and Rate Engine

**Files:**
- Create: `src/vendo/vendo-contract.js`
- Create: `src/vendo/rate-engine.js`
- Create: `src/vendo/coin-events.js`
- Create: `src/vendo/coin-adapter.js`
- Create corresponding tests.

Use Step 75 `vendoconfig.json` only for fields actually observed; do not guess undocumented meanings.

- [ ] RED: pulse event -> explicit monetary/time transaction.
- [ ] RED: duplicate event is idempotent.
- [ ] RED: invalid rates fail closed without disabling unrelated features.
- [ ] RED: hardware adapter is injectable; unit tests touch no GPIO.
- [ ] Implement clean-room rate/event logic.
- [ ] Full regression.

**Acceptance:** core vendo/session behavior no longer depends on `index.o`.

---

## Task 7: PPPoE Clean-Room Foundation

**Starting evidence:** parked `feature/pppoe-compatibility` docs-only branch and verified local backend boundary `127.0.0.1:3002`.

**Files:** follow the approved PPPoE design; expected under `src/pppoe/` and `tests/pppoe/`.

- [ ] Rebase/cherry-pick only the approved PPPoE design documentation into the cutover branch.
- [ ] TDD exact protected paths and listener ownership.
- [ ] Do not invent original HTTP routes; verified original PPPoE routes remain zero unless new evidence is obtained.
- [ ] Implement the minimum ETHYLNET-owned PPPoE state/service boundary required for parity.
- [ ] Verify native OpenWrt PPPoE service/config interaction through adapters, not shell interpolation.
- [ ] Full regression.

**Acceptance:** PPPoE no longer requires an opaque JS module; undocumented provider/API behavior is not fabricated.

---

## Task 8: ELOAD Clean-Room Foundation

**Starting evidence:** parked `feature/eload-compatibility` design at `3234ca6` plus verified protected paths.

**Files:** per approved ELOAD design under `src/eload/` and `tests/eload/`.

- [ ] Bring approved design docs into the cutover branch without copying unrelated project code.
- [ ] TDD immutable contract, safe paths, transaction states, ledger, provider adapter, composition.
- [ ] No hard-coded provider endpoint or credential.
- [ ] No successful sale unless an explicit provider adapter returns verified success.
- [ ] No destructive write to unknown original ELOAD schemas.
- [ ] Full regression.

**Acceptance:** ELOAD core is ETHYLNET-owned and contains no license/activation dependency.

---

## Task 9: Rental, Sub-Vendo, Reseller, and Admin Backend Boundaries

**Files:**
- Create clean-room contracts/services under `src/rental/`, `src/subvendo/`, `src/reseller/`, and verified admin API composition only where evidence exists.
- Create corresponding tests.

- [ ] TDD feature contracts independently; do not duplicate session/coin logic.
- [ ] Keep unknown routes unavailable rather than fabricating payloads.
- [ ] Connect existing UI shells only to verified/new explicitly defined ETHYLNET APIs.
- [ ] Full regression.

**Acceptance:** UI/business surfaces have no runtime dependency on the legacy backend.

---

## Task 10: Application Composition and Local Listener Parity

**Files:**
- Update: `src/runtime/app.js`
- Update: `bin/ethyl-core.js`
- Update/create composition modules and tests.

- [ ] RED: full composition starts without any license/key file.
- [ ] RED: no construction-time external network request.
- [ ] RED: local listeners use the verified port ownership and bind policy.
- [ ] RED: failure in an optional module does not globally disable unrelated local modules.
- [ ] Integrate storage, session, voucher, vendo, PPPoE, ELOAD, rental/sub-vendo/reseller boundaries.
- [ ] Full regression.

**Acceptance:** `/usr/bin/node /soft/ethyl-core/bin/ethyl-core.js` can own the application lifecycle without `index.o`.

---

## Task 11: Target-Rootfs Staging and Legacy-Core Absence Guard

**Files:**
- Create: `integration/openwrt/soft.init`
- Create: `integration/openwrt/install-ethyl-core.sh` or equivalent deterministic staging script.
- Create: `tests/integration/openwrt-cutover.test.js`.

- [ ] RED: staged rootfs must fail verification if `/soft/index.o` exists.
- [ ] RED: staged rootfs must fail if any startup/config/script references `/soft/index.o`.
- [ ] RED: staged init must launch only `/usr/bin/node /soft/ethyl-core/bin/ethyl-core.js` via procd.
- [ ] RED: staged init has no fallback to legacy core.
- [ ] Implement deterministic staging in a disposable rootfs tree only.
- [ ] Verify ownership/modes and local Nginx contract.
- [ ] Full regression.

**Acceptance:** a staged target tree is structurally incapable of launching the legacy backend.

---

## Task 12: Full Parity and Offline No-License Runtime Gate

- [ ] Run every unit/integration test.
- [ ] Run clean-room backend in a no-WAN sandbox and prove local startup succeeds without a license/key file.
- [ ] Verify no product-license/activation/trial/entitlement tokens in production source except explicitly permitted explanatory constants.
- [ ] Verify no hard-coded vendor license host/IP.
- [ ] Verify all required local features that have implemented parity can initialize independently.
- [ ] Produce a feature-parity matrix: `PASS`, `BLOCKED_BY_UNKNOWN_EXTERNAL_CONTRACT`, or `NOT_YET_IMPLEMENTED`; no silent success.
- [ ] Do not proceed to firmware cutover if a required release feature is not `PASS`.

**Acceptance:** code-level parity gate approves legacy-core removal.

---

## Task 13: Firmware Cutover — Remove `/soft/index.o`

Only after Task 12 is fully GREEN for required release features.

- [ ] Copy the verified raw candidate to a new integration candidate; preserve MBR, p1, partition geometry, and 282-byte trailer.
- [ ] Stage `/soft/ethyl-core/` plus exact init integration into p2.
- [ ] Replace `/etc/init.d/soft` content with the verified ETHYLNET procd launcher.
- [ ] Remove `/soft/index.o` from the target rootfs.
- [ ] Remove any rc/startup/fallback reference to the legacy executable.
- [ ] Keep the external frozen audit copy unchanged and hash-verified.
- [ ] Do not fsck-repair the image.

**Acceptance:** release candidate contains no legacy core and preserves image geometry.

---

## Task 14: Strict Post-Cutover Release Verification

- [ ] Rootfs inventory proves `/soft/index.o` absent.
- [ ] Whole-rootfs text/binary-name scan proves no executable/fallback reference to `index.o`.
- [ ] Init/service scan proves only ETHYLNET core starts.
- [ ] Ngrok and ZeroTier remain absent.
- [ ] Dropbear and generic WireGuard remain present.
- [ ] Nginx target ARM syntax test passes.
- [ ] MBR/disk ID/p1/p2 geometry/trailer hashes remain valid.
- [ ] Full test suite passes freshly.
- [ ] Generate strict delta report against the current verified candidate.
- [ ] Physical Orange Pi One smoke test is the final runtime parity gate before stable packaging.

**Acceptance:** no opaque backend exists in the candidate and required behavior is verified.

---

## Task 15: Literal Final Packaging

This remains the last step only after physical smoke-test approval.

- [ ] Compress the verified raw image as `.img.gz` only.
- [ ] Decompress-hash verification must reproduce the verified raw SHA-256.
- [ ] Generate final SHA-256 and release manifest.
- [ ] Release branding: `NO KEY NEEDED`, `INSTALL ON UNLIMITED BOARDS`, `MADE BY: ETHYLNET` only after all no-license and parity gates pass.

## Review Focus Before Execution

1. Are all required release features represented before legacy-core removal?
2. Is every unknown original contract handled as unknown rather than guessed?
3. Is `/soft/index.o` structurally forbidden from the final rootfs and startup path?
4. Does the plan preserve business data and avoid destructive legacy-schema migration?
5. Are all external-provider operations explicit adapters rather than hidden dependencies?
6. Is every production task TDD-gated before implementation?
