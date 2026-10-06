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
const builder = path.join(root, 'integration', 'firmware', 'build-opi1-recovery-candidate.sh');

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

test('builder requires explicit source hash output and work directory', () => {
  const result = spawnSync('/bin/sh', [builder], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SOURCE_GZ.*EXPECTED_SHA256.*OUTPUT_RAW.*WORK_DIR/i);
});

test('builder rejects a bad source hash without changing source bytes', async (t) => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ethyl-build-contract-'));
  t.after(() => fsp.rm(dir, { recursive: true, force: true }));
  const source = path.join(dir, 'source.img.gz');
  const raw = path.join(dir, 'raw.txt');
  await fsp.writeFile(raw, 'immutable-source-fixture\n');
  const gz = spawnSync('gzip', ['-c', raw], { encoding: null });
  assert.equal(gz.status, 0);
  await fsp.writeFile(source, gz.stdout);
  const before = sha256(source);
  const result = spawnSync('/bin/sh', [builder, source, '0'.repeat(64), path.join(dir, 'out.img'), path.join(dir, 'work')], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /sha|hash|checksum/i);
  assert.equal(sha256(source), before);
});

test('builder refuses to use the source gzip path as raw output', async (t) => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ethyl-build-same-path-'));
  t.after(() => fsp.rm(dir, { recursive: true, force: true }));
  const source = path.join(dir, 'source.img.gz');
  const raw = path.join(dir, 'raw.txt');
  await fsp.writeFile(raw, 'fixture\n');
  const gz = spawnSync('gzip', ['-c', raw], { encoding: null });
  await fsp.writeFile(source, gz.stdout);
  const digest = sha256(source);
  const result = spawnSync('/bin/sh', [builder, source, digest, source, path.join(dir, 'work')], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /source.*output|output.*source|overwrite/i);
});

test('builder contract uses verified decompression, p2 debugfs staging, geometry/trailer gates, and Task-4 verifier', async () => {
  const text = await fsp.readFile(builder, 'utf8');
  assert.match(text, /gzip\s+-t/);
  assert.match(text, /sha256sum/);
  assert.match(text, /gzip\s+-dc/);
  assert.match(text, /stage-rootfs\.js/);
  assert.match(text, /debugfs/);
  assert.match(text, /dd[\s\S]*(?:skip|seek)/);
  assert.match(text, /fdisk\s+-l/);
  assert.match(text, /trailer/i);
  assert.match(text, /verify-rootfs-contract\.js/);
  assert.match(text, /soft\/config\/nginx\.locations/);
  assert.match(text, /soft\/config\/admin\.locations/);
  assert.doesNotMatch(text, /gzip\s+-c[\s\S]*OUTPUT_RAW/);
});
