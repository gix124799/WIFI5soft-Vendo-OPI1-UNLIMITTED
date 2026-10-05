# ETHYLNET Core Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and test the clean-room ETHYLNET core foundation without modifying the firmware image or implementing unresolved business behavior.

**Architecture:** Implement a small Node.js 18-compatible CommonJS application foundation using only Node built-ins for this milestone. Configuration, logging, subsystem health, storage primitives, and bootstrap are separate modules with explicit interfaces. All tests use temporary directories; `/mnt/wifi5` is never modified during this plan.

**Tech Stack:** Node.js 18-compatible CommonJS, Node built-in `node:test`, `node:assert/strict`, `fs`, `path`, `crypto`, and built-in process APIs. No production npm dependencies in this milestone.

**Spec:** `docs/superpowers/specs/2026-10-05-ethyl-core-clean-room-design.md`

## Global Constraints

- Do not modify the raw firmware image during this plan.
- Do not modify or replace the original `index.o`.
- Do not implement product-key, activation, trial, expiry, board-entitlement, or hidden feature-entitlement logic.
- Do not patch opaque V8 `STORE_BLOB` code.
- Do not implement PPPoE business logic in this plan.
- Do not implement coin, voucher, billing, reseller, rental, ELOAD, or admin/portal business semantics in this plan.
- `/mnt/wifi5` is the production compatibility boundary, but all automated tests must use temporary fixture directories.
- Do not automatically repair or mutate the firmware ext4 filesystem.
- Ngrok and ZeroTier remain outside the replacement design.
- Dropbear/local SSH and recovery are outside this plan and must remain untouched.
- The final `.img.gz` build remains deferred until all later integration and release gates pass.
- Foundation runtime code must be Node.js 18 compatible.
- Foundation production code must use Node built-ins only.
- Use CommonJS modules for this foundation milestone.
- Every task follows TDD: failing test, confirm failure, minimal implementation, confirm pass, then commit.
- Implementation execution must occur in an isolated Git worktree or equivalent clean implementation branch when execution begins.

## Review Focus

1. Invalid or relative state-root paths must fail closed before any filesystem write; Task 2 owns the test.
2. Logging must redact password, token, secret, and voucher-secret fields without mutating the caller's object; Task 4 owns the test.
3. Atomic-write failure before rename must leave the previous committed file unchanged and clean up the temporary file; Task 5 owns the test.
4. An invalid subsystem state or unknown subsystem name must not silently enter the registry; Task 3 owns the test.
5. Repeated bootstrap `start()` or `stop()` calls must be idempotent and must not duplicate lifecycle transitions; Task 6 owns the test.

---

## File Structure

Create the following files during implementation:

- `package.json`
  - project metadata and test scripts only;
  - no production dependencies for the foundation milestone.

- `src/config/load-config.js`
  - validates environment-derived configuration;
  - resolves the production state root and log level.

- `src/core/subsystem-registry.js`
  - owns subsystem health states and aggregate health snapshots.

- `src/logging/logger.js`
  - structured JSON logging and sensitive-field redaction.

- `src/storage/atomic-file-store.js`
  - safe UTF-8 reads and atomic same-directory writes.

- `src/core/app.js`
  - foundation application lifecycle;
  - composes config, logger, registry, and storage without opening public ports.

- `bin/ethyl-core.js`
  - minimal executable entrypoint for the foundation application.

- `tests/config/load-config.test.js`
  - configuration validation.

- `tests/core/subsystem-registry.test.js`
  - health state registry behavior.

- `tests/logging/logger.test.js`
  - structured logging and redaction.

- `tests/storage/atomic-file-store.test.js`
  - atomic persistence and failure behavior.

- `tests/core/app.test.js`
  - application bootstrap and lifecycle.

No PPPoE, Socket.IO business event, coin, voucher, billing, reseller, rental, ELOAD, or UI module is created in this plan.

---

### Task 1: Runtime Contract and Test Harness

**Files:**
- Create: `package.json`
- Create: `bin/ethyl-core.js`
- Test: `tests/runtime.test.js`

**Interfaces:**
- Consumes: Node.js runtime only.
- Produces:
  - package test command: `npm test`
  - executable module path: `bin/ethyl-core.js`
  - runtime floor assertion: Node major version must be at least 18.

- [ ] **Step 1: Write the failing runtime test**

Create `tests/runtime.test.js` with tests that assert:

- current Node major version is `>= 18`;
- `package.json` exists;
- `package.json` uses CommonJS;
- `package.json` has no production dependencies;
- `bin/ethyl-core.js` exists.

- [ ] **Step 2: Run the test and confirm failure**

