'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { openSqliteStore } = require('../../src/db/sqlite-store');
const { applyMigrations } = require('../../src/db/migrations');
const { createDeviceService } = require('../../src/devices/device-service');
const { createSessionService } = require('../../src/session/session-service');

async function readyRoot(t) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'ethyl-session-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  return root;
}

async function openReady(root) {
  const store = await openSqliteStore({ stateRoot: root });
  await applyMigrations(store);
  return store;
}

async function seedDevice(store) {
  const devices = createDeviceService({
    store,
    now: () => 1,
    createIdFn: () => 'device_1',
  });

  await devices.upsert({ mac: 'aa:bb:cc:dd:ee:01', name: 'Client' });
}

test('session time changes only through explicit add and consume events', async (t) => {
  const root = await readyRoot(t);
  const store = await openReady(root);
  t.after(() => store.close());
  await seedDevice(store);

  let idCounter = 0;
  const service = createSessionService({
    store,
    now: () => 1000,
    createIdFn(prefix) {
      idCounter += 1;
      return `${prefix}_${idCounter}`;
    },
  });

  const created = await service.create({ deviceId: 'device_1' });
  assert.equal(created.remainingSeconds, 0);
  assert.equal(created.state, 'active');

  const credited = await service.addTime({
    sessionId: created.id,
    seconds: 120,
    idempotencyKey: 'manual:add:1',
  });
  assert.equal(credited.remainingSeconds, 120);

  const consumed = await service.consumeTime({
    sessionId: created.id,
    seconds: 30,
    idempotencyKey: 'timer:tick:1',
  });
  assert.equal(consumed.remainingSeconds, 90);
  assert.equal(consumed.state, 'active');

  assert.deepEqual(
    store.all(
      'SELECT seconds_delta FROM transactions WHERE session_id = ? ORDER BY created_at, id',
      [created.id]
    ).map((row) => row.seconds_delta),
    [120, -30]
  );
});

test('duplicate idempotency key cannot double-credit session time', async (t) => {
  const root = await readyRoot(t);
  const store = await openReady(root);
  t.after(() => store.close());
  await seedDevice(store);

  let n = 0;
  const service = createSessionService({
    store,
    now: () => 2000,
    createIdFn: (prefix) => `${prefix}_${++n}`,
  });

  const session = await service.create({ deviceId: 'device_1' });

  const first = await service.addTime({
    sessionId: session.id,
    seconds: 60,
    idempotencyKey: 'coin:event:42',
  });
  const second = await service.addTime({
    sessionId: session.id,
    seconds: 60,
    idempotencyKey: 'coin:event:42',
  });

  assert.equal(first.remainingSeconds, 60);
  assert.equal(second.remainingSeconds, 60);
  assert.equal(
    store.all('SELECT COUNT(*) AS count FROM transactions')[0].count,
    1
  );
});

test('consuming all remaining time marks the session exhausted', async (t) => {
  const root = await readyRoot(t);
  const store = await openReady(root);
  t.after(() => store.close());
  await seedDevice(store);

  let n = 0;
  const service = createSessionService({
    store,
    now: () => 3000,
    createIdFn: (prefix) => `${prefix}_${++n}`,
  });

  const session = await service.create({ deviceId: 'device_1', initialSeconds: 10 });
  const result = await service.consumeTime({
    sessionId: session.id,
    seconds: 10,
    idempotencyKey: 'timer:final',
  });

  assert.equal(result.remainingSeconds, 0);
  assert.equal(result.state, 'exhausted');

  await assert.rejects(
    service.consumeTime({
      sessionId: session.id,
      seconds: 1,
      idempotencyKey: 'timer:too-much',
    }),
    /remaining|insufficient|exhausted/i
  );
});

test('session and credited time survive database restart exactly', async (t) => {
  const root = await readyRoot(t);
  const firstStore = await openReady(root);
  await seedDevice(firstStore);

  let n = 0;
  const first = createSessionService({
    store: firstStore,
    now: () => 4000,
    createIdFn: (prefix) => `${prefix}_${++n}`,
  });

  const session = await first.create({ deviceId: 'device_1' });
  await first.addTime({
    sessionId: session.id,
    seconds: 600,
    idempotencyKey: 'voucher:restart-test',
  });
  await firstStore.close();

  const secondStore = await openReady(root);
  t.after(() => secondStore.close());
  const second = createSessionService({ store: secondStore });

  const reopened = second.get(session.id);
  assert.equal(reopened.remainingSeconds, 600);
  assert.equal(reopened.state, 'active');
});
