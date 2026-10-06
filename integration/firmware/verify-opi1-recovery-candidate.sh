#!/bin/sh
set -eu

usage() {
    echo "usage: verify-opi1-recovery-candidate.sh SOURCE_GZ EXPECTED_SHA256 CANDIDATE_RAW BUILD_WORK REPORT [CANDIDATE_GZ]" >&2
    echo "       verify-opi1-recovery-candidate.sh --check-rootfs-commands ROOTFS" >&2
    exit 2
}

path_present() {
    root=$1
    shift
    for rel in "$@"; do
        if [ -e "$root/$rel" ] || [ -L "$root/$rel" ]; then
            return 0
        fi
    done
    return 1
}

check_target_commands() {
    root=$1
    missing=0
    check_one() {
        label=$1
        shift
        if path_present "$root" "$@"; then
            echo "$label=PASS"
        else
            echo "$label=FAIL"
            missing=1
        fi
    }

    check_one logger usr/bin/logger bin/logger
    check_one lsblk usr/bin/lsblk bin/lsblk
    check_one awk usr/bin/awk bin/awk
    check_one grep bin/grep usr/bin/grep
    check_one fdisk usr/sbin/fdisk sbin/fdisk
    check_one sync bin/sync usr/bin/sync
    check_one partx usr/sbin/partx sbin/partx
    check_one mkfs.ext4 usr/sbin/mkfs.ext4 sbin/mkfs.ext4
    check_one mkdir bin/mkdir usr/bin/mkdir
    check_one mount bin/mount usr/bin/mount
    check_one umount bin/umount usr/bin/umount
    check_one uci sbin/uci usr/bin/uci
    check_one cat bin/cat usr/bin/cat
    check_one rm bin/rm usr/bin/rm
    check_one netstat bin/netstat usr/bin/netstat
    check_one node usr/bin/node
    check_one reboot sbin/reboot
    check_one dnsmasq-init etc/init.d/dnsmasq
    check_one dnsmasq-binary usr/sbin/dnsmasq sbin/dnsmasq

    if [ "$missing" -eq 0 ]; then
        echo 'TARGET_COMMANDS=PASS'
        return 0
    fi
    echo 'TARGET_COMMANDS=FAIL'
    return 1
}

if [ "${1:-}" = "--check-rootfs-commands" ]; then
    [ "$#" -eq 2 ] || usage
    check_target_commands "$2"
    exit $?
fi

[ "$#" -eq 5 ] || [ "$#" -eq 6 ] || usage

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd -P)
SOURCE_GZ=$(readlink -f "$1")
EXPECTED_SHA256=$2
CANDIDATE_RAW=$(readlink -f "$3")
BUILD_WORK=$(readlink -f "$4")
REPORT=$(python3 -c 'import os,sys; print(os.path.abspath(sys.argv[1]))' "$5")
CANDIDATE_GZ=${6:-}

for command in gzip sha256sum fdisk sfdisk dd debugfs node python3 cmp awk grep stat; do
    command -v "$command" >/dev/null 2>&1 || { echo "required host command missing: $command" >&2; exit 2; }
done

[ -f "$SOURCE_GZ" ] || { echo "source gzip missing: $SOURCE_GZ" >&2; exit 2; }
[ -f "$CANDIDATE_RAW" ] || { echo "candidate raw missing: $CANDIDATE_RAW" >&2; exit 2; }
[ -d "$BUILD_WORK" ] || { echo "build metadata directory missing: $BUILD_WORK" >&2; exit 2; }
[ -f "$BUILD_WORK/partitions.before.json" ] || { echo "source partition metadata missing" >&2; exit 2; }
[ -f "$BUILD_WORK/raw-candidate.sha256" ] || { echo "candidate hash metadata missing" >&2; exit 2; }
[ -f "$BUILD_WORK/trailer.before.bin" ] || { echo "source trailer metadata missing" >&2; exit 2; }
printf '%s\n' "$EXPECTED_SHA256" | grep -Eq '^[0-9A-Fa-f]{64}$' || { echo "expected SHA256 must be 64 hex characters" >&2; exit 2; }

