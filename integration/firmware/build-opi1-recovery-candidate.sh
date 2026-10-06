#!/bin/sh
set -eu

usage() {
    echo "usage: build-opi1-recovery-candidate.sh SOURCE_GZ EXPECTED_SHA256 OUTPUT_RAW WORK_DIR" >&2
    exit 2
}

fail() {
    echo "ERROR: $*" >&2
    exit 1
}

[ "$#" -eq 4 ] || usage

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd -P)
SOURCE_GZ=$(readlink -f "$1")
EXPECTED_SHA256=$2
OUTPUT_RAW=$(python3 -c 'import os,sys; print(os.path.abspath(sys.argv[1]))' "$3")
WORK_DIR=$(python3 -c 'import os,sys; print(os.path.abspath(sys.argv[1]))' "$4")

[ -f "$SOURCE_GZ" ] || fail "source gzip does not exist: $SOURCE_GZ"
printf '%s\n' "$EXPECTED_SHA256" | grep -Eq '^[0-9A-Fa-f]{64}$' || fail "expected SHA256 must be 64 hex characters"
[ "$SOURCE_GZ" != "$OUTPUT_RAW" ] || fail "source and output paths must differ; refusing overwrite"
[ ! -e "$OUTPUT_RAW" ] || fail "output raw already exists: $OUTPUT_RAW"

if [ -e "$WORK_DIR" ]; then
    [ -d "$WORK_DIR" ] || fail "work path exists and is not a directory: $WORK_DIR"
    [ -z "$(ls -A "$WORK_DIR")" ] || fail "work directory must be empty: $WORK_DIR"
fi

for command in gzip sha256sum fdisk sfdisk dd debugfs node python3 cmp cp stat awk grep; do
    command -v "$command" >/dev/null 2>&1 || fail "required host command missing: $command"
done

mkdir -p "$WORK_DIR" "$(dirname "$OUTPUT_RAW")"

SOURCE_HASH_BEFORE=$(sha256sum "$SOURCE_GZ" | awk '{print $1}')
[ "$SOURCE_HASH_BEFORE" = "$EXPECTED_SHA256" ] || fail "source SHA256 checksum mismatch: expected $EXPECTED_SHA256 got $SOURCE_HASH_BEFORE"
printf '%s  %s\n' "$SOURCE_HASH_BEFORE" "$SOURCE_GZ" > "$WORK_DIR/source-gzip.sha256"

gzip -t "$SOURCE_GZ" || fail "source gzip integrity check failed"
gzip -dc "$SOURCE_GZ" > "$OUTPUT_RAW"

SOURCE_HASH_AFTER=$(sha256sum "$SOURCE_GZ" | awk '{print $1}')
[ "$SOURCE_HASH_AFTER" = "$SOURCE_HASH_BEFORE" ] || fail "source gzip changed during build"

fdisk -l "$OUTPUT_RAW" > "$WORK_DIR/geometry.before.txt"
sfdisk --json "$OUTPUT_RAW" > "$WORK_DIR/partitions.before.json"

PARTITION_DATA=$(python3 - "$WORK_DIR/partitions.before.json" <<'PY'
import json, sys
p = json.load(open(sys.argv[1], 'r', encoding='utf-8'))['partitiontable']
parts = p.get('partitions', [])
if len(parts) != 2:
    raise SystemExit(f'expected exactly 2 source partitions, found {len(parts)}')
p2 = parts[1]
print(int(p2['start']), int(p2['size']))
PY
) || fail "could not identify p2 geometry"
set -- $PARTITION_DATA
P2_START=$1
P2_SECTORS=$2
P2_END_BYTES=$(( (P2_START + P2_SECTORS) * 512 ))
RAW_BYTES=$(stat -c '%s' "$OUTPUT_RAW")
[ "$RAW_BYTES" -ge "$P2_END_BYTES" ] || fail "raw image ends before p2"

