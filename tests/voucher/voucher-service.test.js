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
const { createVoucherService } = require('../../src/voucher/voucher-service');

async function readyRoot(t) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'ethyl-voucher-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  return root;
}

async function openReady(root) {
  const store = await openSqliteStore({ stateRoot: root });
  await applyMigrations(store);
  return store;
}

async function seedSession(store) {
  const devices = createDeviceService({
    store,
    now: () => 1,
    createIdFn: () => 'device_1',
  });
  await devices.upsert({ mac: 'aa:bb:cc:dd:ee:09', name: 'Voucher Client' });
  const sessions = createSessionService({
    store,
    now: () => 2,
    createIdFn: () => 'session_1',
  });
  return sessions.create({ deviceId: 'device_1' });
}

function serviceFor(store, nowValue = 1000) {
  let n = 0;
  return createVoucherService({
    store,
    now: () => nowValue,
    createIdFn: (prefix) => `${prefix}_${++n}`,
  });
}

test('creates lists and gets vouchers with unique codes', async (t) => {
  const root = await readyRoot(t);
  const store = await openReady(root);
  t.after(() => store.close());
  const vouchers = serviceFor(store);

  const created = await vouchers.create({
    code: 'ETHYL-001',
    creditSeconds: 600,
    priceMinor: 500,
  });
  assert.equal(created.code, 'ETHYL-001');
  assert.equal(created.status, 'active');
  assert.equal(vouchers.getByCode('ETHYL-001').creditSeconds, 600);
  assert.equal(vouchers.list().length, 1);

  await assert.rejects(
    vouchers.create({ code: 'ETHYL-001', creditSeconds: 60 }),
    /unique|code|constraint/i
  );
});

test('redeem atomically credits session and writes redemption plus transaction', async (t) => {
  const root = await readyRoot(t);
  const store = await openReady(root);
  t.after(() => store.close());
  await seedSession(store);
  const vouchers = serviceFor(store, 2000);
  await vouchers.create({
    code: 'ETHYL-RED',
    creditSeconds: 300,
    priceMinor: 500,
  });

  const result = await vouchers.redeem({
    code: 'ETHYL-RED',
    sessionId: 'session_1',
    idempotencyKey: 'voucher:red:1',
  });
  assert.equal(result.voucher.status, 'redeemed');
  assert.equal(result.session.remainingSeconds, 300);
  assert.equal(
    store.all('SELECT COUNT(*) AS count FROM voucher_redemptions')[0].count,
    1
  );
  const tx = store.all(
    'SELECT kind, amount_minor, seconds_delta FROM transactions WHERE reference = ?',
    ['voucher:red:1']
  )[0];
  assert.deepEqual(tx, {
    kind: 'voucher_redemption',
    amount_minor: 500,
    seconds_delta: 300,
  });
});

test('duplicate redemption idempotency key cannot double-credit', async (t) => {
  const root = await readyRoot(t);
  const store = await openReady(root);
  t.after(() => store.close());
  await seedSession(store);
  const vouchers = serviceFor(store, 3000);
  await vouchers.create({ code: 'ETHYL-IDEM', creditSeconds: 120 });

  const first = await vouchers.redeem({
    code: 'ETHYL-IDEM',
    sessionId: 'session_1',
    idempotencyKey: 'voucher:idem:1',
  });
  const second = await vouchers.redeem({
    code: 'ETHYL-IDEM',
    sessionId: 'session_1',
    idempotencyKey: 'voucher:idem:1',
  });
  assert.equal(first.session.remainingSeconds, 120);
  assert.equal(second.session.remainingSeconds, 120);
  assert.equal(
    store.all('SELECT COUNT(*) AS count FROM voucher_redemptions')[0].count,
    1
  );
});

test('expired voucher cannot redeem and does not change session time', async (t) => {
  const root = await readyRoot(t);
  const store = await openReady(root);
  t.after(() => store.close());
  await seedSession(store);
  const vouchers = serviceFor(store, 5000);
  await vouchers.create({
    code: 'ETHYL-OLD',
    creditSeconds: 60,
    validUntil: 4999,
  });

  await assert.rejects(
    vouchers.redeem({
      code: 'ETHYL-OLD',
      sessionId: 'session_1',
      idempotencyKey: 'voucher:old:1',
    }),
    /expired/i
  );
  assert.equal(
    store.all('SELECT remaining_seconds FROM sessions WHERE id = ?', ['session_1'])[0].remaining_seconds,
    0
  );
  assert.equal(
    store.all('SELECT COUNT(*) AS count FROM voucher_redemptions')[0].count,
    0
  );
});

test('voucher state and redemption survive restart', async (t) => {
  const root = await readyRoot(t);
  const firstStore = await openReady(root);
  await seedSession(firstStore);
  const first = serviceFor(firstStore, 6000);
  await first.create({ code: 'ETHYL-RESTART', creditSeconds: 90 });
  await first.redeem({
    code: 'ETHYL-RESTART',
    sessionId: 'session_1',
    idempotencyKey: 'voucher:restart:1',
  });
  await firstStore.close();

  const secondStore = await openReady(root);
  t.after(() => secondStore.close());
  const second = serviceFor(secondStore, 7000);
  assert.equal(second.getByCode('ETHYL-RESTART').status, 'redeemed');
  assert.equal(
    secondStore.all('SELECT remaining_seconds FROM sessions WHERE id = ?', ['session_1'])[0].remaining_seconds,
    90
  );
  assert.equal(
    secondStore.all('SELECT COUNT(*) AS count FROM voucher_redemptions')[0].count,
    1
  );
});
