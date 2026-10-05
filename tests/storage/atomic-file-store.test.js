'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const modulePath = path.join(
  root,
  'src',
  'storage',
  'atomic-file-store.js'
);

function loadSubject() {
  return require(modulePath);
}

async function makeTempRoot(t) {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'ethyl-store-')
  );

  t.after(async () => {
    await fs.rm(dir, {
      recursive: true,
      force: true
    });
  });

  return dir;
}

test('module exists', async () => {
  await assert.doesNotReject(
    async () => {
      await fs.access(modulePath);
    },
    'src/storage/atomic-file-store.js must exist'
  );
});

test('writes and reads UTF-8 content', async t => {
  const { createAtomicFileStore } = loadSubject();
  const stateRoot = await makeTempRoot(t);

  const store = createAtomicFileStore({
    root: stateRoot
  });

  await store.writeUtf8(
    'settings.json',
    '{"enabled":true}\n'
  );

  assert.equal(
    await store.readUtf8('settings.json'),
    '{"enabled":true}\n'
  );
});

test('supports nested paths inside root', async t => {
  const { createAtomicFileStore } = loadSubject();
  const stateRoot = await makeTempRoot(t);

  const store = createAtomicFileStore({
    root: stateRoot
  });

  await store.writeUtf8(
    'pppoe/billing/state.txt',
    'active\n'
  );

  assert.equal(
    await store.readUtf8(
      'pppoe/billing/state.txt'
    ),
    'active\n'
  );
});

test('rejects absolute requested paths', async t => {
  const { createAtomicFileStore } = loadSubject();
  const stateRoot = await makeTempRoot(t);

  const store = createAtomicFileStore({
    root: stateRoot
  });

  await assert.rejects(
    store.writeUtf8(
      path.join(
        path.parse(stateRoot).root,
        'outside.txt'
      ),
      'blocked'
    ),
    /relative|absolute/i
  );
});

test('rejects traversal outside root', async t => {
  const { createAtomicFileStore } = loadSubject();
  const stateRoot = await makeTempRoot(t);

  const store = createAtomicFileStore({
    root: stateRoot
  });

  await assert.rejects(
    store.writeUtf8(
      '../outside.txt',
      'blocked'
    ),
    /traversal|outside|root/i
  );

  await assert.rejects(
    store.readUtf8('../outside.txt'),
    /traversal|outside|root/i
  );
});

test('rejects a relative store root', () => {
  const { createAtomicFileStore } = loadSubject();

  assert.throws(
    () => createAtomicFileStore({
      root: 'relative/state'
    }),
    /absolute.*root|root.*absolute/i
  );
});

test('successful write atomically replaces prior content', async t => {
  const { createAtomicFileStore } = loadSubject();
  const stateRoot = await makeTempRoot(t);

  const target = path.join(
    stateRoot,
    'wallet.txt'
  );

  await fs.writeFile(
    target,
    'old-value\n',
    'utf8'
  );

  const store = createAtomicFileStore({
    root: stateRoot
  });

  await store.writeUtf8(
    'wallet.txt',
    'new-value\n'
  );

  assert.equal(
    await fs.readFile(target, 'utf8'),
    'new-value\n'
  );
});

test('successful write leaves no temporary file', async t => {
  const { createAtomicFileStore } = loadSubject();
  const stateRoot = await makeTempRoot(t);

  const store = createAtomicFileStore({
    root: stateRoot,
    randomBytes: () =>
      Buffer.from('0011223344556677', 'hex')
  });

  await store.writeUtf8(
    'voucher.txt',
    'safe\n'
  );

  const names = await fs.readdir(stateRoot);

  assert.deepEqual(
    names,
    ['voucher.txt']
  );
});

test('rename failure preserves old file and removes temp file', async t => {
  const { createAtomicFileStore } = loadSubject();
  const stateRoot = await makeTempRoot(t);

  const target = path.join(
    stateRoot,
    'transactions.json'
  );

  await fs.writeFile(
    target,
    'OLD-COMMITTED-DATA',
    'utf8'
  );

  const failingFs = {
    ...fs,

    async rename() {
      const error = new Error(
        'injected rename failure'
      );

      error.code = 'EIO';
      throw error;
    }
  };

  const store = createAtomicFileStore({
    root: stateRoot,
    fsImpl: failingFs,
    randomBytes: () =>
      Buffer.from('8899aabbccddeeff', 'hex')
  });

  await assert.rejects(
    store.writeUtf8(
      'transactions.json',
      'NEW-UNCOMMITTED-DATA'
    ),
    /injected rename failure/
  );

  assert.equal(
    await fs.readFile(target, 'utf8'),
    'OLD-COMMITTED-DATA'
  );

  const names = await fs.readdir(stateRoot);

  assert.deepEqual(
    names,
    ['transactions.json']
  );
});
