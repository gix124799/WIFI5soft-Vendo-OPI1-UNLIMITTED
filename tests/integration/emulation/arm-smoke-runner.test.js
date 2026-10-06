'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..', '..');
const runner = path.join(root, 'integration', 'emulation', 'run-arm-smoke.sh');

async function fixture(t, options = {}) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ethyl-arm-smoke-runner-'));
  t.after(() => fsp.rm(dir, { recursive: true, force: true }));
  const rootfs = path.join(dir, 'rootfs');
  const state = path.join(dir, 'state');
  await fsp.mkdir(path.join(rootfs, 'usr', 'bin'), { recursive: true });
  await fsp.mkdir(path.join(rootfs, 'soft', 'ethyl-core', 'bin'), { recursive: true });
  await fsp.mkdir(path.join(rootfs, 'soft', 'ethyl-core', 'src', 'ui', 'portal'), { recursive: true });
  await fsp.mkdir(path.join(rootfs, 'soft', 'ethyl-core', 'src', 'ui', 'admin'), { recursive: true });
  await fsp.mkdir(state, { recursive: true });
  if (options.node !== false) {
    await fsp.writeFile(path.join(rootfs, 'usr', 'bin', 'node'), 'fake-node', { mode: 0o755 });
    await fsp.chmod(path.join(rootfs, 'usr', 'bin', 'node'), 0o755);
  }
  if (options.entrypoint !== false) {
    await fsp.writeFile(path.join(rootfs, 'soft', 'ethyl-core', 'bin', 'ethyl-core.js'), "'use strict';\n");
  }
  await fsp.writeFile(path.join(rootfs, 'soft', 'ethyl-core', 'src', 'ui', 'portal', 'index.html'), '<h1>portal</h1>\n');
  await fsp.writeFile(path.join(rootfs, 'soft', 'ethyl-core', 'src', 'ui', 'admin', 'index.html'), '<h1>admin</h1>\n');
  if (options.legacy) {
    await fsp.writeFile(path.join(rootfs, 'soft', 'index.o'), 'legacy');
  }
  return { dir, rootfs, state };
}

function run(rootfs, state, extraEnv = {}) {
  return spawnSync('/bin/sh', [runner, rootfs, state], {
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
  });
}

test('runner rejects a staged rootfs that still contains opaque /soft/index.o', async (t) => {
  const f = await fixture(t, { legacy: true });
  const result = run(f.rootfs, f.state);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /index\.o|legacy/i);
});

test('runner rejects a rootfs without target Node or clean-room entrypoint', async (t) => {
  const noNode = await fixture(t, { node: false });
  const first = run(noNode.rootfs, noNode.state);
  assert.notEqual(first.status, 0);
  assert.match(first.stderr, /node/i);

  const noEntry = await fixture(t, { entrypoint: false });
  const second = run(noEntry.rootfs, noEntry.state);
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /entrypoint|ethyl-core/i);
});

test('runner source requires network isolation, ARM emulation, proot, one writable state bind, and finite timeout', async () => {
  const text = await fsp.readFile(runner, 'utf8');
  assert.match(text, /bwrap[\s\S]*--unshare-net/);
  assert.match(text, /--ro-bind\s+\/\s+\//);
  assert.match(text, /--bind[\s\S]*STATE_ROOT/);
  assert.doesNotMatch(text, /--bind\s+\/\s+\//);
  assert.match(text, /proot[\s\S]*-q[\s\S]*qemu-arm/);
  assert.match(text, /timeout\s+[^\n]*[0-9]+/);
  assert.match(text, /ARM_RUNTIME=PASS/);
  assert.match(text, /NO_WAN=PASS/);
  assert.match(text, /PORTAL_ADMIN=PASS/);
  assert.match(text, /RESTART_PERSISTENCE=PASS/);
});

test('runner disables PRoot seccomp acceleration for the proven qemu-arm compatibility path', async () => {
  const text = await fsp.readFile(runner, 'utf8');
  assert.match(text, /PROOT_NO_SECCOMP=1[\s\\]*\n?[\s\S]{0,120}proot\s+-q\s+\/usr\/bin\/qemu-arm/);
});

test('runner allows measured ARM startup latency while retaining a finite outer timeout', async () => {
  const text = await fsp.readFile(runner, 'utf8');
  assert.match(text, /while \[ "\$attempt" -lt 300 \]/);
  assert.match(text, /timeout 90 bwrap/);
});

test('runner disables adaptive V8 optimization only for ARM emulation stability', async () => {
  const text = await fsp.readFile(runner, 'utf8');
  assert.match(text, /\/usr\/bin\/node\s+--no-opt\s+\/soft\/ethyl-core\/bin\/ethyl-core\.js/);
});

test('runner launches the emulator in its own session and terminates the whole process group', async () => {
  const text = await fsp.readFile(runner, 'utf8');
  assert.match(text, /setsid\s+env[\s\S]*proot/);
  assert.match(text, /kill\s+-TERM\s+--\s+"-\$BACKEND_PID"/);
  assert.match(text, /kill\s+-KILL\s+--\s+"-\$BACKEND_PID"/);
});
