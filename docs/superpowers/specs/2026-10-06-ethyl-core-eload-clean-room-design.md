# ETHYLNET Clean-Room ELOAD Compatibility Design

## 1. Goal

Build an ETHYLNET-owned ELOAD subsystem for the Orange Pi One clean-room
application while preserving the existing firmware's ELOAD/business
compatibility boundaries.

The subsystem must not depend on opaque V8 business logic, undocumented
provider behavior, or code copied from another ETHYLNET/TarakiFi project.

The final ELOAD subsystem is intended to support:

1. configuration
2. product/provider abstraction
3. purchase preparation
4. transaction state
5. cash-in accounting
6. online-payment accounting
7. sales accounting
8. failure/retry handling
9. later portal/admin integration

This design does not yet define an external telco/provider API.

---

## 2. Source Boundary

Only evidence belonging to:

`ETHYLNET-OrangePiOne-Audit-20261005-031126`

may define compatibility behavior for this milestone.

Code or routes from MiniPC, TarakiFi, LPB, WIFIngBAYAN, Ruijie, or any
other project are not compatibility evidence for this implementation.

They must not be copied into this subsystem merely because they contain
an ELOAD feature with a similar name.

---

## 3. Verified Existing Compatibility Evidence

The current firmware audit identifies the following protected runtime
contract paths:

- `/mnt/wifi5/config/eload.json`
- `/mnt/wifi5/eload/cashinsales`
- `/mnt/wifi5/eload/onlinepayment`
- `/mnt/wifi5/eload/sales`

The firmware audit also identifies the following ELOAD-related concepts
as preserve-only dependencies:

- `eloadpath`
- `eloadsalespath`
- ELOAD configuration/data creation behavior
- payment dependencies used by ELOAD
- online-payment dependencies used by ELOAD
- transaction/business data
- coin functionality
- voucher functionality
- session/customer-credit functionality
- local admin/portal functionality

The audit explicitly warns that the protected ELOAD paths were not
observed as plaintext references in the clean-room-extractable source.
Compiled V8 modules may construct these paths at runtime.

Therefore:

**path existence is evidence; file schema is not.**

---

## 4. Unknown / Unverified Items

The following are not yet verified and must not be guessed:

- structure of `/mnt/wifi5/config/eload.json`
- structure of `/mnt/wifi5/eload/cashinsales`
- structure of `/mnt/wifi5/eload/onlinepayment`
- structure of `/mnt/wifi5/eload/sales`
- whether any of these are files or directories at runtime
- serialization format
- record identifiers
- provider names
- provider URLs
- provider authentication
- product-list schema
- purchase request schema
- purchase response schema
- callback/webhook schema
- retry policy
- balance semantics
- fee/markup semantics
- customer-phone validation rules
- portal ELOAD route names
- admin ELOAD route names

No implementation may invent these as claims about the original firmware.

---

## 5. Opaque-Code Boundary

The original compiled ELOAD logic remains outside the clean-room
implementation boundary.

The project must not:

- patch opaque V8 bytecode
- force opaque ELOAD functions to succeed
- manufacture provider responses
- bypass a provider authentication mechanism
- decode unrelated protected application bundles merely to reproduce
  proprietary behavior

Instead, ETHYLNET will implement its own ELOAD subsystem from documented
or independently defined interfaces.

---

## 6. Architecture

The clean-room subsystem will live under:

`src/eload/`

Initial decomposition:

### `eload-contract.js`

Immutable compatibility and safety contract.

Responsibilities:

- protected paths
- known evidence
- explicitly unresolved fields
- state names
- safety boundaries

It contains no credentials and no provider URL.

### `eload-paths.js`

Safe path construction and validation.

Responsibilities:

- confine persistent storage under `/mnt/wifi5`
- expose named ELOAD compatibility locations
- reject traversal
- reject arbitrary absolute-path injection
- perform no filesystem write during construction

The four original compatibility paths remain protected.

### `eload-store.js`

Storage-adapter interface.

The first implementation must not assume the unknown original file
formats.

It should expose clean interfaces for later storage implementations,
without silently overwriting the original protected data.

### `eload-ledger.js`

ETHYLNET transaction/accounting abstraction.

Logical ledger domains:

- cash-in
- online-payment
- sales

The domain separation mirrors the verified compatibility path names,
but does not claim knowledge of their original serialization format.

### `eload-provider.js`

External provider adapter contract.

Initial provider adapter has no hard-coded external endpoint.

Later provider integrations supply:

- product discovery
- order submission
- transaction-status lookup

Provider credentials are injected through configuration and are never
embedded in source.

### `eload-transaction.js`

Clean-room ELOAD transaction state machine.

Initial conceptual states:

- `CREATED`
- `AWAITING_PAYMENT`
- `PAID`
- `SUBMITTING`
- `SUCCEEDED`
- `FAILED`
- `CANCELLED`

These are ETHYLNET-owned state names, not claims about the original V8
implementation.

A transaction must never report `SUCCEEDED` unless the provider adapter
returns an explicitly successful result.

### `index.js`

Composition boundary for the ELOAD subsystem.