P2_BEFORE="$WORK_DIR/p2.before.ext4"
P2_AFTER="$WORK_DIR/p2.after.ext4"
TRAILER_BEFORE="$WORK_DIR/trailer.before.bin"
TRAILER_AFTER="$WORK_DIR/trailer.after.bin"
ROOTFS_BEFORE="$WORK_DIR/rootfs.before"
ROOTFS_STAGE="$WORK_DIR/rootfs.stage"
ROOTFS_POST="$WORK_DIR/rootfs.post"
CMDS="$WORK_DIR/debugfs-cutover.cmds"

mkdir -p "$ROOTFS_BEFORE" "$ROOTFS_STAGE" "$ROOTFS_POST"
dd if="$OUTPUT_RAW" of="$P2_BEFORE" bs=512 skip="$P2_START" count="$P2_SECTORS" status=none
cp "$P2_BEFORE" "$P2_AFTER"
dd if="$OUTPUT_RAW" of="$TRAILER_BEFORE" bs=1 skip="$P2_END_BYTES" status=none

debugfs -R "rdump / $ROOTFS_BEFORE" "$P2_BEFORE" > "$WORK_DIR/debugfs-rdump-before.log" 2>&1
[ ! -e "$ROOTFS_BEFORE/soft/ethyl-core" ] || fail "source already contains /soft/ethyl-core; refusing ambiguous restage"
cp -a "$ROOTFS_BEFORE/." "$ROOTFS_STAGE/"
rm -f "$ROOTFS_STAGE/soft/index.o"

node - "$PROJECT_ROOT" "$ROOTFS_STAGE" <<'NODE'
'use strict';
const path = require('node:path');
const [projectRoot, targetRoot] = process.argv.slice(2);
const { stageRootfs } = require(path.join(projectRoot, 'integration', 'openwrt', 'stage-rootfs.js'));
stageRootfs({ projectRoot, targetRoot }).catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
NODE

node "$PROJECT_ROOT/integration/openwrt/verify-rootfs-contract.js" "$ROOTFS_STAGE" > "$WORK_DIR/rootfs-stage-verifier.txt"

python3 - "$ROOTFS_BEFORE" "$ROOTFS_STAGE" "$CMDS" <<'PY'
from pathlib import Path
import os, stat, sys

before = Path(sys.argv[1])
stage = Path(sys.argv[2])
out = Path(sys.argv[3])
fixed = [
    'etc/config/dhcp',
    'etc/init.d/soft',
    'soft/config/nginx.locations',
    'soft/config/admin.locations',
    'usr/libexec/ethyl/wifi5-storage-bootstrap.sh',
    'etc/ppp/pppoe-server-options',
    'usr/share/nftables.d/table-pre/20-ethyl-access-set.nft',
    'usr/share/nftables.d/chain-pre/forward/20-ethyl-access.nft',
    'usr/share/nftables.d/chain-pre/dstnat/20-ethyl-portal.nft',
]
files = [Path(p) for p in fixed]
app = stage / 'soft/ethyl-core'
for p in sorted(app.rglob('*')):
    if p.is_file():
        files.append(p.relative_to(stage))

needed_dirs = {Path('mnt/wifi5'), Path('mnt/wifi5/ethyl')}
for rel in files:
    parent = rel.parent
    while str(parent) not in ('', '.'):
        if not (before / parent).exists():
            needed_dirs.add(parent)
        parent = parent.parent

lines = []
if (before / 'soft/index.o').exists():
    lines.append('rm /soft/index.o')
for rel in sorted(needed_dirs, key=lambda p: (len(p.parts), str(p))):
    lines.append(f'mkdir /{rel.as_posix()}')
for rel in files:
    src = stage / rel
    dst = '/' + rel.as_posix()
    if (before / rel).exists():
        lines.append(f'rm {dst}')
    lines.append(f'write {src} {dst}')
    mode = stat.S_IMODE(src.stat().st_mode) | stat.S_IFREG
    lines.append(f'sif {dst} mode 0{mode:o}')
    lines.append(f'sif {dst} uid 0')
    lines.append(f'sif {dst} gid 0')
out.write_text('\n'.join(lines) + '\n', encoding='utf-8')
PY

debugfs -w -f "$CMDS" "$P2_AFTER" > "$WORK_DIR/debugfs-cutover.log" 2>&1
[ "$(stat -c '%s' "$P2_AFTER")" -eq $((P2_SECTORS * 512)) ] || fail "modified p2 size changed"

