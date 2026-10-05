# ETHYLNET SQLite Offline Backend Cutover Plan

> REQUIRED: execute task-by-task with test-driven-development and verification-before-completion. This plan supersedes the file-store-centered portions of `2026-10-06-ethyl-core-no-license-backend-cutover.md` while retaining its no-legacy-core release gates.

**Goal:** Ship a full local ETHYLNET backend using persistent SQLite, preserve required Orange Pi One local features, isolate optional eLoad/ePay network access, and remove `/soft/index.o` from the final runtime/rootfs after parity gates pass.

**Primary design:** `docs/superpowers/specs/2026-10-06-ethyl-core-sqlite-offline-backend-design.md`

**Target runtime proof:** `sql.js@1.14.2` successfully created, exported, reopened, and queried a `SQLite format 3` database under the firmware ARM `/usr/bin/node` v18.20.5 through QEMU before implementation.

## Global Rules

- Only the current WiFi5-Soft Orange Pi One audit defines compatibility facts.
- Never patch opaque V8 bytecode or force hidden auth/license logic to succeed.
- Do not fabricate unknown legacy API semantics.
- No production code before a watched failing test.
- Normal local features must require zero WAN access.
- eLoad/ePay are optional provider adapters only.
- Preserve unknown existing `/mnt/wifi5` files byte-for-byte unless a separately verified migration is approved.
- Use bound SQL parameters for all data values.
- Money uses integer minor units; duration uses integer seconds; timestamps use integer milliseconds.
- Final firmware must contain no `/soft/index.o` and no startup/fallback reference to it.
- Final packaging remains `.img.gz` and is the literal last step after physical smoke test.

---

## Task 1 — No-License Runtime Guard

Create:
- `src/runtime/no-license-contract.js`
- `tests/runtime/no-license-contract.test.js`
- `tests/runtime/legacy-core-reference-guard.test.js`

RED requirements:
- immutable contract forbids product key, activation, trial, expiry, board entitlement, feature entitlement, license refresh/cache;
- production source scan rejects forbidden licensing implementation tokens and `/soft/index.o` fallback references;
- contract declares `legacyCoreAllowedInRelease: false` and `wanRequiredForLocalFeatures: false`.

GREEN, full regression, commit.

---

## Task 2 — SQLite Dependency and Engine Loader

Update:
- `package.json`
- create `package-lock.json`

Create:
- `src/db/sqlite-engine.js`
- `tests/db/sqlite-engine.test.js`

RED requirements:
- engine creates an in-memory SQLite DB;
- exported bytes start with `SQLite format 3`;
- database can reopen exported bytes;
- WASM is resolved locally from installed package, never CDN/network;
- engine works under Node 18 target semantics.

Then add pinned `sql.js@1.14.2`, implement loader, run host tests and ARM target proof, full regression, commit.

---

## Task 3 — Persistent SQLite Store

Create:
- `src/db/sqlite-store.js`
- `src/db/atomic-db-file.js`
- `tests/db/sqlite-store.test.js`
- `tests/db/atomic-db-file.test.js`

Default DB: `<stateRoot>/ethyl/ethyl.sqlite`.

RED requirements:
- loads existing DB;
- creates parent directory and new DB without touching unrelated files;
- `persist()` exports then temp-write + fsync + rename;
- persistence failure does not replace the previous DB;
- database path cannot escape configured state root;
- `PRAGMA integrity_check` must be `ok` before writable startup;
- close persists cleanly.

GREEN, restart test, full regression, commit.

---

## Task 4 — Versioned Schema and Migrations

Create:
- `src/db/schema.js`
- `src/db/migrations.js`
- `tests/db/schema.test.js`
- `tests/db/migrations.test.js`

Schema tables:
- schema_meta
- settings
- devices
- users
- sessions
- vouchers
- voucher_redemptions
- vendo_rates
- coin_events
- sales
- transactions
- pppoe_accounts
- pppoe_sessions
- provider_operations
- idempotency_keys
- audit_events

RED requirements:
- deterministic schema version;
- new DB migrates to current version;
- second migration run is idempotent;
- unsupported future schema fails closed;
- migrations transact atomically;
- uniqueness and foreign-key constraints enforce core invariants.

GREEN, full regression, commit.

---

## Task 5 — Shared Database Utilities

Create:
- `src/db/query.js`
- `src/db/transaction.js`
- `src/business/money.js`
- `src/business/ids.js`
- `tests/db/query.test.js`
- `tests/db/transaction.test.js`
- `tests/business/money.test.js`
- `tests/business/ids.test.js`

RED requirements:
- values are bound parameters;
- no dynamic table/column names from callers;
- transaction rolls back on error;
- successful transaction persists exactly once;
- integer-money validation;
- stable local IDs and idempotency keys.

GREEN, full regression, commit.

---

## Task 6 — Settings, Devices, and Users

Create repositories/services under:
- `src/settings/`
- `src/devices/`
- `src/users/`
- corresponding tests.

RED requirements:
- settings survive restart;
- devices have stable unique identity;
- user/device upserts do not duplicate records;
- unknown metadata does not overwrite core fields;
- no license/entitlement fields exist.

GREEN, full regression, commit.

---

## Task 7 — Sessions and Customer-Time Engine

Create:
- `src/session/session-repository.js`
- `src/session/session-service.js`
- tests.

RED requirements:
- time changes only through explicit business events;
- adding time is atomic with transaction ledger row;
- restart persistence is exact;
- duplicate idempotency key cannot double-credit;
- exhausted time is customer/session state, never product-license state.

GREEN, full regression, commit.

---

## Task 8 — Vouchers

Create:
- `src/voucher/voucher-repository.js`
- `src/voucher/voucher-service.js`
- tests.

