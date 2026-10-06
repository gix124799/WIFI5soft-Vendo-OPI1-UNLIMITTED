'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { openSqliteStore } = require('../../src/db/sqlite-store');
const { applyMigrations } = require('../../src/db/migrations');
const { createResellerService } = require('../../src/reseller/reseller-service');

async function ready(t) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'ethyl-reseller-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const store = await openSqliteStore({ stateRoot: root });
  await applyMigrations(store);
  t.after(() => store.close());
  return store;
}
function serviceFor(store) {
  let n = 0;
  return createResellerService({ store, now: () => 1000, createIdFn: p => `${p}_${++n}` });
}

test('creates and updates persistent reseller state without raw billing-file access', async (t) => {
  const store = await ready(t);
  const service = serviceFor(store);
  const created = await service.create({ username: 'dealer1', displayName: 'Dealer One', metadata: { zone: 'north' } });
  assert.equal(created.enabled, true);
  const updated = await service.update(created.id, { displayName: 'Dealer 1', enabled: false });
  assert.equal(updated.displayName, 'Dealer 1');
  assert.equal(updated.enabled, false);
  assert.equal(service.list().length, 1);
});

test('reseller identity survives SQLite restart', async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'ethyl-reseller-persist-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  let store = await openSqliteStore({ stateRoot: root });
  await applyMigrations(store);
  let service = serviceFor(store);
  await service.create({ username: 'persisted' });
  await store.close();
  store = await openSqliteStore({ stateRoot: root });
  await applyMigrations(store);
  t.after(() => store.close());
  service = serviceFor(store);
  assert.equal(service.list()[0].username, 'persisted');
});

test('rejects duplicate reseller usernames', async (t) => {
  const store = await ready(t);
  const service = serviceFor(store);
  await service.create({ username: 'same' });
  await assert.rejects(service.create({ username: 'same' }), /unique|already/i);
});
