# WIFI5soft Vendo OPI1 UNLIMITTED

Private repository for the verified Unlimited Orange Pi One firmware build.

## Stable Release

**v1.0.0**

Firmware:

`ETHYLNET-OrangePiOne-SNAPSHOT-r32868-1ceaac207b-UNLIMITED.img.gz`

Format:

`.img.gz`

The release retains the same `.img.gz` file-extension format as the original firmware distribution.

## SHA256

Compressed firmware:

`633f602d9b46740a13ebf1be82c1bca0417c7cb32d92bb655cb8f0fc8ef04a7c`

Decompressed raw image:

`eb23e7e2d8cd2067d692e981b643872d68a3ae767877c80743819aab06a50a53`

## Final Root Filesystem Audit

The Unlimited firmware was compared directly against the original firmware.

Results:

- approved removed paths: 13
- approved modified files: 5
- unexpected removed paths: 0
- unexpected added paths: 0
- unexpected modified files: 0

Only the explicitly approved remote-access/configuration changes are present.

## Removed Remote Access

- active ngrok runtime/configuration removed
- active ZeroTier runtime/configuration removed
- related nginx remote-access configuration removed
- ZeroTier package metadata removed

## Preserved Components

- ELOAD-containing core application
- coin functions
- voucher functions
- session functions
- transaction functions
- PPPoE
- PPPoE billing
- subvendo
- rental/core application
- LAN administration
- media server
- generic WireGuard
- local Dropbear SSH

`/soft/index.o` is byte-identical to the original audited firmware.

## Product License Audit

**PRODUCT LICENSE ENFORCEMENT: NOT DETECTED IN STATIC IMAGE**

**LICENSE-BASED ARTIFICIAL CAP: NOT DETECTED IN STATIC IMAGE**

No verified activation mechanism, product trial enforcement, or license-based device/slot cap was identified during the static firmware audit.

No speculative product-license binary patch was applied.

## Variant

Unlimited only.

No 24-hour/tester/trial image is part of this release.

## Verification

- static firmware comparison: PASS
- package integrity: PASS
- GitHub asset digest verification: PASS
- GitHub download-back verification: PASS

Physical Orange Pi One hardware testing has not been performed.
