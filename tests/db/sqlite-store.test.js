'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  openSqliteStore,
  resolveDatabasePath,
} = require('../../src/db/sqlite-store');

async function tempDir() {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'ethyl-sqlite-store-'));
}

test('resolves default database under persistent state root', () => {
  assert.equal(
    resolveDatabasePath('/mnt/wifi5'),
    '/mnt/wifi5/ethyl/ethyl.sqlite'
  );

  assert.throws(
    () => resolveDatabasePath('relative-root'),
    /absolute/i
  );

  assert.throws(
    () => resolveDatabasePath('/mnt/wifi5', '../escape.sqlite'),
    /inside|escape|relative/i
  );
});

test('creates a real SQLite database and persists across restart', async (t) => {
  const root = await tempDir();
  t.after(() => fsp.rm(root, { recursive: true, force: true }));

  const first = await openSqliteStore({ stateRoot: root });

  first.exec('CREATE TABLE proof(id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
  first.run('INSERT INTO proof(value) VALUES (?)', ['persisted']);
  await first.persist();
  await first.close();

  const dbPath = path.join(root, 'ethyl', 'ethyl.sqlite');
  const bytes = await fsp.readFile(dbPath);
  assert.equal(bytes.subarray(0, 16).toString('binary'), 'SQLite format 3\u0000');

  const second = await openSqliteStore({ stateRoot: root });
  assert.deepEqual(
    second.all('SELECT id, value FROM proof'),
    [{ id: 1, value: 'persisted' }]
  );
  await second.close();
});

test('new store creates only its own database directory', async (t) => {
  const root = await tempDir();
  t.after(() => fsp.rm(root, { recursive: true, force: true }));

  const legacy = path.join(root, 'legacy-unknown.dat');
  await fsp.writeFile(legacy, Buffer.from('DO-NOT-TOUCH'));

  const store = await openSqliteStore({ stateRoot: root });
  await store.close();

  assert.equal(await fsp.readFile(legacy, 'utf8'), 'DO-NOT-TOUCH');
  assert.equal(
    (await fsp.readFile(path.join(root, 'ethyl', 'ethyl.sqlite')))
      .subarray(0, 16)
      .toString('binary'),
    'SQLite format 3\u0000'
  );
});

test('corrupt existing database fails closed without replacing bytes', async (t) => {
  const root = await tempDir();
  t.after(() => fsp.rm(root, { recursive: true, force: true }));

  const dir = path.join(root, 'ethyl');
  const dbPath = path.join(dir, 'ethyl.sqlite');
  await fsp.mkdir(dir, { recursive: true });
  const corrupt = Buffer.from('not-a-sqlite-database');
  await fsp.writeFile(dbPath, corrupt);

  await assert.rejects(
    openSqliteStore({ stateRoot: root }),
    /integrity|database|sqlite/i
  );

  assert.deepEqual(await fsp.readFile(dbPath), corrupt);
});
