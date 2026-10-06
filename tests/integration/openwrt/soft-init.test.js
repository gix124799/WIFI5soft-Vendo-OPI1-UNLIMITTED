'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..', '..');
const softInit = path.join(root, 'integration', 'openwrt', 'soft.init');

async function executable(file, body) {
  await fsp.writeFile(file, body, { mode: 0o755 });
  await fsp.chmod(file, 0o755);
}

async function harness(t, options = {}) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ethyl-soft-init-'));
  t.after(() => fsp.rm(dir, { recursive: true, force: true }));
  const bin = path.join(dir, 'bin');
  const stateRoot = path.join(dir, 'mnt', 'wifi5');
  const procMounts = path.join(dir, 'proc-mounts');
  const log = path.join(dir, 'events.log');
  const netstatOut = path.join(dir, 'netstat.out');
  const bootstrap = path.join(dir, 'bootstrap');
  const reboot = path.join(dir, 'reboot');
  const nodeBin = path.join(dir, 'node');
  const entrypoint = path.join(dir, 'ethyl-core.js');
  const runner = path.join(dir, 'runner.sh');

  await fsp.mkdir(bin, { recursive: true });
  await fsp.mkdir(stateRoot, { recursive: true });
  await fsp.writeFile(log, '');
  await fsp.writeFile(netstatOut, options.netstatOutput || '');
  await fsp.writeFile(
    procMounts,
    options.mounted === false ? '' : `/dev/loop0p3 ${stateRoot} ext4 rw 0 0\n`
  );
  if (options.entrypoint !== false) await fsp.writeFile(entrypoint, "'use strict';\n");
  if (options.node !== false) await executable(nodeBin, '#!/bin/sh\nexit 0\n');

  await executable(bootstrap, `#!/bin/sh\nprintf '%s\\n' bootstrap >> "$EVENT_LOG"\nexit ${options.bootstrapStatus ?? 0}\n`);
  await executable(reboot, '#!/bin/sh\nprintf "%s\\n" reboot >> "$EVENT_LOG"\nexit 0\n');
  await executable(path.join(bin, 'logger'), '#!/bin/sh\nprintf "logger %s\\n" "$*" >> "$EVENT_LOG"\nexit 0\n');
  await executable(path.join(bin, 'netstat'), '#!/bin/sh\nprintf "netstat %s\\n" "$*" >> "$EVENT_LOG"\ncat "$NETSTAT_OUT"\n');

  await executable(runner, `#!/bin/sh
procd_open_instance() { printf '%s\\n' procd_open_instance >> "$EVENT_LOG"; }
procd_set_param() { printf 'procd_set_param %s\\n' "$*" >> "$EVENT_LOG"; }
procd_close_instance() { printf '%s\\n' procd_close_instance >> "$EVENT_LOG"; }
. "$SOFT_INIT"
start_service
rc=$?
printf 'start_rc %s\\n' "$rc" >> "$EVENT_LOG"
exit "$rc"
`);

  const env = {
    ...process.env,
    PATH: `${bin}:/usr/bin:/bin`,
    EVENT_LOG: log,
    NETSTAT_OUT: netstatOut,
    SOFT_INIT: softInit,
    ETHYL_LAUNCHER_BOOTSTRAP: bootstrap,
    ETHYL_LAUNCHER_REBOOT: reboot,
    ETHYL_LAUNCHER_NODE: nodeBin,
    ETHYL_LAUNCHER_ENTRYPOINT: entrypoint,
    ETHYL_LAUNCHER_STATE_ROOT: stateRoot,
    ETHYL_LAUNCHER_PROC_MOUNTS: procMounts,
  };

  return {
    dir, stateRoot, log, env,
    run() { return spawnSync('/bin/sh', [runner], { env, encoding: 'utf8' }); },
    async events() { return fsp.readFile(log, 'utf8'); },
  };
}

test('launcher keeps START=95 and runs bootstrap before opening procd instance', async (t) => {
  const h = await harness(t);
  const result = h.run();
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const events = await h.events();
  assert.ok(events.indexOf('bootstrap') < events.indexOf('procd_open_instance'), events);
  assert.match(events, /procd_set_param command .*node .*ethyl-core\.js/);
  assert.match(events, /procd_set_param env ETHYL_STATE_ROOT=\/mnt\/wifi5 ETHYL_LOG_LEVEL=info ETHYL_OPENWRT=1/);
  const text = await fsp.readFile(softInit, 'utf8');
  assert.match(text, /^START=95$/m);
  assert.doesNotMatch(text, /index\.o/);
});

test('bootstrap exit 75 requests exactly one reboot and never launches backend', async (t) => {
  const h = await harness(t, { bootstrapStatus: 75 });
  const result = h.run();
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const events = await h.events();
  assert.equal((events.match(/^reboot$/gm) || []).length, 1, events);
  assert.doesNotMatch(events, /procd_open_instance|procd_set_param command/);
});

test('bootstrap hard failure blocks reboot and backend launch', async (t) => {
  const h = await harness(t, { bootstrapStatus: 1 });
  const result = h.run();
  assert.notEqual(result.status, 0);
  const events = await h.events();
  assert.doesNotMatch(events, /^reboot$/m);
  assert.doesNotMatch(events, /procd_open_instance|procd_set_param command/);
});

test('missing persistence mount blocks backend launch', async (t) => {
  const h = await harness(t, { mounted: false });
  const result = h.run();
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(await h.events(), /procd_open_instance|procd_set_param command/);
});

test('missing node binary or entrypoint blocks backend launch', async (t) => {
  const noNode = await harness(t, { node: false });
  assert.notEqual(noNode.run().status, 0);
  assert.doesNotMatch(await noNode.events(), /procd_open_instance/);

  const noEntry = await harness(t, { entrypoint: false });
  assert.notEqual(noEntry.run().status, 0);
  assert.doesNotMatch(await noEntry.events(), /procd_open_instance/);
});

test('occupied local backend port blocks launch without respawn loop', async (t) => {
  const h = await harness(t, {
    netstatOutput: 'tcp        0      0 127.0.0.1:3001          0.0.0.0:*               LISTEN\n',
  });
  const result = h.run();
  assert.notEqual(result.status, 0);
  const events = await h.events();
  assert.doesNotMatch(events, /procd_open_instance|procd_set_param command/);
  assert.equal((events.match(/^netstat /gm) || []).length, 2);
});