dd if="$P2_AFTER" of="$OUTPUT_RAW" bs=512 seek="$P2_START" conv=notrunc status=none
sync

fdisk -l "$OUTPUT_RAW" > "$WORK_DIR/geometry.after.txt"
sfdisk --json "$OUTPUT_RAW" > "$WORK_DIR/partitions.after.json"
python3 - "$WORK_DIR/partitions.before.json" "$WORK_DIR/partitions.after.json" <<'PY'
import json, sys

def geometry(path):
    p = json.load(open(path, 'r', encoding='utf-8'))['partitiontable']
    return [(x.get('start'), x.get('size'), x.get('type'), bool(x.get('bootable', False))) for x in p.get('partitions', [])]
if geometry(sys.argv[1]) != geometry(sys.argv[2]):
    raise SystemExit('partition geometry changed')
PY

dd if="$OUTPUT_RAW" of="$TRAILER_AFTER" bs=1 skip="$P2_END_BYTES" status=none
cmp -s "$TRAILER_BEFORE" "$TRAILER_AFTER" || fail "non-sector trailer changed"
printf 'TRAILER_BYTES=%s\n' "$(stat -c '%s' "$TRAILER_BEFORE")" > "$WORK_DIR/trailer-verification.txt"
sha256sum "$TRAILER_BEFORE" "$TRAILER_AFTER" >> "$WORK_DIR/trailer-verification.txt"

debugfs -R "rdump / $ROOTFS_POST" "$P2_AFTER" > "$WORK_DIR/debugfs-rdump-post.log" 2>&1
node "$PROJECT_ROOT/integration/openwrt/verify-rootfs-contract.js" "$ROOTFS_POST" > "$WORK_DIR/rootfs-post-verifier.txt"
[ ! -e "$ROOTFS_POST/soft/index.o" ] || fail "legacy /soft/index.o remains after cutover"
[ -f "$ROOTFS_POST/usr/libexec/ethyl/wifi5-storage-bootstrap.sh" ] || fail "storage bootstrap missing after cutover"
[ -f "$ROOTFS_POST/soft/ethyl-core/bin/ethyl-core.js" ] || fail "clean-room entrypoint missing after cutover"
grep -q "option leasefile '/tmp/dhcp.leases'" "$ROOTFS_POST/etc/config/dhcp" || fail "early DHCP lease path missing after cutover"

RAW_HASH=$(sha256sum "$OUTPUT_RAW" | awk '{print $1}')
printf '%s  %s\n' "$RAW_HASH" "$OUTPUT_RAW" > "$WORK_DIR/raw-candidate.sha256"
P2_BEFORE_HASH=$(sha256sum "$P2_BEFORE" | awk '{print $1}')
P2_AFTER_HASH=$(sha256sum "$P2_AFTER" | awk '{print $1}')
TRAILER_HASH=$(sha256sum "$TRAILER_AFTER" | awk '{print $1}')

cat > "$WORK_DIR/delta-manifest.txt" <<EOF
SOURCE_GZ=$SOURCE_GZ
SOURCE_GZ_SHA256=$SOURCE_HASH_BEFORE
OUTPUT_RAW=$OUTPUT_RAW
OUTPUT_RAW_SHA256=$RAW_HASH
P2_START_SECTOR=$P2_START
P2_SECTORS=$P2_SECTORS
P2_BEFORE_SHA256=$P2_BEFORE_HASH
P2_AFTER_SHA256=$P2_AFTER_HASH
TRAILER_BYTES=$(stat -c '%s' "$TRAILER_AFTER")
TRAILER_SHA256=$TRAILER_HASH
ROOTFS_CONTRACT=PASS
LEGACY_CORE_ABSENT=PASS
EARLY_DHCP_TMP=PASS
STORAGE_BOOTSTRAP=PASS
CLEAN_ROOM_LAUNCHER=PASS
EOF

echo "BUILD_RAW=PASS"
echo "ROOTFS_CONTRACT=PASS"
echo "TRAILER_PRESERVED=PASS"
echo "OUTPUT_RAW=$OUTPUT_RAW"
