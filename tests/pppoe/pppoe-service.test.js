'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { openSqliteStore } = require('../../src/db/sqlite-store');
const { applyMigrations } = require('../../src/db/migrations');
const {
  createPppoeService,
  PPPoE_LOCAL_BACKEND,
} = require('../../src/pppoe/pppoe-service');

async function rootFor(t) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'ethyl-pppoe-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  return root;
}

async function openReady(root) {
  const store = await openSqliteStore({ stateRoot: root });
  await applyMigrations(store);
  return store;
}

function serviceFor(store, adapter = {}) {
  let n = 0;
  return createPppoeService({
    store,
    now: () => 1000,
    createIdFn: (prefix) => `${prefix}_${++n}`,
    adapter,
  });
}

test('preserves verified local PPPoE backend boundary and requires no WAN', () => {
  assert.deepEqual(PPPoE_LOCAL_BACKEND, {
    host: '127.0.0.1',
    port: 3002,
    wanRequired: false,
  });
  assert.equal(Object.isFrozen(PPPoE_LOCAL_BACKEND), true);
});

test('creates and lists PPPoE accounts without exposing secrets', async (t) => {
  const root = await rootFor(t);
  const store = await openReady(root);
  t.after(() => store.close());
  const applied = [];
  const service = serviceFor(store, {
    async upsertAccount(account) {
      applied.push(account);
    },
  });

  const created = await service.create({
    username: 'client1',
    secret: 'super-secret',
    profile: 'basic',
  });

  assert.equal(created.username, 'client1');
  assert.equal('secret' in created, false);
  assert.equal(service.list()[0].secret, undefined);
  assert.equal(applied[0].secret, 'super-secret');
  assert.equal(
    store.all('SELECT secret FROM pppoe_accounts WHERE username = ?', ['client1'])[0].secret,
    'super-secret'
  );
});

test('updates and deletes accounts through injectable local adapter', async (t) => {
  const root = await rootFor(t);
  const store = await openReady(root);
  t.after(() => store.close());
  const calls = [];
  const service = serviceFor(store, {
    async upsertAccount(account) {
      calls.push(['upsert', account.username, account.profile]);
    },
    async removeAccount(account) {
      calls.push(['remove', account.username]);
    },
  });

  const created = await service.create({ username: 'client2', secret: 'pw', profile: 'basic' });
  const updated = await service.update(created.id, { profile: 'premium', enabled: false });
  assert.equal(updated.profile, 'premium');
  assert.equal(updated.enabled, false);
  await service.remove(created.id);
  assert.equal(service.list().length, 0);
  assert.deepEqual(calls, [
    ['upsert', 'client2', 'basic'],
    ['upsert', 'client2', 'premium'],
    ['remove', 'client2'],
  ]);
});

test('adapter failure rolls back database mutation', async (t) => {
  const root = await rootFor(t);
  const store = await openReady(root);
  t.after(() => store.close());
  const service = serviceFor(store, {
    async upsertAccount() {
      throw new Error('local pppoe apply failed');
    },
  });

  await assert.rejects(
    service.create({ username: 'broken', secret: 'pw' }),
    /apply failed/i
  );
  assert.equal(store.all('SELECT COUNT(*) AS count FROM pppoe_accounts')[0].count, 0);
});

test('PPPoE accounts survive database restart', async (t) => {
  const root = await rootFor(t);
  const firstStore = await openReady(root);
  const first = serviceFor(firstStore);
  await first.create({ username: 'persisted', secret: 'pw', profile: 'basic' });
  await firstStore.close();

  const secondStore = await openReady(root);
  t.after(() => secondStore.close());
  const second = serviceFor(secondStore);
  assert.equal(second.list().length, 1);
  assert.equal(second.list()[0].username, 'persisted');
  assert.equal('secret' in second.list()[0], false);
});
