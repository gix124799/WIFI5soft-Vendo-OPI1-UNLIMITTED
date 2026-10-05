'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  writeAtomicDatabaseFile,
} = require('../../src/db/atomic-db-file');

async function tempDir() {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'ethyl-atomic-db-'));
}

test('atomically replaces database bytes and leaves no temp files', async (t) => {
  const root = await tempDir();
  t.after(() => fsp.rm(root, { recursive: true, force: true }));

  const target = path.join(root, 'ethyl.sqlite');
  await fsp.writeFile(target, Buffer.from('old'));

  await writeAtomicDatabaseFile(target, Buffer.from('new-data'));

  assert.equal(await fsp.readFile(target, 'utf8'), 'new-data');
  assert.deepEqual(
    (await fsp.readdir(root)).filter((name) => name.includes('.tmp-')),
    []
  );
});

test('rename failure preserves prior database and removes temporary file', async (t) => {
  const root = await tempDir();
  t.after(() => fsp.rm(root, { recursive: true, force: true }));

  const target = path.join(root, 'ethyl.sqlite');
  await fsp.writeFile(target, Buffer.from('previous'));

  const fsImpl = {
    ...fsp,
    async rename() {
      throw new Error('simulated rename failure');
    },
  };

  await assert.rejects(
    writeAtomicDatabaseFile(target, Buffer.from('replacement'), { fsImpl }),
    /rename failure/i
  );

  assert.equal(await fsp.readFile(target, 'utf8'), 'previous');
  assert.deepEqual(
    (await fsp.readdir(root)).filter((name) => name.includes('.tmp-')),
    []
  );
});

test('requires an absolute target path', async () => {
  await assert.rejects(
    writeAtomicDatabaseFile('relative.sqlite', Buffer.from('x')),
    /absolute/i
  );
});
