'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..', '..');
const verifier = path.join(root, 'integration', 'firmware', 'verify-opi1-recovery-candidate.sh');

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

async function put(base, relative, content = 'x\n', mode = 0o755) {
  const file = path.join(base, relative);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, content, { mode });
  await fsp.chmod(file, mode);
}

const requiredCommandPaths = [
  'usr/bin/logger', 'usr/bin/lsblk', 'usr/bin/awk', 'bin/grep',
  'usr/sbin/fdisk', 'bin/sync', 'usr/sbin/partx', 'usr/sbin/mkfs.ext4',
  'bin/mkdir', 'bin/mount', 'bin/umount', 'sbin/uci', 'bin/cat', 'bin/rm',
  'bin/netstat', 'usr/bin/node', 'sbin/reboot', 'etc/init.d/dnsmasq',
];

test('verifier requires explicit source hash candidate build metadata and report path', () => {
  const result = spawnSync('/bin/sh', [verifier], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SOURCE_GZ.*EXPECTED_SHA256.*CANDIDATE_RAW.*BUILD_WORK.*REPORT/i);
});

test('target-command mode reports a missing required command instead of silently passing', async (t) => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ethyl-target-commands-'));
  t.after(() => fsp.rm(dir, { recursive: true, force: true }));
  for (const rel of requiredCommandPaths) {
    if (rel === 'usr/sbin/partx') continue;
    await put(dir, rel);
  }
  const result = spawnSync('/bin/sh', [verifier, '--check-rootfs-commands', dir], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /partx=FAIL/);
  assert.match(result.stdout, /TARGET_COMMANDS=FAIL/);
});

test('target-command mode passes when every launcher/bootstrap command exists', async (t) => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ethyl-target-commands-ok-'));
  t.after(() => fsp.rm(dir, { recursive: true, force: true }));
  for (const rel of requiredCommandPaths) await put(dir, rel);
  const result = spawnSync('/bin/sh', [verifier, '--check-rootfs-commands', dir], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /TARGET_COMMANDS=PASS/);
});

test('invalid candidate partition table is rejected as geometry failure', async (t) => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ethyl-verify-geometry-'));
  t.after(() => fsp.rm(dir, { recursive: true, force: true }));
  const sourceRaw = path.join(dir, 'source.raw');
  const sourceGz = path.join(dir, 'source.img.gz');
  const candidate = path.join(dir, 'candidate.img');
  const build = path.join(dir, 'build');
  const report = path.join(dir, 'report.txt');
  await fsp.writeFile(sourceRaw, Buffer.alloc(4096));
  const gz = spawnSync('gzip', ['-c', sourceRaw], { encoding: null });
  await fsp.writeFile(sourceGz, gz.stdout);
  await fsp.writeFile(candidate, Buffer.alloc(4096));
  await fsp.mkdir(build);
  await fsp.writeFile(path.join(build, 'partitions.before.json'), JSON.stringify({ partitiontable: { partitions: [{ start: 1, size: 1 }, { start: 2, size: 1 }] } }));
  await fsp.writeFile(path.join(build, 'raw-candidate.sha256'), `${sha256(candidate)}  ${candidate}\n`);
  await fsp.writeFile(path.join(build, 'trailer.before.bin'), Buffer.alloc(0));
  const result = spawnSync('/bin/sh', [verifier, sourceGz, sha256(sourceGz), candidate, build, report], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /geometry|partition/i);
});

test('verifier source is read-only and covers boot region p2 trailer rootfs and optional gzip round-trip', async () => {
  const text = await fsp.readFile(verifier, 'utf8');
  assert.match(text, /fdisk\s+-l/);
  assert.match(text, /sfdisk\s+--json/);
  assert.match(text, /debugfs\s+-R/);
  assert.doesNotMatch(text, /debugfs\s+-w|\n\s*(?:e2fsck|fsck(?:\.\w+)?|mkfs\.\w+)\s/);
  assert.match(text, /BOOT_REGION_PRESERVED/);
  assert.match(text, /P2_READABLE/);
  assert.match(text, /TRAILER_PRESERVED/);
  assert.match(text, /verify-rootfs-contract\.js/);
  assert.match(text, /GZIP_ROUNDTRIP/);
  assert.match(text, /gzip\s+-t/);
});
