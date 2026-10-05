# ETHYLNET Orange Pi One Clean-Room Core Design

Date: 2026-10-05
Status: Approved design; ready for implementation planning
Target: ETHYLNET / WiFi5-Soft Orange Pi One
Release model: Unlimited / no product key required
Final release container: .img.gz

## 1. Purpose

Build an ETHYLNET-owned replacement application core while preserving independently verified firmware interfaces and business capabilities.

No-key behavior is architectural. The replacement contains no product-license, activation, trial, expiry, board-entitlement, or hidden feature-entitlement subsystem.

The original opaque V8 authorization logic will not be patched or forced to return success.

## 2. Preservation Requirements

Preserve:

- admin and portal capability
- PPPoE
- vendo/client sessions
- coin processing
- vouchers
- transactions
- reseller
- billing
- Android rental/subvendo
- ELOAD/business
- normal networking
- Dropbear/local SSH and recovery

Ngrok and ZeroTier remain removed.

## 3. Frozen Baseline

Raw firmware SHA-256:

eb23e7e2d8cd2067d692e981b643872d68a3ae767877c80743819aab06a50a53

Original index.o SHA-256:

265ea8da63161c8670b994471f83e899a7928805acb1466113fe3c272f984919

Development occurs outside the firmware image until offline verification passes.

## 4. Known Package Facts

The original application is a Node/pkg executable.

Verified facts:

- default entrypoint is /snapshot/soft/index.js
- 2008 VFS entries
- 771 STORE_BLOB entries
- 1510 STORE_CONTENT entries
- 439 STORE_LINKS entries
- 2008 STORE_STAT entries
- STORE_CONTENT uses gzip compression
- recovered first-party plaintext:
  - /snapshot/soft/lib/io/index.js
  - /snapshot/soft/lib/io/package.json
- recovered Socket.IO dependency is socket.io ^2.4.1

Main application modules such as index.js, main.js, httpserver.js,
pppoe.js, client-io.js, billing-server.js, reseller.js,
android-rental.js, keys.js, and variables.js are blob-only references.

## 5. Architecture

Existing Nginx remains the outer reverse proxy.

Logical flow:

Existing Nginx
  -> Admin/UI
  -> PPPoE -> 127.0.0.1:3002
  -> Media/other routes
  -> ETHYLNET Core

ETHYLNET Core contains:

- storage
- system/network
- HTTP
- Socket.IO
- PPPoE
- coin/session
- voucher
- billing
- reseller
- rental/subvendo
- ELOAD

Subsystems communicate through explicit interfaces.

A subsystem must not directly modify another subsystem's private state.

## 6. Development Runtime Layout

Planned integration path:

/opt/ethylnet-core/
  bin/
  config/
  src/
  logs/
  state/

Development workspace:

clean-room-core/
  docs/
  spec/
  src/
  fixtures/
  tests/
  reference-plaintext/

The frozen firmware image is not writable development state.

## 7. No-License Architecture

The replacement does not implement:

- product-key validation
- activation server dependency
- trial expiry
- license expiry
- board entitlement
- feature entitlement
- license refresh
- license response cache

Unlimited operation therefore does not depend on an authorization bypass.

## 8. Network Compatibility

Known interfaces include:

- HTTP 80
- HTTPS 443
- subvendo HTTPS 4455
- PPPoE-facing listener 8081
- media listener 4400
- PPPoE backend 127.0.0.1:3002
- local terminal proxy 127.0.0.1:7681

Application backends should remain localhost-only wherever practical.

No unnecessary externally exposed port will be added.

## 9. Persistent Storage

/mnt/wifi5 remains the compatibility storage boundary.

Known editable paths include:

- /mnt/wifi5
- /mnt/wifi5/3pinger
- /mnt/wifi5/dhcp.leases
- /mnt/wifi5/pppoe

Business paths discovered in prior mapping remain protected.

Undocumented schemas must not be guessed.

Writes use:

1. validate existing state
2. write temporary file
3. flush data
4. atomic rename
5. preserve last-known-good content on failure

No destructive migration is permitted.

No automatic ext4 repair is permitted.

## 10. Storage Ownership

Each subsystem owns its state.

Example flow:

Reseller
  -> Billing interface
  -> Storage adapter

Reseller must not directly modify raw billing files.

## 11. HTTP Compatibility

The HTTP layer provides:

- health checks
- localhost backend services
- input validation
- structured errors
- isolated subsystem failures

Unknown original admin/portal endpoint behavior remains UNRESOLVED until independently documented.

## 12. Socket.IO Compatibility

Compatibility targets the recovered Socket.IO 2.x family.

Recovered dependency:

socket.io ^2.4.1

Initial implementation provides:

- connection handling
- disconnect handling
- transport lifecycle
- session association framework
- event registration framework

Business events require independently documented:

- event name
- direction
- payload schema
- acknowledgement schema
- state affected
- reconnect behavior
- confidence level

Unknown business events remain UNRESOLVED.

## 13. PPPoE

PPPoE is the first major functional subsystem.

Expected outer contract:

Nginx
  -> 127.0.0.1:3002
  -> ETHYLNET PPPoE adapter
  -> existing PPPoE state/services

PPPoE failure must not terminate unrelated services.

## 14. Coin and Session

The subsystem must eventually provide:

- idempotent coin processing
- duplicate-event protection
- transaction identity
- crash-safe state transitions
- restart recovery
- explicit session ownership
- transaction journaling

Exact original transition semantics remain UNRESOLVED until independently documented.