Run:

    node --test tests/runtime.test.js

Expected:

    FAIL

because `package.json` and `bin/ethyl-core.js` do not yet exist.

- [ ] **Step 3: Create the minimal runtime package contract**

Create `package.json` with:

- name: `ethyl-core`
- private: `true`
- type: `commonjs`
- engines.node: `>=18`
- script `test`: `node --test tests/**/*.test.js`
- no `dependencies`.

Create `bin/ethyl-core.js` as a minimal CommonJS executable placeholder that exports no application behavior yet and exits successfully when directly invoked.

Do not create application modules in this task.

- [ ] **Step 4: Run the runtime test**

Run:

    node --test tests/runtime.test.js

Expected:

    PASS

- [ ] **Step 5: Run the package test command**

Run:

    npm test

Expected:

    PASS

with only the runtime test present.

- [ ] **Step 6: Commit**

Run:

    git add package.json bin/ethyl-core.js tests/runtime.test.js
    git commit -m "chore: establish ethyl core runtime contract"

---

### Task 2: Configuration Loader

**Files:**
- Create: `src/config/load-config.js`
- Create: `tests/config/load-config.test.js`

**Interfaces:**
- Consumes:
  - environment-like plain object.
- Produces:
  - `loadConfig(env = process.env) -> Readonly<{stateRoot: string, logLevel: string}>`
  - `VALID_LOG_LEVELS -> ReadonlyArray<string>`

Exact rules:

- default `stateRoot` is `/mnt/wifi5`;
- override variable is `ETHYL_STATE_ROOT`;
- state root must be an absolute path;
- normalize trailing separators except filesystem root;
- default log level is `info`;
- override variable is `ETHYL_LOG_LEVEL`;
- valid log levels are `debug`, `info`, `warn`, `error`;
- returned config object is frozen.

- [ ] **Step 1: Write failing configuration tests**

Create tests for:

- default state root `/mnt/wifi5`;
- default log level `info`;
- absolute temporary test root accepted;
- relative `ETHYL_STATE_ROOT=fixtures/state` rejected;
- blank state-root override rejected;
- unsupported log level rejected;
- returned object is frozen.

Review Focus test:

- a relative state-root path must throw before any storage module is invoked.

- [ ] **Step 2: Run and confirm failure**

Run:

    node --test tests/config/load-config.test.js

Expected:

    FAIL

because `src/config/load-config.js` does not exist.

- [ ] **Step 3: Implement the configuration interface**

In `src/config/load-config.js`, implement exactly:

    loadConfig(env = process.env)
    VALID_LOG_LEVELS

Use `path.isAbsolute()` and `path.normalize()`.

Do not access the filesystem in the config loader.

- [ ] **Step 4: Run configuration tests**

Run:

    node --test tests/config/load-config.test.js

Expected:

    PASS

- [ ] **Step 5: Run all tests**

Run:

    npm test

Expected:

    PASS

- [ ] **Step 6: Commit**

Run:

    git add src/config/load-config.js tests/config/load-config.test.js
    git commit -m "feat: add validated core configuration"

---

### Task 3: Subsystem Health Registry

**Files:**
- Create: `src/core/subsystem-registry.js`
- Create: `tests/core/subsystem-registry.test.js`

**Interfaces:**
- Consumes:
  - subsystem names supplied at construction.
- Produces:
  - `STATES`
  - `createSubsystemRegistry(names)`
  - registry method `get(name) -> string`
  - registry method `set(name, state) -> void`
  - registry method `snapshot() -> Readonly<object>`
  - registry method `overall() -> string`

Exact states:

- `READY`
- `DEGRADED`
- `FAILED`
- `DISABLED`

Aggregate precedence:

1. `FAILED`
2. `DEGRADED`
3. `READY`
4. `DISABLED`

If all registered subsystems are `DISABLED`, overall state is `DISABLED`.

Initial state for every registered subsystem is `DISABLED`.

- [ ] **Step 1: Write failing registry tests**

Test:

- initial state is `DISABLED`;
- registered subsystem can transition to each valid state;
- `snapshot()` returns an immutable copy rather than internal mutable state;
- overall state follows the required precedence;
- duplicate subsystem names are rejected.

Review Focus tests:

- unknown subsystem name passed to `get()` or `set()` throws;
- invalid state passed to `set()` throws.

- [ ] **Step 2: Run and confirm failure**

Run:

    node --test tests/core/subsystem-registry.test.js

Expected:

    FAIL

- [ ] **Step 3: Implement the registry**

