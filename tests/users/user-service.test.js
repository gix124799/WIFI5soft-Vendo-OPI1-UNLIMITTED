'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { openSqliteStore } = require('../../src/db/sqlite-store');
const { applyMigrations } = require('../../src/db/migrations');
const { createUserService } = require('../../src/users/user-service');

async function readyStore(t) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'ethyl-user-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const store = await openSqliteStore({ stateRoot: root });
  await applyMigrations(store);
  t.after(() => store.close());
  return store;
}

test('upserting same username keeps stable user identity', async (t) => {
  const store = await readyStore(t);
  let ids = 0;
  const service = createUserService({
    store,
    now: () => 10,
    createIdFn() {
      ids += 1;
      return `user_test_${ids}`;
    },
  });

  const first = await service.upsert({
    username: 'customer1',
    displayName: 'Customer One',
    metadata: { note: 'first' },
  });

  const second = await service.upsert({
    username: 'customer1',
    displayName: 'Customer 1 Updated',
    metadata: { displayName: 'metadata-only', note: 'second' },
  });

  assert.equal(first.id, second.id);
  assert.equal(second.displayName, 'Customer 1 Updated');
  assert.equal(second.metadata.displayName, 'metadata-only');
  assert.equal(service.list().length, 1);
  assert.equal(ids, 1);
});

test('rejects blank usernames', async (t) => {
  const store = await readyStore(t);
  const service = createUserService({ store });

  await assert.rejects(
    service.upsert({ username: '   ' }),
    /username/i
  );
});