mkdir -p "$(dirname "$REPORT")"
VERIFY_WORK="${REPORT}.work"
[ ! -e "$VERIFY_WORK" ] || { echo "verification work path already exists: $VERIFY_WORK" >&2; exit 2; }
mkdir -p "$VERIFY_WORK"
: > "$REPORT"

record() {
    printf '%s=%s\n' "$1" "$2" | tee -a "$REPORT"
}

fail_gate() {
    name=$1
    shift
    record "$name" FAIL
    echo "verification failed: $*" >&2
    exit 1
}

SOURCE_HASH=$(sha256sum "$SOURCE_GZ" | awk '{print $1}')
[ "$SOURCE_HASH" = "$EXPECTED_SHA256" ] || fail_gate SOURCE_HASH "source SHA256 mismatch"
record SOURCE_HASH PASS

gzip -t "$SOURCE_GZ" || fail_gate SOURCE_GZIP "source gzip integrity failed"
record SOURCE_GZIP PASS

EXPECTED_RAW_HASH=$(awk 'NR==1 {print $1}' "$BUILD_WORK/raw-candidate.sha256")
ACTUAL_RAW_HASH=$(sha256sum "$CANDIDATE_RAW" | awk '{print $1}')
[ "$ACTUAL_RAW_HASH" = "$EXPECTED_RAW_HASH" ] || fail_gate CANDIDATE_HASH "candidate raw hash differs from Task-7 output"
record CANDIDATE_HASH PASS

fdisk -l "$CANDIDATE_RAW" > "$VERIFY_WORK/fdisk-candidate.txt" 2>&1 || fail_gate GEOMETRY "fdisk could not read candidate partition table"
sfdisk --json "$CANDIDATE_RAW" > "$VERIFY_WORK/partitions.candidate.json" 2>/dev/null || fail_gate GEOMETRY "sfdisk could not read candidate partition table"

if ! python3 - "$BUILD_WORK/partitions.before.json" "$VERIFY_WORK/partitions.candidate.json" <<'PY'
import json, sys

def geom(path):
    table = json.load(open(path, 'r', encoding='utf-8')).get('partitiontable', {})
    parts = table.get('partitions', [])
    return (
        table.get('label'), table.get('unit'), table.get('sectorsize'),
        [(p.get('start'), p.get('size'), p.get('type'), bool(p.get('bootable', False))) for p in parts],
    )
if geom(sys.argv[1]) != geom(sys.argv[2]):
    raise SystemExit(1)
PY
then
    fail_gate GEOMETRY "candidate partition geometry differs from source metadata"
fi
record GEOMETRY PASS

P2_DATA=$(python3 - "$BUILD_WORK/partitions.before.json" <<'PY'
import json, sys
parts=json.load(open(sys.argv[1], 'r', encoding='utf-8'))['partitiontable'].get('partitions', [])
if len(parts) != 2:
    raise SystemExit(1)
p=parts[1]
print(int(p['start']), int(p['size']))
PY
) || fail_gate GEOMETRY "source metadata does not contain exactly p1/p2"
set -- $P2_DATA
P2_START=$1
P2_SECTORS=$2
P2_START_BYTES=$((P2_START * 512))
P2_BYTES=$((P2_SECTORS * 512))
P2_END_BYTES=$((P2_START_BYTES + P2_BYTES))

