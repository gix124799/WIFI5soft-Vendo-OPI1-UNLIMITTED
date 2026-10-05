# ETHYLNET SQLite Offline Backend Design

## Goal

Replace the opaque backend with an ETHYLNET-owned local system whose normal business functions require no cloud service:

Frontend -> Local Backend/API -> SQLite

Optional eLoad/ePay provider adapters are the only components allowed to require external network access.

## Runtime

- Target: Orange Pi One, ImmortalWrt/WiFi5-Soft snapshot r32868-1ceaac207b.
- Target Node: `/usr/bin/node` v18.20.5 ARM musl.
- SQLite engine: vendored `sql.js` WebAssembly, target-proven under the firmware Node runtime.
- No CDN, package feed, activation server, cloud database, telemetry service, remote tunnel, or external API is required for local startup.

## Persistent Database

Default database path:

`/mnt/wifi5/ethyl/ethyl.sqlite`

The database is a real SQLite file (`SQLite format 3`). Because sql.js holds the working database in memory, every committed write transaction must persist through an atomic sequence:

1. export SQLite bytes;
2. write a sibling temporary file;
3. fsync the temporary file;
4. rename over the database path;
5. fsync the containing directory where supported.

Startup loads the existing SQLite file if present. Missing DB creates a new database and migrations. Existing unknown legacy files under `/mnt/wifi5` are never truncated or silently converted.

## Schema

Versioned migrations create ETHYLNET-owned tables:

- `schema_meta`
- `settings`
- `devices`
- `users`
- `sessions`
- `vouchers`
- `voucher_redemptions`
- `vendo_rates`
- `coin_events`
- `sales`
- `transactions`
- `pppoe_accounts`
- `pppoe_sessions`
- `provider_operations`
- `idempotency_keys`
- `audit_events`

Money is stored as integer minor units. Durations are integer seconds. Timestamps are integer Unix milliseconds. Boolean values use INTEGER 0/1. JSON is permitted only for explicitly versioned metadata fields and never for core monetary/account state.

## Transaction Rules

- Every business mutation runs in an explicit SQLite transaction.
- Duplicate external/hardware events use idempotency keys.
- Voucher redemption is single-use/idempotent by database constraint.
- Coin events, sales, and transactions are append-only business records.
- Account/session balance changes and corresponding transaction rows commit atomically.
- Database persistence happens only after a successful transaction.
- A failed persistence write leaves the previous DB file intact and reports failure; it must not claim business success.

## Local API

The existing HTTP listener ownership remains `localhost:3000` and `localhost:3001` behind Nginx.

ETHYLNET-owned APIs are local-only and grouped by service:

- health/system
- settings
- devices/users
- sessions
- vouchers
- vendo/rates/coin events
- sales/transactions
- PPPoE accounts/sessions
- provider operation status

Legacy short route names such as `/a_1`, `/a_2`, `/c_2`, and `/c_3` are reserved compatibility aliases. Static audit did not recover their original payload semantics, so they must not be given fabricated legacy meanings. Each alias may be enabled only when mapped to an explicitly tested ETHYLNET local operation or when new runtime evidence establishes the original contract.

## Offline Boundary

Normal local functions must start and work with zero WAN connectivity:

- admin/portal
- settings
- devices/users
- sessions/time
- vouchers
- vendo rates
- coin event accounting
- sales/transactions
- PPPoE local account data and local service composition

Optional external provider modules:

- eLoad
- ePay/online payment

Provider modules are disabled/degraded when offline and must never disable unrelated local functions. Provider credentials and endpoints are configuration, not hard-coded production secrets.

## No-License / No-Opaque-Core Boundary

The replacement contains no product-key validation, activation server dependency, trial/expiry gate, board entitlement, feature entitlement, license refresh, license cache, or vendor licensing hostname/IP.

Final release gates require:

- `/soft/index.o` absent from the release rootfs;
- no startup/fallback reference to `/soft/index.o`;
- `/etc/init.d/soft` starts only `/usr/bin/node /soft/ethyl-core/bin/ethyl-core.js`;
- normal local startup succeeds without WAN, key, activation, or license files.

## Backup and Integrity

- Keep one last-known-good backup before schema migration or explicit backup operation.
- Run `PRAGMA integrity_check` on startup before accepting writes.
- Refuse writes if integrity check fails; do not overwrite the damaged DB.
- Provide deterministic export/backup tooling.
- Database path must stay under the configured persistent state root.

## Security

- SQL values use bound parameters only.
- No request value may become SQL syntax, table name, or column name.
- Request bodies have a strict size limit.
- JSON responses never include secrets.
- No shell interpolation from customer/API input.
- Privileged system actions are isolated behind tested adapters.
- Unknown routes fail closed.

## Test Strategy

Every production change follows RED -> GREEN -> full regression.

Required test layers:

1. SQLite target-runtime proof under ARM Node 18.
2. Schema/migration tests.
3. Restart persistence tests.
4. Atomic-write failure tests.
5. Repository/service unit tests.
6. Idempotency and transaction rollback tests.
7. Local API integration tests.
8. No-WAN startup tests.
9. OpenWrt staging tests.
10. Firmware rootfs and image-geometry verification.
11. Physical Orange Pi smoke test before stable packaging.

## Acceptance

The backend replacement is ready for firmware cutover only when required local features are backed by SQLite, pass restart/offline tests, and no required feature still depends on the opaque core. Final `.img.gz` packaging remains the literal last step after physical smoke-test approval.