Implement:

    const STATES = Object.freeze({
      READY: 'READY',
      DEGRADED: 'DEGRADED',
      FAILED: 'FAILED',
      DISABLED: 'DISABLED'
    })

and:

    createSubsystemRegistry(names)

The returned registry must not expose its internal mutable map.

- [ ] **Step 4: Run registry tests**

Run:

    node --test tests/core/subsystem-registry.test.js

Expected:

    PASS

- [ ] **Step 5: Run all tests**

Run:

    npm test

Expected:

    PASS

- [ ] **Step 6: Commit**

Run:

    git add src/core/subsystem-registry.js tests/core/subsystem-registry.test.js
    git commit -m "feat: add subsystem health registry"

---

### Task 4: Structured Logger with Redaction

**Files:**
- Create: `src/logging/logger.js`
- Create: `tests/logging/logger.test.js`

**Interfaces:**
- Consumes:
  - `createLogger({level, write, clock})`
  - `write(line: string) -> void`
  - `clock() -> Date`
- Produces:
  - logger methods `debug(message, fields?)`
  - `info(message, fields?)`
  - `warn(message, fields?)`
  - `error(message, fields?)`

Every emitted line is one JSON object containing:

- `ts`
- `level`
- `message`
- optional sanitized `fields`.

Sensitive key matching is case-insensitive and applies recursively to keys named:

- `password`
- `token`
- `secret`
- `voucherSecret`

Redacted value is exactly:

    [REDACTED]

The logger must not mutate the caller's object.

- [ ] **Step 1: Write failing logger tests**

Test:

- deterministic timestamp with injected clock;
- valid JSON output;
- log-level filtering;
- nested sensitive fields are redacted;
- ordinary fields are preserved;
- caller input object remains unchanged.

Review Focus test:

- nested password/token/secret/voucherSecret values are redacted without mutating input.

- [ ] **Step 2: Run and confirm failure**

Run:

    node --test tests/logging/logger.test.js

Expected:

    FAIL

- [ ] **Step 3: Implement the logger**

Implement:

    createLogger({level = 'info', write = line => process.stdout.write(line + '\n'), clock = () => new Date()})

Use a recursive sanitization function internal to the module.

Do not log arbitrary process environment variables.

- [ ] **Step 4: Run logger tests**

Run:

    node --test tests/logging/logger.test.js

Expected:

    PASS

- [ ] **Step 5: Run all tests**

Run:

    npm test

Expected:

    PASS

- [ ] **Step 6: Commit**

Run:

    git add src/logging/logger.js tests/logging/logger.test.js
    git commit -m "feat: add redacting structured logger"

---

### Task 5: Atomic File Store

**Files:**
- Create: `src/storage/atomic-file-store.js`
- Create: `tests/storage/atomic-file-store.test.js`

**Interfaces:**
- Consumes:
  - `createAtomicFileStore({root, fsImpl, randomBytes})`
- Produces:
  - `readUtf8(relativePath) -> Promise<string>`
  - `writeUtf8(relativePath, content) -> Promise<void>`

Exact safety rules:

- `root` must already be an absolute path;
- requested paths are relative to `root`;
- reject absolute requested paths;
- reject traversal outside `root`;
- temporary file is created in the destination directory;
- write complete content to the temporary file;
- fsync the temporary file;
- close it;
- rename temp file over destination atomically;
- fsync destination directory when supported;
- best-effort cleanup of temp file after a failed operation;
- never truncate the existing destination before rename succeeds.

Tests use only temporary directories.

- [ ] **Step 1: Write failing storage tests**

Test:

- UTF-8 write then read;
- nested relative path within root;
- absolute requested path rejected;
- `../` traversal rejected;
- existing committed destination replaced only after successful write;
- temporary files are not left after success.

Review Focus test:

- inject a rename failure while an older destination exists;
- operation rejects;
- old destination content remains byte-for-byte unchanged;
- temporary file is cleaned up.

- [ ] **Step 2: Run and confirm failure**

Run:

    node --test tests/storage/atomic-file-store.test.js

Expected:

    FAIL

- [ ] **Step 3: Implement atomic storage**

Implement:

    createAtomicFileStore({
      root,
      fsImpl = require('node:fs/promises'),
      randomBytes = require('node:crypto').randomBytes
    })

`writeUtf8()` must use a same-directory temporary filename.

No migration, schema conversion, or firmware-specific business behavior belongs in this module.

- [ ] **Step 4: Run storage tests**

Run:

    node --test tests/storage/atomic-file-store.test.js

Expected:

    PASS

- [ ] **Step 5: Run all tests**

Run:

    npm test

Expected:

    PASS

- [ ] **Step 6: Commit**

