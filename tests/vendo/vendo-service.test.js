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
const { createVendoService } = require('../../src/vendo/vendo-service');
const { createSalesService } = require('../../src/sales/sales-service');
const { createTransactionsService } = require('../../src/transactions/transactions-service');

async function rootFor(t) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'ethyl-vendo-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  return root;
}

async function openReady(root) {
  const store = await openSqliteStore({ stateRoot: root });
  await applyMigrations(store);
  return store;
}

async function seedSession(store) {
  const devices = createDeviceService({ store, now: () => 1, createIdFn: () => 'device_1' });
  await devices.upsert({ mac: 'aa:bb:cc:dd:ee:10', name: 'Coin Client' });
  const sessions = createSessionService({ store, now: () => 2, createIdFn: () => 'session_1' });
  return sessions.create({ deviceId: 'device_1' });
}

function vendoFor(store, nowValue = 1000) {
  let n = 0;
  return createVendoService({
    store,
    now: () => nowValue,
    createIdFn: (prefix) => `${prefix}_${++n}`,
  });
}

test('vendo rates persist and preserve configured order', async (t) => {
  const root = await rootFor(t);
  const firstStore = await openReady(root);
  const first = vendoFor(firstStore);
  await first.createRate({ amountMinor: 500, seconds: 300, pulses: 5, sortOrder: 2 });
  await first.createRate({ amountMinor: 100, seconds: 60, pulses: 1, sortOrder: 1 });
  assert.deepEqual(first.listRates().map((r) => r.amountMinor), [100, 500]);
  await firstStore.close();

  const secondStore = await openReady(root);
  t.after(() => secondStore.close());
  const second = vendoFor(secondStore);
  assert.deepEqual(second.listRates().map((r) => r.seconds), [60, 300]);
});

test('validated coin event atomically credits time and writes sale plus transaction', async (t) => {
  const root = await rootFor(t);
  const store = await openReady(root);
  t.after(() => store.close());
  await seedSession(store);
  const vendo = vendoFor(store, 2000);
  await vendo.createRate({ amountMinor: 500, seconds: 300, pulses: 5 });

  const result = await vendo.recordCoin({
    sessionId: 'session_1',
    source: 'coin-node-1',
    eventKey: 'coin-node-1:42',
    pulses: 5,
  });

  assert.equal(result.session.remainingSeconds, 300);
  assert.equal(result.sale.amountMinor, 500);
  assert.equal(result.sale.seconds, 300);
  assert.equal(result.transaction.kind, 'coin_credit');
  assert.equal(result.transaction.secondsDelta, 300);
  assert.equal(store.all('SELECT COUNT(*) AS count FROM coin_events')[0].count, 1);
});

test('duplicate hardware event cannot double-credit', async (t) => {
  const root = await rootFor(t);
  const store = await openReady(root);
  t.after(() => store.close());
  await seedSession(store);
  const vendo = vendoFor(store, 3000);
  await vendo.createRate({ amountMinor: 100, seconds: 60, pulses: 1 });

  const input = {
    sessionId: 'session_1',
    source: 'coin-node-1',
    eventKey: 'coin-node-1:dup',
    pulses: 1,
  };
  const first = await vendo.recordCoin(input);
  const second = await vendo.recordCoin(input);
  assert.equal(first.session.remainingSeconds, 60);
  assert.equal(second.session.remainingSeconds, 60);
  assert.equal(store.all('SELECT COUNT(*) AS count FROM coin_events')[0].count, 1);
  assert.equal(store.all('SELECT COUNT(*) AS count FROM sales')[0].count, 1);
  assert.equal(store.all("SELECT COUNT(*) AS count FROM transactions WHERE kind = 'coin_credit'")[0].count, 1);
});

test('unknown or disabled rate fails without accounting mutation', async (t) => {
  const root = await rootFor(t);
  const store = await openReady(root);
  t.after(() => store.close());
  await seedSession(store);
  const vendo = vendoFor(store, 4000);
  const rate = await vendo.createRate({ amountMinor: 100, seconds: 60, pulses: 1, enabled: false });
  assert.equal(rate.enabled, false);

  await assert.rejects(
    vendo.recordCoin({ sessionId: 'session_1', source: 'coin', eventKey: 'coin:bad', pulses: 1 }),
    /rate/i
  );
  assert.equal(store.all('SELECT COUNT(*) AS count FROM coin_events')[0].count, 0);
  assert.equal(store.all('SELECT remaining_seconds FROM sessions WHERE id = ?', ['session_1'])[0].remaining_seconds, 0);
});

test('sales and transactions expose persisted read-only accounting views', async (t) => {
  const root = await rootFor(t);
  const store = await openReady(root);
  t.after(() => store.close());
  await seedSession(store);
  const vendo = vendoFor(store, 5000);
  await vendo.createRate({ amountMinor: 500, seconds: 300, pulses: 5 });
  await vendo.recordCoin({ sessionId: 'session_1', source: 'coin', eventKey: 'coin:totals', pulses: 5 });

  const sales = createSalesService({ store });
  const transactions = createTransactionsService({ store });
  assert.equal(sales.list().length, 1);
  assert.deepEqual(sales.totals(), { amountMinor: 500, seconds: 300, count: 1 });
  assert.equal(transactions.list().filter((row) => row.kind === 'coin_credit').length, 1);
});