BOOT_HASHES=$(python3 - "$SOURCE_GZ" "$CANDIDATE_RAW" "$P2_START_BYTES" <<'PY'
import gzip, hashlib, sys
src, candidate, limit = sys.argv[1], sys.argv[2], int(sys.argv[3])
def hash_prefix(stream, limit):
    h=hashlib.sha256(); left=limit
    while left:
        chunk=stream.read(min(8*1024*1024,left))
        if not chunk: raise SystemExit('short source before p2')
        h.update(chunk); left-=len(chunk)
    return h.hexdigest()
with gzip.open(src,'rb') as f: a=hash_prefix(f,limit)
with open(candidate,'rb') as f: b=hash_prefix(f,limit)
print(a,b)
PY
) || fail_gate BOOT_REGION_PRESERVED "unable to hash pre-p2 boot region"
set -- $BOOT_HASHES
[ "$1" = "$2" ] || fail_gate BOOT_REGION_PRESERVED "MBR/p1/pre-p2 bytes changed"
record BOOT_REGION_PRESERVED PASS

P2="$VERIFY_WORK/p2.verify.ext4"
dd if="$CANDIDATE_RAW" of="$P2" iflag=skip_bytes,count_bytes skip="$P2_START_BYTES" count="$P2_BYTES" bs=8M status=none
if ! debugfs -R 'stats' "$P2" > "$VERIFY_WORK/p2-stats.txt" 2>&1; then
    fail_gate P2_READABLE "candidate p2 is not readable by debugfs"
fi
record P2_READABLE PASS

CANDIDATE_TRAILER="$VERIFY_WORK/trailer.candidate.bin"
dd if="$CANDIDATE_RAW" of="$CANDIDATE_TRAILER" iflag=skip_bytes skip="$P2_END_BYTES" bs=8M status=none
cmp -s "$BUILD_WORK/trailer.before.bin" "$CANDIDATE_TRAILER" || fail_gate TRAILER_PRESERVED "non-sector trailer changed"
record TRAILER_PRESERVED PASS

ROOTFS="$VERIFY_WORK/rootfs"
mkdir -p "$ROOTFS"
debugfs -R "rdump / $ROOTFS" "$P2" > "$VERIFY_WORK/rootfs-rdump.log" 2>&1 || fail_gate ROOTFS_EXTRACT "could not extract candidate rootfs"
if ! node "$PROJECT_ROOT/integration/openwrt/verify-rootfs-contract.js" "$ROOTFS" > "$VERIFY_WORK/rootfs-contract.txt" 2>&1; then
    cat "$VERIFY_WORK/rootfs-contract.txt" >&2 || true
    fail_gate ROOTFS_CONTRACT "Task-4 rootfs contract failed"
fi
record ROOTFS_CONTRACT PASS

if check_target_commands "$ROOTFS" > "$VERIFY_WORK/target-commands.txt"; then
    record TARGET_COMMANDS PASS
else
    cat "$VERIFY_WORK/target-commands.txt" >&2 || true
    fail_gate TARGET_COMMANDS "launcher/bootstrap references a target command not present in rootfs"
fi

if [ -n "$CANDIDATE_GZ" ]; then
    CANDIDATE_GZ=$(readlink -f "$CANDIDATE_GZ")
    [ -f "$CANDIDATE_GZ" ] || fail_gate GZIP_ROUNDTRIP "candidate gzip missing"
    gzip -t "$CANDIDATE_GZ" || fail_gate GZIP_ROUNDTRIP "candidate gzip integrity failed"
    ROUNDTRIP_HASH=$(gzip -dc "$CANDIDATE_GZ" | sha256sum | awk '{print $1}')
    [ "$ROUNDTRIP_HASH" = "$ACTUAL_RAW_HASH" ] || fail_gate GZIP_ROUNDTRIP "decompressed gzip SHA256 differs from verified raw"
    record GZIP_ROUNDTRIP PASS
else
    record GZIP_ROUNDTRIP NOT_RUN
fi

record PRIVILEGED_P3_LOOP NOT_RUN_PRIVILEGED
record OVERALL PASS
cat "$VERIFY_WORK/target-commands.txt" >> "$REPORT"
echo "REPORT=$REPORT"
