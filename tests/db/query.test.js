'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { openSqliteStore } = require('../../src/db/sqlite-store');
const { applyMigrations } = require('../../src/db/migrations');
const { createQueryApi } = require('../../src/db/query');

async function makeStore(t) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'ethyl-query-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const store = await openSqliteStore({ stateRoot: root });
  await applyMigrations(store);
  t.after(() => store.close());
  return store;
}

test('binds values instead of treating them as SQL syntax', async (t) => {
  const store = await makeStore(t);
  const query = createQueryApi(store);
  const hostile = "x'); DROP TABLE settings; --";

  query.run(
    'INSERT INTO settings(key, value_json, updated_at) VALUES (?, ?, ?)',
    ['safe-key', JSON.stringify(hostile), 1]
  );

  assert.deepEqual(
    query.all('SELECT value_json FROM settings WHERE key = ?', ['safe-key']),
    [{ value_json: JSON.stringify(hostile) }]
  );

  assert.deepEqual(
    query.all("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'"),
    [{ name: 'settings' }]
  );
});

test('rejects non-string SQL and non-array/object parameter containers', async (t) => {
  const store = await makeStore(t);
  const query = createQueryApi(store);

  assert.throws(() => query.all('', []), /sql/i);
  assert.throws(() => query.run('SELECT 1', 'bad'), /parameter/i);
});
