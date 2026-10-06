#!/bin/sh
set -eu

TAG='ethyl-wifi5-storage'
MOUNTPOINT=${WIFI5_MOUNTPOINT:-/mnt/wifi5}
PROC_MOUNTS=${WIFI5_PROC_MOUNTS:-/proc/mounts}
TEMP_LEASEFILE=${WIFI5_TEMP_LEASEFILE:-/tmp/dhcp.leases}
DNSMASQ_INIT=${WIFI5_DNSMASQ_INIT:-/etc/init.d/dnsmasq}

log() {
    logger -t "$TAG" -- "$*" 2>/dev/null || true
}

fail() {
    log "ERROR: $*"
    echo "$TAG: $*" >&2
    exit 1
}

rootpart=$(lsblk -nrpo NAME,MOUNTPOINT | awk '$2 == "/" || $2 == "/rom" { print $1; exit }')
[ -n "$rootpart" ] || fail 'cannot identify root partition'

disk=$(lsblk -nrpo NAME,TYPE,PKNAME | awk -v p="$rootpart" '$1 == p { print $3; exit }')
[ -n "$disk" ] || fail 'cannot identify root disk'
case "$disk" in
    /dev/*) : ;;
    *) disk="/dev/$disk" ;;
esac

case "$disk" in
    *[0-9]) p3="${disk}p3" ;;
    *) p3="${disk}3" ;;
esac

partition_listed() {
    fdisk -l "$disk" 2>/dev/null | awk -v p="$p3" '$1 == p { found=1 } END { exit(found ? 0 : 1) }'
}

device_visible() {
    lsblk -nrpo NAME | grep -Fxq "$p3"
}

created=0
if ! partition_listed; then
    root_end=$(fdisk -l "$disk" 2>/dev/null | awk -v p="$rootpart" '
        $1 == p {
            n=0
            for (i=2; i<=NF; i++) {
                if ($i ~ /^[0-9]+$/) {
                    n++
                    if (n == 2) { print $i; exit }
                }
            }
        }
    ')
    [ -n "$root_end" ] || fail 'cannot determine root partition end sector'
    start=$((root_end + 100))
    log "creating WiFi5 partition $p3 at sector $start"
    if ! printf 'n\np\n3\n%s\n\nw\n' "$start" | fdisk "$disk" >/dev/null 2>&1; then
        fail 'partition creation failed'
    fi
    sync
    partition_listed || fail 'partition table does not contain p3 after creation'
    created=1
fi

if ! device_visible; then
    log "requesting partition table rescan for $disk"
    partx -u "$disk" >/dev/null 2>&1 || fail 'partition rescan failed'
    if ! device_visible; then
        if [ "$created" -eq 1 ]; then
            log 'new p3 requires one controlled reboot'
            exit 75
        fi
        fail 'p3 exists in table but no device node is visible after rescan'
    fi
fi

fstype=$(lsblk -nrpo NAME,FSTYPE | awk -v p="$p3" '$1 == p { print $2; exit }')
case "$fstype" in
    '')
        log "formatting blank $p3 as ext4"
        mkfs.ext4 -F "$p3" >/dev/null 2>&1 || fail 'ext4 format failed'
        ;;
    ext4)
        ;;
    *)
        fail "refusing to format existing filesystem '$fstype' on $p3"
        ;;
esac

mkdir -p "$MOUNTPOINT"
mounted_here=0
if ! awk -v p="$p3" -v m="$MOUNTPOINT" '$1 == p && $2 == m { found=1 } END { exit(found ? 0 : 1) }' "$PROC_MOUNTS"; then
    mount -t ext4 "$p3" "$MOUNTPOINT" || fail 'mount failed'
    mounted_here=1
fi
awk -v p="$p3" -v m="$MOUNTPOINT" '$1 == p && $2 == m { found=1 } END { exit(found ? 0 : 1) }' "$PROC_MOUNTS" \
    || fail 'mount verification failed'

probe="$MOUNTPOINT/.ethyl-write-probe.$$"
if ! (umask 077; : > "$probe"); then
    [ "$mounted_here" -eq 0 ] || umount "$MOUNTPOINT" >/dev/null 2>&1 || true
    fail 'mounted WiFi5 storage is not writable'
fi
rm -f "$probe"

persistent_lease="$MOUNTPOINT/dhcp.leases"
current_lease=$(uci -q get 'dhcp.@dnsmasq[0].leasefile' 2>/dev/null || true)
if [ "$current_lease" != "$persistent_lease" ]; then
    if [ -f "$TEMP_LEASEFILE" ] && [ ! -e "$persistent_lease" ]; then
        cat "$TEMP_LEASEFILE" > "$persistent_lease" || fail 'cannot preserve temporary DHCP leases'
    fi
    [ -e "$persistent_lease" ] || : > "$persistent_lease"
    uci set "dhcp.@dnsmasq[0].leasefile=$persistent_lease" || fail 'cannot set persistent DHCP leasefile'
    uci commit dhcp || fail 'cannot commit DHCP leasefile'
    "$DNSMASQ_INIT" restart || fail 'cannot restart dnsmasq after lease migration'
fi

log "WiFi5 storage ready at $MOUNTPOINT"
exit 0