It exposes clean-room interfaces but performs no external call or
persistent mutation merely by being imported.

---

## 7. Transaction Invariants

Every transaction must have one stable ETHYLNET transaction identifier.

Money values must use integer minor units or another explicitly defined
integer representation. Floating-point currency arithmetic is forbidden.

A transaction cannot transition directly from:

- `CREATED` to `SUCCEEDED`
- `AWAITING_PAYMENT` to `SUCCEEDED`
- `FAILED` to `SUCCEEDED`

without an explicit provider submission/retry path.

A provider failure must not be recorded as a successful sale.

An accounting write must not silently convert an unsuccessful provider
transaction into success.

Retries must be idempotent around transaction identity.

---

## 8. Storage Safety

Until an original schema is independently proven:

- do not truncate protected ELOAD paths
- do not rewrite protected ELOAD paths
- do not migrate them automatically
- do not assume JSON because one path ends in `.json`
- do not create incompatible data inside a path merely because the path
  exists in the compatibility contract

The first ELOAD foundation may use injectable/in-memory storage for tests.

A later storage milestone must explicitly decide between:

1. evidence-backed compatibility storage, or
2. a new ETHYLNET-owned versioned namespace.

That decision requires its own evidence/design gate.

---

## 9. Provider Boundary

The provider adapter interface must separate local business logic from
external network operations.

Conceptual operations:

- `listProducts()`
- `submitOrder(order)`
- `getOrderStatus(providerReference)`

These names describe the new ETHYLNET interface only.

They do not assert that the original firmware used these function names
or HTTP endpoints.

Provider adapters must return normalized clean-room result objects.

No actual provider integration is included until:

- provider is explicitly selected
- API documentation is available
- credential storage is defined
- timeout/retry rules are defined
- success/failure semantics are verified

---

## 10. ELOAD and Other ETHYLNET Subsystems

The ELOAD core must remain decoupled from:

- PPPoE
- voucher
- coin GPIO
- session engine
- rental/subvendo

Integration will occur through adapters/events in later milestones.

Skipping those milestones now does not authorize ELOAD to duplicate
their business logic.

For example, ELOAD may accept a payment confirmation through a future
payment adapter, but must not implement coin pulse counting itself.

---

## 11. HTTP / Portal Boundary

No ELOAD HTTP route will be invented during the foundation milestone.

The existing HTTP compatibility layer remains unchanged.

Later ELOAD API/portal work requires either:

- independently verified Orange Pi One route evidence, or
- a new explicitly defined ETHYLNET clean-room API contract.

Until then:

`verified ELOAD HTTP routes = 0`

---

## 12. Error Handling

Errors are categorized as:

- validation error
- storage error
- payment error
- provider error
- timeout
- configuration error
- invariant violation

Sensitive provider/configuration values must never appear in log output.

Failures must be explicit and must never be converted into success by
default behavior.

---

## 13. Security

The ELOAD subsystem must:

- reject path traversal
- avoid arbitrary command execution
- avoid shell construction from customer input
- avoid storing provider secrets in Git
- avoid logging provider secrets
- validate transaction transitions
- preserve transactional identity across retries
- use dependency injection for external provider calls
- avoid external network access during unit tests

No product license, activation, board key, or trial dependency is added
to ELOAD.

---

## 14. Initial Implementation Milestone

The first implementation milestone is only the clean-room foundation:

1. immutable ELOAD contract
2. safe path contract
3. transaction state model
4. ledger abstraction
5. provider adapter abstraction
6. ELOAD composition layer
7. compatibility regression guard

It explicitly excludes:

- real telco provider calls
- real payment gateway calls
- original unknown storage schema mutation
- portal/admin UI
- coin integration
- voucher integration
- session integration
- PPPoE integration

---

## 15. Testing Strategy

All production behavior is test-first.

Every production component requires a watched RED before implementation.

Tests must cover at minimum:

- immutable contract
- exact protected compatibility paths
- traversal rejection
- no construction-time filesystem mutation
- valid transaction transitions
- invalid transition rejection
- provider failure remains failure
- provider success is required before sale success
- retry idempotency
- integer money representation
- zero hard-coded provider endpoints
- zero verified HTTP routes
- zero product-license subsystem
- no change to existing HTTP layer
- no change to main entrypoint

After each implementation task:

- target test must pass
- full `npm test` must pass

---

## 16. Firmware Safety

During ELOAD clean-room implementation:

- raw firmware remains unchanged
- original `index.o` remains unchanged
- opaque `public.tar.gz` remains unchanged
- no ext4 repair is performed
- no final firmware is built

Firmware integration remains a later milestone.

---

## 17. Acceptance Criteria

The foundation milestone is complete only when:

- all ELOAD foundation tests pass
- full existing regression suite passes
- protected original ELOAD paths remain unmodified
- no external provider is contacted by tests
- no hard-coded provider API endpoint exists
- no invented original-firmware route exists
- no license/activation dependency exists
- `bin/ethyl-core.js` remains unchanged unless a later approved integration
  milestone explicitly changes it
- raw firmware hash remains unchanged
- frozen original `index.o` hash remains unchanged
- `main` remains unchanged until explicit merge approval
