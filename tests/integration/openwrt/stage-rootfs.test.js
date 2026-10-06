'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..', '..');
const { stageRootfs } = require('../../../integration/openwrt/stage-rootfs');

async function tempRoot(t) {
  const target = await fsp.mkdtemp(path.join(os.tmpdir(), 'ethyl-openwrt-stage-'));
  t.after(() => fsp.rm(target, { recursive: true, force: true }));
  return target;
}

test('staging refuses a rootfs that still contains the opaque legacy core', async (t) => {
  const target = await tempRoot(t);
  await fsp.mkdir(path.join(target, 'soft'), { recursive: true });
  await fsp.writeFile(path.join(target, 'soft', 'index.o'), 'legacy');

  await assert.rejects(
    stageRootfs({ projectRoot: root, targetRoot: target }),
    /index\.o|legacy core/i
  );
});

test('staging installs only the ETHYLNET node launcher and local SQLite runtime', async (t) => {
  const target = await tempRoot(t);
  const result = await stageRootfs({ projectRoot: root, targetRoot: target });

  const init = await fsp.readFile(path.join(target, 'etc', 'init.d', 'soft'), 'utf8');
  assert.match(init, /\/usr\/bin\/node\s+\/soft\/ethyl-core\/bin\/ethyl-core\.js/);
  assert.match(init, /ETHYL_STATE_ROOT=\/mnt\/wifi5/);
  assert.doesNotMatch(init, /index\.o|ngrok|zerotier|https?:\/\//i);

  assert.equal(fs.existsSync(path.join(target, 'soft', 'index.o')), false);
  assert.equal(fs.existsSync(path.join(target, 'soft', 'ethyl-core', 'bin', 'ethyl-core.js')), true);
  assert.equal(fs.existsSync(path.join(target, 'soft', 'ethyl-core', 'src', 'core', 'app.js')), true);
  assert.equal(fs.existsSync(path.join(target, 'soft', 'ethyl-core', 'node_modules', 'sql.js', 'dist', 'sql-wasm.js')), true);
  assert.equal(fs.existsSync(path.join(target, 'soft', 'ethyl-core', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')), true);
  assert.equal(fs.existsSync(path.join(target, 'mnt', 'wifi5', 'ethyl')), true);
  assert.equal(result.stateRoot, '/mnt/wifi5');
});

test('staged production tree contains no opaque-core fallback or remote tunnel token', async (t) => {
  const target = await tempRoot(t);
  await stageRootfs({ projectRoot: root, targetRoot: target });

  const files = [];
  async function walk(dir) {
    for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) files.push(full);
    }
  }
  await walk(path.join(target, 'soft', 'ethyl-core'));

  const text = files
    .filter((file) => /\.(?:js|json|sh)$/.test(file) || path.basename(file) === 'package.json')
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');

  assert.doesNotMatch(text, /\/soft\/index\.o|ngrok|zerotier/i);
});
