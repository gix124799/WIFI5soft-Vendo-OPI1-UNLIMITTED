# WIFI5soft Vendo OPI1 Boot, Portal, and Local Runtime Recovery Design

Date: 2026-10-06
Status: Design approved in chat; written-spec review pending
Target: Orange Pi One firmware, software/emulation verification only

## 1. Purpose

Repair the WIFI5soft Vendo OPI1 firmware so its intended local service chain is deterministic: the system boots, LAN comes up at `10.0.0.1`, clients can obtain `10.0.0.x` leases, the local portal and admin UI are reachable, the backend starts only after persistent storage is ready, and the existing local/offline business functions remain available.

There is no physical Orange Pi One hardware available during this work. Therefore the result may be called software-verified or emulation-verified, but must not be called hardware-verified or stable-on-hardware until a later physical smoke test passes.

## 2. Authoritative Inputs

Firmware source package:
`/home/ethylnet/Downloads/ETHYLNET-OrangePiOne-UNLIMITED-Release-Candidate`

Current candidate image inside that package:
`ETHYLNET-OrangePiOne-SNAPSHOT-r32868-1ceaac207b-UNLIMITED.img.gz`

Known decompressed raw SHA-256 from the release manifest:
`eb23e7e2d8cd2067d692e981b643872d68a3ae767877c80743819aab06a50a53`

Clean-room/local backend repository:
`/home/ethylnet/ETHYLNET-OrangePiOne-Audit-20261005-031126/clean-room-core`

The original release package and its raw image are immutable inputs. All modifications and destructive tests must occur on disposable working copies.

## 3. Confirmed Current State

The current firmware network contract already defines `br-lan` with `eth1`, `vlan.22`, and `vlan.13`, and defines LAN as static `10.0.0.1/19`. WAN uses `eth0` with DHCP.

The firmware contains common USB Ethernet drivers, including `usbnet`, ASIX, AX88179, CDC Ethernet, RTL8150, and RTL8152 support.

Service order currently includes `dnsmasq` at S19, `network` at S20, `nginx` at S80, and `soft` at S200.

The base DHCP configuration points the lease database to `/mnt/wifi5/dhcp.leases`, but `/mnt/wifi5` does not exist in the base root filesystem. The WiFi5 data partition and mount are initialized later by `/etc/init.d/soft`.

The `soft` init script expects a third DOS partition as WiFi5 storage. If absent, it invokes `fdisk` to create a new partition and immediately recurses into detection without an explicit kernel partition-table rescan or controlled reboot.

This creates an ordering hazard: DHCP may initialize before its configured persistence path exists, and application startup may depend on a newly-created partition that the running kernel has not yet exposed.

## 4. Design Principles

1. Fix root causes, not symptoms.
2. Make the smallest reliable changes.
3. Reuse existing firmware scripts and clean-room functionality where they already satisfy the requirement.
4. Keep LAN reachability independent from persistent application storage.
5. Never format or recreate an already-valid WiFi5 persistence filesystem.
6. Start the application only after persistence is positively verified.
7. Keep local portal/admin functions independent from WAN availability.
8. Preserve working bootloader, kernel, DTB, SSH, firewall, PPPoE, media, and business functionality unless evidence requires a specific change.
9. Every modification must have an automated failing test before the fix and a passing regression test after the fix.

## 5. Boot and Storage Architecture

The desired first-boot sequence is:

```text
kernel/init
  -> network/netifd
  -> br-lan gets 10.0.0.1
  -> dnsmasq starts with /tmp/dhcp.leases
  -> client can obtain 10.0.0.x
  -> WiFi5 storage bootstrap runs
       -> if partition 3 missing: create once, verify table, sync, controlled reboot
       -> if partition 3 exists and unformatted: format ext4 once
       -> create /mnt/wifi5 and mount
       -> verify mountpoint and writability
  -> migrate DHCP lease storage to /mnt/wifi5/dhcp.leases
  -> start local application backend
  -> start/verify nginx portal/admin routes
  -> captive portal and business functions become available
```

The bootstrap must be idempotent. Re-running it against an initialized disk must not repartition, reformat, erase, or otherwise damage existing state.

## 6. DHCP and LAN Design

The base `/etc/config/dhcp` lease path will be changed from `/mnt/wifi5/dhcp.leases` to `/tmp/dhcp.leases` so early DHCP is independent of application persistence.

The existing `/soft/sh/dnsmasq.sh` migration behavior will be reused after `/mnt/wifi5` is mounted. It may switch the lease path to persistent storage and restart dnsmasq once storage readiness is confirmed.

The existing LAN contract remains authoritative: `br-lan` uses `eth1`, `vlan.22`, and `vlan.13`; LAN address remains `10.0.0.1/19`; DHCP gateway remains `10.0.0.1`.

No change to interface naming or bridge membership will be made unless a test proves an enumeration-specific failure.

## 7. WiFi5 Storage Bootstrap Repair

