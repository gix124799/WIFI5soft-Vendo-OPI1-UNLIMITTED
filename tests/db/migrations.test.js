'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  openSqliteStore,
} = require('../../src/db/sqlite-store');

const {
  CURRENT_SCHEMA_VERSION,
  SCHEMA_TABLES,
} = require('../../src/db/schema');

const {
  applyMigrations,
} = require('../../src/db/migrations');

async function tempDir() {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'ethyl-migrations-'));
}

async function withStore(t) {
  const root = await tempDir();
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const store = await openSqliteStore({ stateRoot: root });
  t.after(() => store.close());
  return store;
}

test('migrates a new database to the current schema', async (t) => {
  const store = await withStore(t);

  await applyMigrations(store);

  const version = store.all('PRAGMA user_version')[0].user_version;
  assert.equal(version, CURRENT_SCHEMA_VERSION);

  const rows = store.all(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );
  const actual = rows.map((row) => row.name).sort();

  assert.deepEqual(actual, [...SCHEMA_TABLES].sort());

  assert.deepEqual(
    store.all("SELECT value FROM schema_meta WHERE key='schema_version'"),
    [{ value: String(CURRENT_SCHEMA_VERSION) }]
  );
});

test('migration is idempotent', async (t) => {
  const store = await withStore(t);

  await applyMigrations(store);
  const first = store.all(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );

  await applyMigrations(store);
  const second = store.all(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );

  assert.deepEqual(second, first);
});

test('future schema version fails closed', async (t) => {
  const store = await withStore(t);

  store.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION + 1}`);
  await store.persist();

  await assert.rejects(
    applyMigrations(store),
    /future|newer|unsupported/i
  );
});

test('foreign-key constraints are enabled after migration', async (t) => {
  const store = await withStore(t);
  await applyMigrations(store);

  assert.equal(store.all('PRAGMA foreign_keys')[0].foreign_keys, 1);

  assert.throws(
    () => store.run(
      'INSERT INTO sessions(id, device_id, remaining_seconds, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['s1', 'missing-device', 10, 'active', 1, 1]
    ),
    /foreign key/i
  );
});

test('failed migration rolls back earlier statements', async (t) => {
  const store = await withStore(t);
  let injected = false;

  const wrapper = Object.freeze({
    all: store.all,
    run: store.run,
    persist: store.persist,
    exec(sql) {
      if (!injected && /CREATE TABLE vouchers/i.test(sql)) {
        injected = true;
        throw new Error('injected migration failure');
      }

      return store.exec(sql);
    },
  });

  await assert.rejects(
    applyMigrations(wrapper),
    /injected migration failure/i
  );

  assert.equal(store.all('PRAGMA user_version')[0].user_version, 0);
  assert.deepEqual(
    store.all("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'"),
    []
  );
});
