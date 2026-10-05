# WIFI5soft Vendo OPI1 UNLIMITTED v1.0.0

Stable published release of the statically verified Unlimited Orange Pi One firmware.

## Firmware Asset

`ETHYLNET-OrangePiOne-SNAPSHOT-r32868-1ceaac207b-UNLIMITED.img.gz`

Format:

`.img.gz`

Compressed SHA256:

`633f602d9b46740a13ebf1be82c1bca0417c7cb32d92bb655cb8f0fc8ef04a7c`

Decompressed raw SHA256:

`eb23e7e2d8cd2067d692e981b643872d68a3ae767877c80743819aab06a50a53`

## Final Comparison Against Original Firmware

The final Unlimited image was independently compared against the original image.

- 13 approved paths removed
- 5 approved files modified
- 0 unexpected removed paths
- 0 unexpected added paths
- 0 unexpected changed files

## Intentional Changes

- active ngrok removed
- active ZeroTier removed
- associated nginx remote-access configuration removed
- ZeroTier package/runtime metadata removed

## Preserved Functionality

- ELOAD/core
- coin/voucher/session/transaction functions
- PPPoE and billing
- subvendo
- rental/core application
- LAN administration
- media server
- generic WireGuard
- local Dropbear SSH

The core application `/soft/index.o` remains byte-identical to the original audited image.

## Product License Audit

**Product license enforcement: NOT DETECTED IN STATIC IMAGE**

**License-based artificial cap: NOT DETECTED IN STATIC IMAGE**

No verified product activation mechanism, product trial enforcement, or license-based device/slot cap was identified.

No speculative license patch was applied because no verified enforcement point was found.

## Variant

Unlimited only.

No 24-hour/tester/trial build is included.

## Verification Status

- final static completion audit: PASS
- unexpected rootfs differences: 0
- gzip/package verification: PASS
- GitHub uploaded asset digest: PASS
- GitHub download-back verification: PASS

Physical Orange Pi One hardware test: NOT PERFORMED.
