'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');

const { openSqliteStore } = require('../../src/db/sqlite-store');
const { applyMigrations } = require('../../src/db/migrations');
const { createRouter } = require('../../src/http/router');
const { createSettingsService } = require('../../src/settings/settings-service');
const { createDeviceService } = require('../../src/devices/device-service');
const { createUserService } = require('../../src/users/user-service');
const { createSessionService } = require('../../src/session/session-service');
const { createVoucherService } = require('../../src/voucher/voucher-service');
const { createVendoService } = require('../../src/vendo/vendo-service');
const { createSalesService } = require('../../src/sales/sales-service');
const { createTransactionsService } = require('../../src/transactions/transactions-service');
const { createPppoeService } = require('../../src/pppoe/pppoe-service');
const { createProviderOperationService } = require('../../src/providers/provider-operation-service');
const { createRentalService } = require('../../src/rental/rental-service');
const { createResellerService } = require('../../src/reseller/reseller-service');
const { registerLocalApi, LOCAL_API_ALIASES } = require('../../src/api/register-local-api');

async function rootFor(t) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'ethyl-api-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  return root;
}

async function createFixture(t) {
  const root = await rootFor(t);
  const store = await openSqliteStore({ stateRoot: root });
  await applyMigrations(store);
  t.after(() => store.close());

  let n = 0;
  const ids = (prefix) => `${prefix}_${++n}`;
  const services = {
    settings: createSettingsService({ store, now: () => 1000 }),
    devices: createDeviceService({ store, now: () => 1000, createIdFn: ids }),
    users: createUserService({ store, now: () => 1000, createIdFn: ids }),
    sessions: createSessionService({ store, now: () => 1000, createIdFn: ids }),
    vouchers: createVoucherService({ store, now: () => 1000, createIdFn: ids }),
    vendo: createVendoService({ store, now: () => 1000, createIdFn: ids }),
    sales: createSalesService({ store }),
    transactions: createTransactionsService({ store }),
    pppoe: createPppoeService({ store, now: () => 1000, createIdFn: ids }),
    providers: createProviderOperationService({ store, now: () => 1000, createIdFn: ids }),
    rental: createRentalService({ store, now: () => 1000, createIdFn: ids }),
    resellers: createResellerService({ store, now: () => 1000, createIdFn: ids }),
  };
  const router = createRouter();
  registerLocalApi(router, services);
  return { root, store, services, router };
}

function makeRequest(method, url, body) {
  const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const req = Readable.from(payload);
  req.method = method;
  req.url = url;
  req.headers = body === undefined
    ? {}
    : { 'content-type': 'application/json' };
  return req;
}

function makeResponse() {
  return {
    statusCode: 200,
    headers: {},
    ended: false,
    body: '',
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    end(value = '') {
      this.body += value;
      this.ended = true;
    },
  };
}

async function dispatch(router, method, url, body) {
  const response = makeResponse();
  await router.handle(makeRequest(method, url, body), response);
  return {
    statusCode: response.statusCode,
    headers: response.headers,
    json: response.body ? JSON.parse(response.body) : null,
  };
}

test('declares explicit ETHYLNET compatibility aliases', () => {
  assert.deepEqual(LOCAL_API_ALIASES, {
    '/a_1': 'GET /api/v1/health',
    '/a_2': 'GET /api/v1/vendo/rates',
    '/c_2': 'POST /api/v1/vouchers/redeem',
    '/c_3': 'POST /api/v1/vendo/coin-events',
  });
  assert.equal(Object.isFrozen(LOCAL_API_ALIASES), true);
});

test('health and alias operate fully locally', async (t) => {
  const { router } = await createFixture(t);
  const canonical = await dispatch(router, 'GET', '/api/v1/health');
  const alias = await dispatch(router, 'GET', '/a_1');
  assert.equal(canonical.statusCode, 200);
  assert.deepEqual(alias.json, canonical.json);
  assert.equal(canonical.json.local, true);
  assert.equal(canonical.json.wanRequired, false);
});

test('settings mutation persists before success and is readable offline', async (t) => {
  const { router, store } = await createFixture(t);
  const saved = await dispatch(router, 'POST', '/api/v1/settings', {
    key: 'business.name',
    value: 'ETHYLNET',
  });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.json.ok, true);
  assert.equal(
    JSON.parse(store.all('SELECT value_json FROM settings WHERE key = ?', ['business.name'])[0].value_json),
    'ETHYLNET'
  );
  const listed = await dispatch(router, 'GET', '/api/v1/settings');
  assert.equal(listed.json.data[0].key, 'business.name');
});

test('PPPoE list endpoint never returns account secret', async (t) => {
  const { router, services } = await createFixture(t);
  await services.pppoe.create({ username: 'api-client', secret: 'never-return-this' });
  const result = await dispatch(router, 'GET', '/api/v1/pppoe/accounts');
  assert.equal(result.statusCode, 200);
  assert.equal(result.json.data[0].username, 'api-client');
  assert.equal('secret' in result.json.data[0], false);
  assert.doesNotMatch(JSON.stringify(result.json), /never-return-this/);
});

test('voucher redeem alias and coin alias perform real local mutations', async (t) => {
  const { router, services } = await createFixture(t);
  const device = await services.devices.upsert({ mac: 'aa:bb:cc:dd:ee:11' });
  const session = await services.sessions.create({ deviceId: device.id });
  await services.vouchers.create({ code: 'API-VOUCHER', creditSeconds: 120 });

  const redeemed = await dispatch(router, 'POST', '/c_2', {
    code: 'API-VOUCHER',
    sessionId: session.id,
    idempotencyKey: 'api:voucher:1',
  });
  assert.equal(redeemed.statusCode, 200);
  assert.equal(redeemed.json.data.session.remainingSeconds, 120);

  await services.vendo.createRate({ amountMinor: 100, seconds: 60, pulses: 1 });
  const coin = await dispatch(router, 'POST', '/c_3', {
    sessionId: session.id,
    source: 'api-test',
    eventKey: 'api-test:1',
    pulses: 1,
  });
  assert.equal(coin.statusCode, 200);
  assert.equal(coin.json.data.session.remainingSeconds, 180);
});

test('unknown route stays a controlled 404', async (t) => {
  const { router } = await createFixture(t);
  const result = await dispatch(router, 'GET', '/api/v1/not-real');
  assert.equal(result.statusCode, 404);
  assert.equal(result.json, null);
});


test('rental and reseller endpoints are real local SQLite mutations', async (t) => {
  const { router } = await createFixture(t);
  const rental = await dispatch(router, 'POST', '/api/v1/rental/devices', {
    name: 'Phone 1',
    deviceKey: 'phone-api-1',
  });
  assert.equal(rental.statusCode, 200);
  assert.equal(rental.json.data.state, 'offline');

  const state = await dispatch(router, 'POST', '/api/v1/rental/devices/state', {
    id: rental.json.data.id,
    state: 'online',
  });
  assert.equal(state.json.data.state, 'online');

  const reseller = await dispatch(router, 'POST', '/api/v1/resellers', {
    username: 'dealer-api',
    displayName: 'Dealer API',
  });
  assert.equal(reseller.statusCode, 200);
  const resellers = await dispatch(router, 'GET', '/api/v1/resellers');
  assert.equal(resellers.json.data[0].username, 'dealer-api');
});
