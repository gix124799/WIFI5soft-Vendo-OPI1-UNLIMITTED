'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createProductionApp } = require('../../../src/core/app');
const { createRouter } = require('../../../src/http/router');
const { getUiContract } = require('../../../src/ui/ui-contract');

const root = path.resolve(__dirname, '..', '..', '..');

function logger() {
  return { debug() {}, info() {}, warn() {}, error() {} };
}

function createLocalHttpLayer() {
  const upstream3000Router = createRouter();
  const upstream3001Router = createRouter();
  let started = false;
  return Object.freeze({
    upstream3000Router,
    upstream3001Router,
    async start() { started = true; },
    async stop() { started = false; },
    isStarted() { return started; },
    snapshot() {
      return Object.freeze({
        started,
        upstream3000: Object.freeze({ started }),
        upstream3001: Object.freeze({ started }),
      });
    },
  });
}

function createNoopDhcp() {
  let started = false;
  return Object.freeze({
    async start() { started = true; },
    async stop() { started = false; },
    isStarted() { return started; },
  });
}

function createNoopPppoeHttp() {
  let started = false;
  return Object.freeze({
    async start() { started = true; },
    async stop() { started = false; },
    isStarted() { return started; },
  });
}

function buildApp(stateRoot) {
  const http = createLocalHttpLayer();
  const app = createProductionApp({
    config: { stateRoot, logLevel: 'info', openwrt: false },
    logger: logger(),
    createHttp: () => http,
    createDhcp: () => createNoopDhcp(),
    createPppoeHttp: () => createNoopPppoeHttp(),
    pppoeAdapter: {
      async upsertAccount() {},
      async removeAccount() {},
    },
    providerAdapters: {
      eload: { async execute() { throw new Error('WAN unavailable'); } },
      epay: { async execute() { throw new Error('WAN unavailable'); } },
    },
  });
  return { app, http };
}

async function request(router, method, url) {
  const response = {
    statusCode: 0,
    headers: {},
    body: '',
    ended: false,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    end(chunk = '') { this.body += String(chunk); this.ended = true; },
  };
  await router.handle({ method, url }, response);
  return response;
}

test('portal/admin local stack survives provider outage and SQLite restart', async (t) => {
  const stateRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'ethyl-local-smoke-'));
  t.after(() => fsp.rm(stateRoot, { recursive: true, force: true }));

  const portalHtml = fs.readFileSync(path.join(root, 'src', 'ui', 'portal', 'index.html'), 'utf8');
  const adminHtml = fs.readFileSync(path.join(root, 'src', 'ui', 'admin', 'index.html'), 'utf8');
  const ui = getUiContract();
  assert.ok(ui.routes.includes('/'));
  assert.ok(ui.routes.includes('/admin'));
  assert.equal(ui.dashboardEntry, '/admin?page=dashboard');
  assert.match(portalHtml, /ETHYLNET/);
  assert.match(adminHtml, /Dashboard/);

  const first = buildApp(stateRoot);
  await first.app.start();
  assert.deepEqual(
    {
      started: first.app.isStarted(),
      local: first.app.health().local,
      wanRequired: first.app.health().wanRequired,
      database: first.app.health().database,
    },
    { started: true, local: true, wanRequired: false, database: 'sqlite' }
  );

  const health = await request(first.http.upstream3000Router, 'GET', '/api/v1/health');
  assert.equal(health.statusCode, 200);
  assert.deepEqual(JSON.parse(health.body), {
    status: 'ok', local: true, wanRequired: false, database: 'sqlite',
  });

  const services = first.app.services();
  await services.settings.set('portal.businessName', 'ETHYLNET Smoke');
  const device = await services.devices.upsert({ mac: 'aa:bb:cc:dd:ee:90', name: 'Smoke Client' });
  const session = await services.sessions.create({ deviceId: device.id });
  await services.vouchers.create({ code: 'SMOKE-VOUCHER', creditSeconds: 120, priceMinor: 100 });
  const redeemed = await services.vouchers.redeem({
    code: 'SMOKE-VOUCHER',
    sessionId: session.id,
    idempotencyKey: 'smoke:voucher:1',
  });
  assert.equal(redeemed.voucher.status, 'redeemed');

  await services.vendo.createRate({ amountMinor: 100, seconds: 60, pulses: 1, sortOrder: 1 });
  const coin = await services.vendo.recordCoin({
    sessionId: session.id,
    source: 'smoke-coin',
    eventKey: 'smoke-coin:1',
    pulses: 1,
  });
  assert.equal(coin.sale.amountMinor, 100);
  assert.equal(services.sales.list().length, 1);
  assert.ok(services.transactions.list().length >= 2);

  const pppoe = await services.pppoe.create({ username: 'smoke-pppoe', secret: 'pw', profile: 'basic' });
  assert.equal(pppoe.username, 'smoke-pppoe');
  const rental = await services.rental.register({ name: 'Smoke Phone', deviceKey: 'smoke-phone' });
  assert.equal(rental.deviceKey, 'smoke-phone');
  const reseller = await services.resellers.create({ username: 'smoke-dealer', displayName: 'Smoke Dealer' });
  assert.equal(reseller.username, 'smoke-dealer');

  const provider = await services.providers.execute({
    provider: 'eload',
    operation: 'balance',
    idempotencyKey: 'smoke:provider:1',
    request: {},
  });
  assert.equal(provider.status, 'failed');
  assert.match(provider.response.error, /WAN unavailable/);
  assert.equal(first.app.isStarted(), true);

  await first.app.stop();

  const second = buildApp(stateRoot);
  await second.app.start();
  t.after(() => second.app.stop());
  const reopened = second.app.services();

  assert.equal(reopened.settings.get('portal.businessName'), 'ETHYLNET Smoke');
  assert.equal(reopened.vouchers.list().find((row) => row.code === 'SMOKE-VOUCHER').status, 'redeemed');
  assert.ok(reopened.sessions.list().some((row) => row.id === session.id));
  assert.equal(reopened.vendo.listRates().length, 1);
  assert.equal(reopened.sales.list().length, 1);
  assert.ok(reopened.transactions.list().length >= 2);
  assert.equal(reopened.pppoe.list()[0].username, 'smoke-pppoe');
  assert.equal(reopened.rental.list()[0].deviceKey, 'smoke-phone');
  assert.equal(reopened.resellers.list()[0].username, 'smoke-dealer');
  assert.equal(reopened.providers.list()[0].status, 'failed');

  const healthAfterRestart = await request(second.http.upstream3000Router, 'GET', '/api/v1/health');
  assert.equal(healthAfterRestart.statusCode, 200);
  assert.equal(JSON.parse(healthAfterRestart.body).wanRequired, false);
});
