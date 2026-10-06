'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { openSqliteStore } = require('../../src/db/sqlite-store');
const { applyMigrations } = require('../../src/db/migrations');
const { createRentalService } = require('../../src/rental/rental-service');

async function ready(t) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'ethyl-rental-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const store = await openSqliteStore({ stateRoot: root });
  await applyMigrations(store);
  t.after(() => store.close());
  return store;
}
function serviceFor(store, adapter = {}) {
  let n = 0;
  return createRentalService({ store, now: () => 1000, createIdFn: p => `${p}_${++n}`, adapter });
}

test('registers rental/sub-vendo device locally and persists across restart', async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'ethyl-rental-persist-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  let store = await openSqliteStore({ stateRoot: root });
  await applyMigrations(store);
  let service = serviceFor(store);
  const created = await service.register({ name: 'Phone 1', deviceKey: 'phone-001', metadata: { room: 'A' } });
  assert.equal(created.state, 'offline');
  await store.close();
  store = await openSqliteStore({ stateRoot: root });
  await applyMigrations(store);
  t.after(() => store.close());
  service = serviceFor(store);
  assert.equal(service.list()[0].deviceKey, 'phone-001');
  assert.equal(service.list()[0].metadata.room, 'A');
});

test('updates device state through local adapter and rolls back on adapter failure', async (t) => {
  const store = await ready(t);
  const calls = [];
  const service = serviceFor(store, { async applyState(device) { calls.push([device.deviceKey, device.state]); } });
  const created = await service.register({ name: 'Unit 1', deviceKey: 'u1' });
  const updated = await service.setState(created.id, 'online');
  assert.equal(updated.state, 'online');
  assert.deepEqual(calls, [['u1', 'online']]);

  const failing = serviceFor(store, { async applyState() { throw new Error('adapter failed'); } });
  await assert.rejects(failing.setState(created.id, 'active'), /adapter failed/);
  assert.equal(service.get(created.id).state, 'online');
});

test('rejects invalid rental states instead of fabricating device control', async (t) => {
  const store = await ready(t);
  const service = serviceFor(store);
  const created = await service.register({ name: 'Unit 2', deviceKey: 'u2' });
  await assert.rejects(service.setState(created.id, 'unlimited'), /state/i);
});