The current recursive partition-creation path will be replaced with an explicit state machine:

- detect root disk and current partition table;
- detect WiFi5 partition 3;
- if absent, create partition 3 using remaining media space;
- check command exit status;
- `sync`;
- verify the partition table now contains partition 3;
- request a partition-table rescan if supported;
- if the block device still does not exist, exit cleanly and request one controlled reboot;
- on the next boot, detect the partition;
- format only when no filesystem exists;
- create `/mnt/wifi5`;
- mount ext4;
- verify `mountpoint` and a safe writable probe;
- only then start higher-level services.

Failures must be logged and must not fall into unbounded recursion or repeated formatting.

## 8. Application and Backend Gate

The local application must not start before `/mnt/wifi5` is mounted and writable. The backend startup gate therefore requires:

- persistence mount PASS;
- required runtime files present;
- local database path creatable/openable;
- required local ports free;
- no dependency on WAN for startup.

The clean-room repository is the maintained local/offline implementation for functions that have already been reimplemented. Existing modules and tests must be reused rather than creating parallel replacements.

The opaque original ARM application may be exercised only inside an isolated emulation/sandbox when needed to compare behavior or materialize frontend assets. It must not be run directly on the Ubuntu host with unrestricted network access.

## 9. Portal, Admin, and Captive Flow

Nginx must serve/proxy the firmware routes so that local clients can reach:

- `/` portal entry;
- `/admin` admin entry;
- admin dashboard routes;
- portal static assets;
- local API/socket routes required by the frontend.

Local portal/admin availability must not depend on successful WAN DHCP or external DNS.

Captive-flow tests will simulate common OS connectivity probes and ordinary HTTP navigation. Expected behavior is a deterministic local redirect or portal response leading the client to the local service, not a dead connection.

## 10. Software-Only Verification Strategy

Because no Orange Pi One hardware is available, validation is layered:

1. Static image and configuration tests.
2. Disposable loop-image partition bootstrap tests.
3. Filesystem idempotency and persistence tests.
4. ARM userspace tests using `qemu-arm`/binfmt.
5. Isolated userspace execution using `proot`/`bwrap` where possible.
6. Local HTTP/API tests for portal/admin/backend behavior.
7. Simulated client/DHCP/DNS/captive-flow tests where host privileges permit.
8. Restart/cold-start simulation against the same persistence copy.
9. No-WAN local-operation tests.

The host currently lacks passwordless sudo, so privileged networking tests that require a new network namespace cannot be silently executed through Remote Desktop. The test harness must prefer unprivileged isolation; any genuinely privileged step must be clearly separated from non-privileged automation.

## 11. Regression Scope

The final software gate covers the existing local/offline feature set:

- core startup;
- admin portal HTTP;
- network/system integration;
- DHCP listener behavior;
- voucher/session flows;
- coin/vendo state and time accounting;
- settings;
- sales and transactions;
- PPPoE and billing;
- rental;
- sub-vendo;
- reseller;
- media/local static service;
- SQLite/local persistence;
- restart persistence;
- local operation without WAN.

Existing clean-room tests are extended rather than replaced.

## 12. Release Safety

The original release candidate remains unchanged. A new candidate receives a new filename, hashes, manifest, and verification report.

The release gate is:

```text
IMAGE_INTEGRITY              PASS
BOOT_CONFIG                  PASS
LAN_10_0_0_1_CONTRACT       PASS
EARLY_DHCP                   PASS
WIFI5_PARTITION_BOOTSTRAP    PASS
WIFI5_MOUNT_PERSISTENCE      PASS
BACKEND_START                PASS
BACKEND_HEALTH               PASS
PORTAL_HTTP                  PASS
ADMIN_HTTP                   PASS
CAPTIVE_FLOW_SIMULATION      PASS
VOUCHER                      PASS
COIN_VENDO                   PASS
SETTINGS                     PASS
SALES                        PASS
TRANSACTIONS                 PASS
PPPOE                        PASS
RENTAL_SUBVENDO              PASS
RESELLER                     PASS
RESTART_PERSISTENCE          PASS
NO_WAN_LOCAL_OPERATION       PASS
```

The following cannot be marked PASS without later physical hardware:

- real Orange Pi One kernel/driver boot;
- physical USB-LAN enumeration timing;
- actual AP association and client broadcast behavior;
- electrical coin pulse input;
- real SD-card power-cycle behavior.

Those items remain `HARDWARE_TEST_PENDING`.

## 13. Implementation Boundaries

Do not remove or weaken local SSH recovery. Do not remove PPPoE, eLoad-related preserved functionality, vouchers, rental, reseller, sub-vendo, media, or local admin functionality as a shortcut to making tests pass.

Do not patch multiple independent causes in one unverified change. Each root-cause fix receives its own failing test, smallest implementation change, and verification step.

Do not publish or label a final stable build merely because emulation passes. The software-tested artifact is a release candidate until physical hardware validation is available.
