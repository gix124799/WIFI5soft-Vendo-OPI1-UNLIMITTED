#!/bin/sh
set -eu

usage() {
    echo "usage: run-arm-smoke.sh STAGED_ROOTFS STATE_DIR" >&2
    exit 2
}

[ "$#" -eq 2 ] || usage
ROOTFS=$(readlink -f "$1")
STATE_ROOT=$(readlink -f "$2")

[ -d "$ROOTFS" ] || { echo "staged rootfs not found: $ROOTFS" >&2; exit 2; }
[ -d "$STATE_ROOT" ] || { echo "state directory not found: $STATE_ROOT" >&2; exit 2; }
[ ! -e "$ROOTFS/soft/index.o" ] || { echo "legacy /soft/index.o is forbidden in ARM smoke rootfs" >&2; exit 1; }
[ -x "$ROOTFS/usr/bin/node" ] || { echo "target ARM node is missing or not executable" >&2; exit 1; }
[ -f "$ROOTFS/soft/ethyl-core/bin/ethyl-core.js" ] || { echo "clean-room ethyl-core entrypoint is missing" >&2; exit 1; }
[ -f "$ROOTFS/soft/ethyl-core/public/index.html" ] || { echo "portal shell is missing" >&2; exit 1; }
[ -f "$ROOTFS/soft/ethyl-core/public/admin/index.html" ] || { echo "admin shell is missing" >&2; exit 1; }
[ -w "$STATE_ROOT" ] || { echo "state directory is not writable" >&2; exit 1; }

for command in bwrap proot qemu-arm timeout curl setsid; do
    command -v "$command" >/dev/null 2>&1 || {
        echo "required host command is missing: $command" >&2
        exit 2
    }
done

INNER="$STATE_ROOT/.ethyl-arm-smoke-inner.sh"
cat > "$INNER" <<'INNER_EOF'
#!/bin/sh
set -eu

ROOTFS=$1
STATE_ROOT=$2
BACKEND_PID=''

cleanup() {
    if [ -n "$BACKEND_PID" ]; then
        /bin/kill -TERM -- "-$BACKEND_PID" 2>/dev/null || true
        wait "$BACKEND_PID" 2>/dev/null || true
        /bin/kill -KILL -- "-$BACKEND_PID" 2>/dev/null || true
        BACKEND_PID=''
    fi
}
trap cleanup EXIT INT TERM

start_backend() {
    log_file=$1
    setsid env \
        ETHYL_STATE_ROOT=/mnt/wifi5 \
        ETHYL_LOG_LEVEL=info \
        ETHYL_OPENWRT=0 \
        PROOT_NO_SECCOMP=1 \
        proot -q /usr/bin/qemu-arm \
        -R "$ROOTFS" \
        -b "$STATE_ROOT:/mnt/wifi5" \
        -w / \
        /usr/bin/node --no-opt /soft/ethyl-core/bin/ethyl-core.js \
        > "$log_file" 2>&1 &
    BACKEND_PID=$!
}

wait_health() {
    attempt=0
    while [ "$attempt" -lt 300 ]; do
        if curl -fsS --max-time 1 http://127.0.0.1:3000/api/v1/health > "$STATE_ROOT/health.json" 2>/dev/null; then
            return 0
        fi
        if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
            return 1
        fi
        attempt=$((attempt + 1))
        sleep 0.1
    done
    return 1
}

stop_backend() {
    [ -n "$BACKEND_PID" ] || return 0
    /bin/kill -TERM -- "-$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
    /bin/kill -KILL -- "-$BACKEND_PID" 2>/dev/null || true
    BACKEND_PID=''
}

start_backend "$STATE_ROOT/backend-1.log"
if ! wait_health; then
    cat "$STATE_ROOT/backend-1.log" >&2 || true
    echo 'ARM target backend did not become healthy' >&2
    exit 1
fi

grep -q '"local":true' "$STATE_ROOT/health.json"
grep -q '"wanRequired":false' "$STATE_ROOT/health.json"
grep -q '"database":"sqlite"' "$STATE_ROOT/health.json"
echo 'ARM_RUNTIME=PASS'
echo 'NO_WAN=PASS'

[ -f "$ROOTFS/soft/ethyl-core/public/index.html" ]
[ -f "$ROOTFS/soft/ethyl-core/public/admin/index.html" ]
curl -fsS --max-time 2 http://127.0.0.1:3000/api/v1/health >/dev/null
echo 'PORTAL_ADMIN=PASS'

curl -fsS --max-time 2 \
    -H 'content-type: application/json' \
    -X POST \
    --data '{"key":"smoke.arm","value":"persisted"}' \
    http://127.0.0.1:3000/api/v1/settings \
    > "$STATE_ROOT/setting-write.json"
grep -q '"ok":true' "$STATE_ROOT/setting-write.json"

stop_backend
start_backend "$STATE_ROOT/backend-2.log"
if ! wait_health; then
    cat "$STATE_ROOT/backend-2.log" >&2 || true
    echo 'ARM target backend did not restart cleanly' >&2
    exit 1
fi
curl -fsS --max-time 2 http://127.0.0.1:3000/api/v1/settings > "$STATE_ROOT/settings-after-restart.json"
grep -q '"key":"smoke.arm"' "$STATE_ROOT/settings-after-restart.json"
grep -q '"value":"persisted"' "$STATE_ROOT/settings-after-restart.json"
echo 'RESTART_PERSISTENCE=PASS'
stop_backend
trap - EXIT INT TERM
INNER_EOF
chmod 700 "$INNER"

# One writable host path is exposed: STATE_ROOT. Everything else is read-only,
# and --unshare-net leaves only loopback available to the smoke process.
timeout 90 bwrap \
    --unshare-net \
    --ro-bind / / \
    --proc /proc \
    --dev /dev \
    --tmpfs /tmp \
    --bind "$STATE_ROOT" "$STATE_ROOT" \
    /bin/sh "$INNER" "$ROOTFS" "$STATE_ROOT"
