# ETHYL Core HTTP / Service Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a clean-room HTTP/service compatibility layer for the two independently evidenced application upstreams `localhost:3000` and `localhost:3001`.

**Architecture:** Nginx retains ownership of external HTTP/TLS listeners. ETHYL Core owns only the application service endpoints associated with the preserved upstream tokens `localhost:3000` and `localhost:3001`. The literal hostname `localhost` is preserved because current evidence does not prove a specific IPv4 or IPv6 mapping.

**Tech Stack:** Node.js >=18, CommonJS, built-in `node:http`, built-in `node:test`, no new production dependencies.

**Spec:** `docs/superpowers/specs/2026-10-05-ethyl-core-clean-room-design.md`

## Global Constraints

- No firmware image modification during this milestone.
- Do not modify frozen original `/soft/index.o`.
- Application upstream host token is exactly `localhost`.
- Application upstream ports are exactly `3000` and `3001`.
- Do not replace `localhost` with `127.0.0.1` or `::1`.
- Port `3002` remains reserved for the separately mapped PPPoE-related backend.
- Port `7681` remains reserved for the separately mapped terminal-related backend.
- Nginx retains ports `80`, `443`, `4455`, `8081`, and `4400`.
- Do not invent unresolved admin, portal, coin, voucher, session, billing, reseller, rental, ELOAD, PPPoE, or Socket.IO APIs.
- Do not implement activation, licensing, trial, entitlement, product-key, board-key, or feature-key systems.
- Preserve committed clean-room reference files byte-for-byte.
- Every implementation task uses RED -> GREEN TDD.
- Requiring/importing a module must never start a listener.
- `bin/ethyl-core.js` remains unchanged during this milestone.

## Review Focus

1. Preserve `localhost` literally.
2. Listener startup failure must be clean and retryable.
3. Failure of the second listener must roll back the first.
4. Handler exceptions must not leak sensitive information.
5. Protected/reserved ports must never be owned by this HTTP layer.

---

### Task 1: Encode Preserved HTTP Network Contract

**Files:**
- Create: `src/http/http-contract.js`
- Create: `tests/http/http-contract.test.js`

**Produces:**
- `getHttpContract()`

Exact values:

- `host = "localhost"`
- `upstream3000.host = "localhost"`
- `upstream3000.port = 3000`
- `upstream3001.host = "localhost"`
- `upstream3001.port = 3001`
- `reserved.pppoe.port = 3002`
- `reserved.terminal.port = 7681`
- `nginxExternalPorts = [80, 443, 4455, 8081, 4400]`

- [ ] Write failing tests.
- [ ] Prove RED.
- [ ] Implement immutable contract.
- [ ] Run target test.
- [ ] Run complete suite.
- [ ] Commit.

---

### Task 2: Exact HTTP Route Registry

**Files:**
- Create: `src/http/router.js`
- Create: `tests/http/router.test.js`

**Produces:**
- `createRouter({ logger })`
- `register(method, pathname, handler)`
- `handle(request, response)`
- `routeCount()`

Requirements:

- exact method/path matching;
- uppercase method normalization;
- query strings excluded from route identity;
- duplicate routes rejected;
- invalid paths rejected;
- unknown route -> controlled 404;
- handler errors -> controlled 500;
- no stack/error leakage;
- no built-in business routes.

- [ ] Write failing tests.
- [ ] Prove RED.
- [ ] Implement minimal router.
- [ ] Run full suite.
- [ ] Commit.

---

### Task 3: Localhost HTTP Listener Lifecycle

**Files:**
- Create: `src/http/http-listener.js`
- Create: `tests/http/http-listener.test.js`

Requirements:

- host exactly `localhost`;
- port range 1-65535;
- no bind during import/construction;
- start/stop idempotent;
- stop-before-start safe;
- failed start leaves listener stopped;
- failed start can be retried.

- [ ] Write failing tests.
- [ ] Prove RED.
- [ ] Implement using built-in `node:http`.
- [ ] Run full suite.
- [ ] Commit.

---

### Task 4: Transactional HTTP Service Group

**Files:**
- Create: `src/http/http-service-group.js`
- Create: `tests/http/http-service-group.test.js`

Requirements:

- start 3000 then 3001;
- stop 3001 then 3000;
- both use `localhost`;
- never own 3002 or 7681;
- never own Nginx ports;
- failed 3001 start rolls back 3000;
- no partial-running state.

- [ ] Write failing tests.
- [ ] Prove RED.
- [ ] Implement.
- [ ] Run full suite.
- [ ] Commit.

---

### Task 5: HTTP Layer Composition

**Files:**
- Create: `src/http/index.js`
- Create: `tests/http/http-layer.test.js`

Produces:

- `createHttpLayer(...)`
- `contract`
- `upstream3000Router`
- `upstream3001Router`
- `start`
- `stop`
- `isStarted`
- `snapshot`

Requirements:

- zero pre-registered business routes;
- no bind during import;
- no bind during construction;
- later verified routes may be registered before start;
- `bin/ethyl-core.js` unchanged.

- [ ] Write failing tests.
- [ ] Prove RED.
- [ ] Implement.
- [ ] Run full suite.
- [ ] Commit.

---

### Task 6: Compatibility Regression Guard

**Files:**
- Create: `tests/http/http-compatibility-guard.test.js`

Requirements:

- literal `localhost` preserved;
- do not silently replace with `127.0.0.1` or `::1`;
- only application ports 3000/3001 are owned;
- 3002/7681 remain reserved;
- 80/443/4455/8081/4400 remain Nginx-owned;
- no unresolved business API;
- no activation/license/trial/entitlement subsystem;
- reference hashes remain unchanged.

- [ ] Write guard tests.
- [ ] Run complete suite.
- [ ] Run syntax/static gates.
- [ ] Commit.

---

## Milestone Completion Gate

- Tasks 1-6 committed.
- Full `npm test` passes.
- Host token remains exactly `localhost`.
- Application ports remain exactly 3000/3001.
- Ports 3002/7681 remain outside HTTP ownership.
- Nginx ports remain outside HTTP ownership.
- No unresolved business API invented.
- No licensing/activation/trial/entitlement implementation.
- `bin/ethyl-core.js` does not auto-start HTTP.
- Clean-room references remain unchanged.
- Raw firmware remains unchanged.
- Frozen original core remains unchanged.
- No final firmware is built or packaged.