## 15. Voucher

Voucher behavior is separate from coin/session accounting.

Required eventual capabilities:

- validation
- redemption
- replay protection
- session attachment
- transaction accounting

Exact original voucher semantics remain UNRESOLVED until established.

## 16. Billing and Reseller

Billing owns billing state.

Reseller communicates through a defined billing interface.

A billing failure must not corrupt:

- reseller state
- PPPoE state
- session state
- unrelated business state

Exact original request/response schemas remain UNRESOLVED.

## 17. Rental and Subvendo

The rental subsystem isolates:

- device identity
- session identity
- timer/accounting
- network state
- offline-safe persistence

Rental failure must not terminate PPPoE, networking, local recovery, or unrelated services.

## 18. ELOAD / Business

ELOAD is a high-risk subsystem and is implemented late.

Before ELOAD writes are enabled:

- state schema must be documented
- representative fixtures must exist
- duplicate transaction tests must pass
- interrupted-write tests must pass
- rollback must be demonstrated
- transaction logging must exist

No destructive migration of existing ELOAD state is permitted.

## 19. Failure Isolation

Subsystem health states are:

- READY
- DEGRADED
- FAILED
- DISABLED

A subsystem error should:

- log the failure
- reject only affected work where possible
- preserve committed state
- avoid restarting unrelated networking
- avoid deleting persistent data
- avoid terminating unrelated services

## 20. Logging

Logical log channels:

- core
- HTTP
- PPPoE
- socket
- session
- voucher
- billing
- reseller
- rental
- ELOAD

Logs must not expose:

- passwords
- complete authentication tokens
- voucher secrets
- private credentials
- unnecessary sensitive payloads

## 21. Contract Confidence

Every discovered behavior is classified as:

VERIFIED
SUPPORTED
INFERRED
UNRESOLVED

Only VERIFIED or SUPPORTED behavior may be described as established compatibility.

## 22. Contract Sources

Approved reference inputs include:

- Nginx routing
- listener configuration
- init/service scripts
- editable system configuration
- persistent path contracts
- recovered ordinary STORE_CONTENT
- package metadata
- independently observable interfaces
- ETHYLNET-owned requirements

STORE_BLOB/V8 modules remain reference-only and are not patched to force authorization behavior.

## 23. Golden Fixtures

Tests use copied fixtures only.

Fixture groups include:

- empty
- normal
- partial
- corrupt
- PPPoE
- coin-session
- voucher
- billing
- reseller
- rental
- ELOAD

The frozen firmware candidate is never writable fixture state.

## 24. Testing Strategy

Testing layers:

1. unit tests
2. contract tests
3. failure tests
4. regression tests
5. firmware integration verification

Subsystem acceptance requires:

- clean startup
- clean shutdown
- documented contract
- malformed-input handling
- readable existing fixtures
- failed-write recovery
- restart recovery
- unrelated-service isolation
- no hidden product-license dependency

## 25. Implementation Order

1. foundation
2. HTTP/service compatibility
3. PPPoE
4. Socket.IO transport/session framework
5. coin/session
6. voucher
7. billing/reseller
8. rental/subvendo
9. ELOAD
10. admin/portal UI
11. full offline regression
12. firmware integration candidate
13. strict release verification
14. final .img.gz packaging

High-risk business logic remains late in the implementation order.

## 26. Admin and Portal UI

The replacement does not depend on reverse-engineering the opaque original public.tar.gz transformation.

A new ETHYLNET-owned UI may later use documented replacement APIs.

Branding target:

- NO KEY NEEDED
- INSTALL ON UNLIMITED BOARDS
- MADE BY: ETHYLNET

Branding occurs after functional backend milestones.

## 27. Firmware Integration Rules

Firmware integration starts only after offline tests pass.

Preserve:

- MBR
- boot partition
- partition geometry
- firmware trailer
- Dropbear/local recovery
- networking
- protected business state

Ngrok and ZeroTier remain removed.

Do not automatically repair ext4.

The first integration uses a copy of the raw firmware candidate.

## 28. Rollback

The original index.o remains untouched as a reference and rollback artifact during staged integration.

The new implementation initially uses a separate runtime path.

A failed integration must be reversible without reconstructing the original index.o.

## 29. Release Verification

Before release:

- strict filesystem diff
- changed/added/removed file inventory
- MBR verification
- partition geometry verification
- boot verification
- trailer verification
- protected-state verification
- Dropbear/local recovery verification
- Ngrok/ZeroTier absence verification
- required service startup verification

Unexpected differences block release.

## 30. Final Packaging

Final packaging/compression is the literal final build action.

Because the source firmware uses .img.gz, the stable ETHYLNET release also uses .img.gz.

No alternate release container is substituted unless explicitly approved.

## 31. Unresolved Compatibility Contracts

The following remain deliberately UNRESOLVED:

1. exact original admin/portal API semantics
2. exact Socket.IO business event schemas
3. exact ELOAD state transitions and business rules
4. exact voucher/coin/session transaction semantics
5. exact reseller/billing request-response schemas
6. original opaque public.tar.gz to /tmp/i/public transformation

These must be independently specified before being claimed as original-compatible.

## 32. Design Status

Architecture is approved.

Storage ownership is explicit.

Failure isolation is explicit.

Testing strategy is defined.

Implementation milestones are ordered.

Unresolved behavior is identified rather than guessed.

Final packaging remains deferred until all release verification passes.

The next stage is implementation planning, not product-code implementation.
