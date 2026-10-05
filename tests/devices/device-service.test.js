'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { openSqliteStore } = require('../../src/db/sqlite-store');
const { applyMigrations } = require('../../src/db/migrations');
const { createDeviceService } = require('../../src/devices/device-service');

async function readyStore(t) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'ethyl-device-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const store = await openSqliteStore({ stateRoot: root });
  await applyMigrations(store);
  t.after(() => store.close());
  return { root, store };
}

test('upserting the same MAC keeps one stable device identity', async (t) => {
  const { store } = await readyStore(t);
  let ids = 0;
  const service = createDeviceService({
    store,
    now: () => 1000,
    createIdFn() {
      ids += 1;
      return `device_test_${ids}`;
    },
  });

  const first = await service.upsert({
    mac: 'AA:BB:CC:DD:EE:FF',
    name: 'Phone A',
    metadata: { os: 'android' },
  });

  const second = await service.upsert({
    mac: 'aa:bb:cc:dd:ee:ff',
    name: 'Phone B',
    metadata: { name: 'must-not-overwrite-core', os: 'android-2' },
  });

  assert.equal(first.id, second.id);
  assert.equal(second.name, 'Phone B');
  assert.equal(second.metadata.name, 'must-not-overwrite-core');
  assert.equal(service.list().length, 1);
  assert.equal(ids, 1);
});

test('device records survive reopening the database', async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'ethyl-device-reopen-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));

  const firstStore = await openSqliteStore({ stateRoot: root });
  await applyMigrations(firstStore);
  const first = createDeviceService({
    store: firstStore,
    now: () => 1,
    createIdFn: () => 'device_fixed',
  });

  await first.upsert({ mac: '00:11:22:33:44:55', name: 'Router Client' });
  await firstStore.close();

  const secondStore = await openSqliteStore({ stateRoot: root });
  await applyMigrations(secondStore);
  t.after(() => secondStore.close());
  const second = createDeviceService({ store: secondStore });

  assert.equal(second.get('device_fixed').name, 'Router Client');
});
