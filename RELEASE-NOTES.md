# WIFI5soft Vendo OPI1 UNLIMITTED v1.0.0

Stable GitHub release of the verified Unlimited Orange Pi One firmware image.

## Firmware

`ETHYLNET-OrangePiOne-SNAPSHOT-r32868-1ceaac207b-UNLIMITED.img.gz`

## Format

`.img.gz`

The original firmware distribution used an `.img.gz` image, therefore this release retains the same file-extension format.

## SHA256

Compressed release asset:

`633f602d9b46740a13ebf1be82c1bca0417c7cb32d92bb655cb8f0fc8ef04a7c`

Decompressed raw image:

`eb23e7e2d8cd2067d692e981b643872d68a3ae767877c80743819aab06a50a53`

## Variant

Unlimited only.

No 24-hour tester or trial variant is part of this release.

## Verified firmware changes

Only the approved audit changes are present:

- active ngrok runtime/configuration removed
- active ZeroTier runtime/configuration removed
- related nginx configuration updated
- ZeroTier package records removed

No unexpected root filesystem file additions, removals, or modifications were detected.

## Preserved functionality

- ELOAD/core
- coin/voucher/session/transaction functions
- PPPoE and billing
- subvendo
- LAN admin
- media server
- generic WireGuard
- local Dropbear SSH

## Verification status

Static image and package verification: PASS.

Physical Orange Pi One hardware test: NOT YET PERFORMED.
