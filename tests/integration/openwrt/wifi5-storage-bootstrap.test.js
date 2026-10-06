'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..', '..');
const helper = path.join(root, 'integration', 'openwrt', 'wifi5-storage-bootstrap.sh');

async function writeExecutable(file, body) {
  await fsp.writeFile(file, body, { mode: 0o755 });
  await fsp.chmod(file, 0o755);
}

async function makeHarness(t, options = {}) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ethyl-wifi5-bootstrap-'));
  t.after(() => fsp.rm(dir, { recursive: true, force: true }));
  const bin = path.join(dir, 'bin');
  const mountpoint = path.join(dir, 'mnt', 'wifi5');
  const procMounts = path.join(dir, 'proc-mounts');
  const tempLease = path.join(dir, 'dhcp.leases.tmp');
  const log = path.join(dir, 'commands.log');
  const fdiskPresent = path.join(dir, 'fdisk-present');
  const p3Visible = path.join(dir, 'p3-visible');
  const uciLease = path.join(dir, 'uci-lease');
  await fsp.mkdir(bin, { recursive: true });
  await fsp.writeFile(procMounts, '');
  await fsp.writeFile(log, '');
  await fsp.writeFile(tempLease, 'aa:bb:cc:dd:ee:ff 10.0.0.2 client *\n');
  await fsp.writeFile(uciLease, '/tmp/dhcp.leases\n');
  if (options.fdiskPresent) await fsp.writeFile(fdiskPresent, '1');
  if (options.p3Visible) await fsp.writeFile(p3Visible, '1');

  const common = `#!/bin/sh\nset -eu\nprintf '%s\\n' "$0 $*" >> "$HARNESS_LOG"\n`;

  await writeExecutable(path.join(bin, 'lsblk'), common + `
case "$*" in
  *NAME,MOUNTPOINT*) printf '%s /\\n' "$ROOTPART" ;;
  *NAME,TYPE,PKNAME*)
    printf '%s disk -\\n' "$DISK"
    printf '%s part %s\\n' "$ROOTPART" "$DISK"
    [ ! -f "$P3_VISIBLE_FILE" ] || printf '%s part %s\\n' "$P3" "$DISK"
    ;;
  *NAME,FSTYPE*)
    [ ! -f "$P3_VISIBLE_FILE" ] || printf '%s %s\\n' "$P3" "$P3_FSTYPE"
    ;;
  *NAME*)
    printf '%s\\n%s\\n' "$DISK" "$ROOTPART"
    [ ! -f "$P3_VISIBLE_FILE" ] || printf '%s\\n' "$P3"
    ;;
esac
`);

  await writeExecutable(path.join(bin, 'fdisk'), common + `
if [ "\${1:-}" = "-l" ]; then
  printf 'Disk %s: 4 GiB\\n' "$DISK"
  printf 'Device Start End Sectors Size Id Type\\n'
  printf '%s 100 1000 901 1M 83 Linux\\n' "$ROOTPART"
  [ ! -f "$FDISK_PRESENT_FILE" ] || printf '%s 1100 8000 6901 3M 83 Linux\\n' "$P3"
  exit 0
fi
cat >/dev/null
[ "\${FDISK_FAIL:-0}" != 1 ] || exit 1
: > "$FDISK_PRESENT_FILE"
exit 0
`);

  await writeExecutable(path.join(bin, 'partx'), common + `
[ "\${PARTX_FAIL:-0}" != 1 ] || exit 1
[ "\${PARTX_MAKES_VISIBLE:-0}" != 1 ] || : > "$P3_VISIBLE_FILE"
`);
  await writeExecutable(path.join(bin, 'mkfs.ext4'), common + `exit 0\n`);
  await writeExecutable(path.join(bin, 'mount'), common + `
printf '%s %s ext4 rw 0 0\\n' "$P3" "$WIFI5_MOUNTPOINT" >> "$WIFI5_PROC_MOUNTS"
`);
  await writeExecutable(path.join(bin, 'umount'), common + `exit 0\n`);
  await writeExecutable(path.join(bin, 'sync'), common + `exit 0\n`);
  await writeExecutable(path.join(bin, 'logger'), common + `exit 0\n`);
  await writeExecutable(path.join(bin, 'uci'), common + `
case "$*" in
  '-q get dhcp.@dnsmasq[0].leasefile') cat "$UCI_LEASE_FILE" ;;
  set*) printf '%s\\n' "\${2#*=}" | tr -d "'" > "$UCI_LEASE_FILE" ;;
  commit*) : ;;
esac
`);
  const dnsmasqInit = path.join(dir, 'dnsmasq-init');
  await writeExecutable(dnsmasqInit, common + `exit 0\n`);

  const disk = options.disk || '/dev/loop0';
  const rootpart = options.rootpart || (/[0-9]$/.test(disk) ? `${disk}p2` : `${disk}2`);
  const p3 = options.p3 || (/[0-9]$/.test(disk) ? `${disk}p3` : `${disk}3`);

  const env = {
    ...process.env,
    PATH: `${bin}:/usr/bin:/bin`,
    HARNESS_LOG: log,
    DISK: disk,
    ROOTPART: rootpart,
    P3: p3,
    P3_FSTYPE: options.fstype ?? 'ext4',
    P3_VISIBLE_FILE: p3Visible,
    FDISK_PRESENT_FILE: fdiskPresent,
    UCI_LEASE_FILE: uciLease,
    FDISK_FAIL: options.fdiskFail ? '1' : '0',
    PARTX_FAIL: options.partxFail ? '1' : '0',
    PARTX_MAKES_VISIBLE: options.partxMakesVisible ? '1' : '0',
    WIFI5_MOUNTPOINT: mountpoint,
    WIFI5_PROC_MOUNTS: procMounts,
    WIFI5_TEMP_LEASEFILE: tempLease,
    WIFI5_DNSMASQ_INIT: dnsmasqInit,
  };

  return {
    mountpoint, log, env,
    run() {
      return spawnSync('/bin/sh', [helper], { env, encoding: 'utf8' });
    },
    async commands() { return fsp.readFile(log, 'utf8'); },
  };
}

