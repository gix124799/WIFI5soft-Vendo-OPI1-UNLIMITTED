# WIFI5soft Vendo OPI1 UNLIMITTED

Private firmware repository for the ETHYLNET Unlimited Orange Pi One build.

## Release

Stable release line:

`v1.0.0`

Firmware format:

`.img.gz`

The firmware release asset preserves the same `.img.gz` file-extension format used by the original source firmware.

## Unlimited Build

This repository contains the Unlimited-only release.

No 24-hour trial/test variant is included.

## Verified Changes

The firmware was independently compared against the original source image.

Verified root filesystem differences:

- 13 approved remote-access paths removed
- 5 approved configuration/package files modified
- 0 unexpected removed paths
- 0 unexpected added paths
- 0 unexpected changed files

The intentional changes remove the audited active ngrok and ZeroTier components.

Generic WireGuard and local Dropbear SSH remain preserved.

## Preserved Components

The verified build retains:

- ELOAD-containing core application
- coin functionality
- voucher functionality
- session and transaction functionality
- PPPoE
- PPPoE billing
- subvendo
- rental/core application
- LAN administration
- media server
- generic WireGuard
- local Dropbear SSH

`/soft/index.o` remained byte-identical to the original audited image.

## Firmware Asset

The firmware itself is distributed through the GitHub Release page and is not committed directly to the Git repository.

Hardware behavior has not yet been verified on a physical Orange Pi One.