RED requirements:
- create/list/get/redeem;
- unique voucher code;
- redemption atomically records voucher redemption + customer time/credit + transaction;
- retry is idempotent;
- expired voucher semantics apply only to voucher business validity, not product licensing;
- restart persistence.

GREEN, full regression, commit.

---

## Task 9 — Vendo Rates, Coin Events, Sales, Transactions

Create modules under:
- `src/vendo/`
- `src/sales/`
- `src/transactions/`
- tests.

RED requirements:
- persistent rate table;
- pulse/coin event maps only through validated rate;
- duplicate hardware event cannot double-credit;
- sale, transaction, and customer-time mutation are atomic;
- append-only accounting rows;
- restart persistence and totals.

GREEN, full regression, commit.

---

## Task 10 — PPPoE Local Data and Adapter Boundary

Create modules under `src/pppoe/` and tests.

RED requirements:
- account CRUD/state in SQLite;
- password/secret never returned by list endpoints;
- local service side effects injectable/mocked;
- preserve verified backend boundary `127.0.0.1:3002` without claiming unknown original HTTP routes;
- service failure rolls back/marks operation failed without corrupting DB;
- no WAN requirement.

GREEN, full regression, commit.

---

## Task 11 — Optional eLoad/ePay Provider Operations

Bring approved ELOAD design documentation into this branch, then create provider-operation storage and adapters.

RED requirements:
- provider operation is explicitly `pending/succeeded/failed`;
- local DB records request before provider call;
- no success unless provider adapter confirms success;
- offline/unconfigured provider returns explicit unavailable state;
- provider outage never disables vouchers, sessions, vendo, PPPoE, admin, or portal;
- no hard-coded credentials/endpoints.

GREEN, full regression, commit.

---

## Task 12 — Local API Layer

Create:
- `src/api/body.js`
- `src/api/json.js`
- `src/api/register-local-api.js`
- feature handlers and integration tests.

Required ETHYLNET local routes include explicit versioned routes for health, settings, devices/users, sessions, vouchers, rates, coin events, sales, transactions, PPPoE, and provider status.

Compatibility aliases `/a_1`, `/a_2`, `/c_2`, `/c_3` are registered only to documented/tested ETHYLNET operations; they are not represented as recovered original semantics.

RED requirements:
- strict request body size;
- content-type validation;
- safe JSON errors;
- no secrets in responses;
- unknown route 404;
- mutation endpoints transact/persist before success response;
- read endpoints operate offline.

GREEN, full HTTP integration test, commit.

---

## Task 13 — UI Integration

Update existing admin/portal JS to call only local API routes.

RED requirements:
- dashboard reads real local data;
- settings/voucher/session/vendo pages use local backend;
- no fabricated live values;
- provider-only features show offline/unavailable state cleanly;
- no direct cloud request from frontend;
- no external CDN/font/script.

GREEN, static/UI tests + local server integration, commit.

---

## Task 14 — Application Composition

Update:
- `src/core/app.js`
- `bin/ethyl-core.js`
- composition tests.

RED requirements:
- initialize DB + migrations before business/API listeners;
- local listeners remain localhost:3000/3001;
- start succeeds with no WAN and no license/key file;
- optional provider module can fail without global startup failure;
- graceful shutdown persists/close DB and stops HTTP cleanly.

GREEN, full regression, commit.

---

## Task 15 — OpenWrt Staging and Legacy-Core Absence

Create:
- `integration/openwrt/soft.init`
- deterministic staging script
- integration tests.

RED requirements:
- staged rootfs fails gate if `/soft/index.o` exists;
- no startup/config/script may reference it;
- init launches only `/usr/bin/node /soft/ethyl-core/bin/ethyl-core.js`;
- runtime dependencies include vendored `sql.js` JS/WASM locally;
- database directory resides on persistent `/mnt/wifi5`;
- Ngrok/ZeroTier remain absent; Dropbear/generic WireGuard remain preserved.

GREEN, full regression, commit.

---

## Task 16 — Offline Runtime and Persistence Gate

Execute in disposable target-like rootfs:
- start backend with isolated/no-WAN network namespace;
- exercise settings, device, session, voucher, vendo/coin, sales/transaction and PPPoE-data APIs;
- stop and restart;
- prove all committed state survives;
- corrupt-copy test proves integrity failure is detected without overwriting source DB;
- verify provider routes degrade explicitly while local functions stay operational.

Produce a feature parity matrix. Required local release features must be PASS before firmware cutover.

---

## Task 17 — Firmware Cutover

Only after Task 16 is green:
- copy current verified raw candidate;
- stage `/soft/ethyl-core` and dependencies;
- replace `/etc/init.d/soft` with ETHYLNET launcher;
- remove `/soft/index.o`;
- remove every startup/fallback reference;
- preserve Nginx/UI routes, MBR, p1/p2 geometry and 282-byte trailer;
- no filesystem repair.

---

## Task 18 — Strict Post-Cutover Verification

Verify:
- `/soft/index.o` absent;
- no legacy-core reference anywhere in executable/startup config;
- full tests green;
- ARM target backend starts with no WAN;
- SQLite persistence/restart test green;
- target ARM Nginx syntax test green;
- Ngrok/ZeroTier absent;
- Dropbear/WireGuard present;
- image geometry/trailer preserved;
- strict rootfs delta report generated.

Physical Orange Pi One smoke test remains the final runtime/hardware gate.

---

## Task 19 — Literal Final Packaging

Only after physical smoke-test approval:
- compress verified raw image as `.img.gz`;
- decompressed SHA-256 must equal verified raw SHA-256;
- generate release hash/manifest;
- no alternative archive format.