test('missing p3 is created once and requests reboot when device node stays hidden', async (t) => {
  const h = await makeHarness(t, { fdiskPresent: false, p3Visible: false, partxMakesVisible: false });
  const result = h.run();
  assert.equal(result.status, 75, result.stderr || result.stdout);
  const commands = await h.commands();
  assert.match(commands, /fdisk \/dev\/loop0/);
  assert.match(commands, /partx -u \/dev\/loop0/);
  assert.doesNotMatch(commands, /mkfs\.ext4/);
});

test('existing ext4 p3 mounts without formatting and migrates DHCP lease storage', async (t) => {
  const h = await makeHarness(t, { fdiskPresent: true, p3Visible: true, fstype: 'ext4' });
  const result = h.run();
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const commands = await h.commands();
  assert.doesNotMatch(commands, /mkfs\.ext4/);
  assert.match(commands, /mount -t ext4 \/dev\/loop0p3/);
  assert.match(commands, /uci set dhcp\.@dnsmasq\[0\]\.leasefile=/);
  assert.match(commands, /dnsmasq-init restart/);
  assert.equal(fs.existsSync(path.join(h.mountpoint, 'dhcp.leases')), true);
});

test('blank p3 is formatted exactly once before mount', async (t) => {
  const h = await makeHarness(t, { fdiskPresent: true, p3Visible: true, fstype: '' });
  const result = h.run();
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const commands = await h.commands();
  assert.equal((commands.match(/mkfs\.ext4/g) || []).length, 1);
  assert.match(commands, /mount -t ext4/);
});

test('unexpected existing filesystem hard-fails without formatting', async (t) => {
  const h = await makeHarness(t, { fdiskPresent: true, p3Visible: true, fstype: 'xfs' });
  const result = h.run();
  assert.notEqual(result.status, 0);
  assert.notEqual(result.status, 75);
  const commands = await h.commands();
  assert.doesNotMatch(commands, /mkfs\.ext4/);
  assert.doesNotMatch(commands, /mount -t ext4/);
});

test('p3 listed in partition table but still absent after rescan is a hard failure', async (t) => {
  const h = await makeHarness(t, { fdiskPresent: true, p3Visible: false, partxMakesVisible: false });
  const result = h.run();
  assert.notEqual(result.status, 0);
  assert.notEqual(result.status, 75);
  const commands = await h.commands();
  assert.match(commands, /partx -u/);
  assert.doesNotMatch(commands, /fdisk \/dev\/loop0$/m);
});

test('fdisk no-space failure is hard failure with no format or mount', async (t) => {
  const h = await makeHarness(t, { fdiskPresent: false, p3Visible: false, fdiskFail: true });
  const result = h.run();
  assert.notEqual(result.status, 0);
  assert.notEqual(result.status, 75);
  const commands = await h.commands();
  assert.match(commands, /fdisk \/dev\/loop0/);
  assert.doesNotMatch(commands, /mkfs\.ext4|mount -t ext4/);
});

test('sda-style disk derives /dev/sda3 instead of /dev/sdap3', async (t) => {
  const h = await makeHarness(t, {
    disk: '/dev/sda', rootpart: '/dev/sda2', p3: '/dev/sda3',
    fdiskPresent: true, p3Visible: true, fstype: 'ext4',
  });
  const result = h.run();
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(await h.commands(), /mount -t ext4 \/dev\/sda3/);
});
