'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { openSqliteStore } = require('../../src/db/sqlite-store');
const { applyMigrations } = require('../../src/db/migrations');
const { withTransaction } = require('../../src/db/transaction');

async function makeStore(t) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'ethyl-tx-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const store = await openSqliteStore({ stateRoot: root });
  await applyMigrations(store);
  t.after(() => store.close());
  return store;
}

function wrapPersistCounter(store) {
  let count = 0;

  return {
    store: Object.freeze({
      exec: store.exec,
      run: store.run,
      all: store.all,
      async persist() {
        count += 1;
        return store.persist();
      },
    }),
    getCount() {
      return count;
    },
  };
}

test('successful transaction commits and persists exactly once', async (t) => {
  const base = await makeStore(t);
  const wrapped = wrapPersistCounter(base);

  const result = await withTransaction(wrapped.store, async (tx) => {
    tx.run(
      'INSERT INTO settings(key, value_json, updated_at) VALUES (?, ?, ?)',
      ['mode', '"offline"', 1]
    );
    return 'done';
  });

  assert.equal(result, 'done');
  assert.equal(wrapped.getCount(), 1);
  assert.deepEqual(
    base.all('SELECT key FROM settings'),
    [{ key: 'mode' }]
  );
});

test('failed transaction rolls back and does not persist', async (t) => {
  const base = await makeStore(t);
  const wrapped = wrapPersistCounter(base);

  await assert.rejects(
    withTransaction(wrapped.store, async (tx) => {
      tx.run(
        'INSERT INTO settings(key, value_json, updated_at) VALUES (?, ?, ?)',
        ['bad', '"value"', 1]
      );
      throw new Error('business failure');
    }),
    /business failure/i
  );

  assert.equal(wrapped.getCount(), 0);
  assert.deepEqual(base.all('SELECT key FROM settings WHERE key = ?', ['bad']), []);
});