Run:

    git add src/storage/atomic-file-store.js tests/storage/atomic-file-store.test.js
    git commit -m "feat: add crash-safe atomic file storage"

---

### Task 6: Foundation Application Lifecycle

**Files:**
- Create: `src/core/app.js`
- Modify: `bin/ethyl-core.js`
- Create: `tests/core/app.test.js`

**Interfaces:**
- Consumes:
  - `loadConfig()`
  - `createLogger(...)`
  - `createSubsystemRegistry(names)`
  - `createAtomicFileStore(...)`
- Produces:
  - `createApp({config, logger, registry, store})`
  - app method `start() -> Promise<void>`
  - app method `stop() -> Promise<void>`
  - app method `health() -> Readonly<object>`
  - app method `isStarted() -> boolean`

Foundation subsystem names:

- `core`
- `storage`

Startup behavior:

- initial subsystem states are `DISABLED`;
- successful `start()` marks `storage` then `core` as `READY`;
- no public network port is opened;
- `start()` is idempotent;
- `stop()` marks `core` then `storage` as `DISABLED`;
- `stop()` is idempotent.

`health()` returns:

- overall status;
- subsystem snapshot;
- no credentials;
- no full environment dump;
- no license state because no product-license subsystem exists.

- [ ] **Step 1: Write failing application tests**

Test:

- fresh app is stopped;
- fresh health shows both subsystems `DISABLED`;
- successful start marks both `READY`;
- successful stop marks both `DISABLED`;
- health object is a snapshot, not mutable internal state;
- foundation app does not create a network listener.

Review Focus tests:

- calling `start()` twice produces one lifecycle transition only;
- calling `stop()` twice produces one shutdown transition only.

- [ ] **Step 2: Run and confirm failure**

Run:

    node --test tests/core/app.test.js

Expected:

    FAIL

- [ ] **Step 3: Implement the foundation app**

Implement:

    createApp({config, logger, registry, store})

Do not add HTTP, PPPoE, Socket.IO, or business subsystem behavior.

Update `bin/ethyl-core.js` to:

1. load configuration;
2. construct logger;
3. construct registry for `core` and `storage`;
4. construct atomic store from the configured state root;
5. construct app;
6. call `start()`;
7. log one successful foundation-start message;
8. install SIGINT/SIGTERM handlers that call `stop()` once.

Do not make any state-file write during startup.

- [ ] **Step 4: Run application tests**

Run:

    node --test tests/core/app.test.js

Expected:

    PASS

- [ ] **Step 5: Run complete foundation suite**

Run:

    npm test

Expected:

    PASS

with all foundation tests passing.

- [ ] **Step 6: Static license-subsystem guard**

Run:

    grep -RniE \
      'activation-server|product-key|license-refresh|trial-expiry|board-entitlement|feature-entitlement' \
      src bin \
      && exit 1 || true

Expected:

    no matching implementation logic

A documentation comment containing one of these words is not needed and should be avoided.

- [ ] **Step 7: Confirm no firmware paths changed**

Before implementation, record:

    sha256sum "$RAW"
    sha256sum "$CORE"

After Task 6, verify the same hashes:

    eb23e7e2d8cd2067d692e981b643872d68a3ae767877c80743819aab06a50a53
    265ea8da63161c8670b994471f83e899a7928805acb1466113fe3c272f984919

- [ ] **Step 8: Commit**

Run:

    git add bin/ethyl-core.js src tests package.json
    git commit -m "feat: complete ethyl core foundation"

---

## Foundation Plan Completion Gate

The foundation milestone is complete only when all of the following are true:

- all tests pass with `npm test`;
- Node runtime contract requires version 18 or newer;
- config rejects unsafe state-root values;
- subsystem registry rejects invalid names/states;
- logger redacts required sensitive fields;
- atomic storage preserves the previous committed file on failure;
- application lifecycle is idempotent;
- application opens no public listener;
- no product-license subsystem exists;
- no PPPoE or business behavior has been guessed or implemented;
- raw firmware SHA-256 is unchanged;
- original `index.o` SHA-256 is unchanged;
- no final firmware artifact is built.

## Next Plans After Foundation

Once this foundation plan is implemented and independently reviewed, create separate implementation plans in this order:

1. HTTP/service compatibility
2. PPPoE
3. Socket.IO transport/session framework
4. coin/session
5. voucher
6. billing/reseller
7. rental/subvendo
8. ELOAD
9. admin/portal UI
10. full offline regression
11. firmware integration
12. release verification and final `.img.gz` packaging

Each plan must preserve the approved design's confidence labels and must not invent UNRESOLVED original behavior.
