'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createRouter } = require('../../src/http/router');

const { createProductionApp } = require('../../src/core/app');

function fixture() {
  const calls = [];
  const store = {
    async close() { calls.push('store.close'); },
  };
  const router = {
    register() {},
    routeCount() { return 0; },
  };
  const dhcp = {
    async start() { calls.push('dhcp.start'); },
    async stop() { calls.push('dhcp.stop'); },
    isStarted() { return calls.includes('dhcp.start') && !calls.includes('dhcp.stop'); },
  };
  const http = {
    upstream3000Router: router,
    upstream3001Router: { register() {}, routeCount() { return 0; } },
    async start() { calls.push('http.start'); },
    async stop() { calls.push('http.stop'); },
    isStarted() { return calls.includes('http.start') && !calls.includes('http.stop'); },
    snapshot() { return Object.freeze({ started: this.isStarted() }); },
  };

  const deps = {
    config: { stateRoot: '/mnt/wifi5', logLevel: 'info' },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    openStore: async ({ stateRoot }) => {
      calls.push(`store.open:${stateRoot}`);
      return store;
    },
    migrate: async (target) => {
      assert.equal(target, store);
      calls.push('db.migrate');
    },
    createHttp: () => {
      calls.push('http.create');
      return http;
    },
    createDhcp: ({ devices }) => {
      assert.ok(devices);
      calls.push('dhcp.create');
      return dhcp;
    },
    createServices: ({ store: target }) => {
      assert.equal(target, store);
      calls.push('services.create');
      return Object.freeze({ ready: true, devices: Object.freeze({ upsert() {} }) });
    },
    registerApi: (targetRouter, services) => {
      assert.equal(targetRouter, router);
      assert.equal(services.ready, true);
      calls.push('api.register');
      return Object.freeze({ routeCount: 1 });
    },
  };

  return { calls, store, http, dhcp, deps };
}

test('production startup initializes SQLite and API before local listeners', async () => {
  const { calls, deps } = fixture();
  const app = createProductionApp(deps);
  await app.start();

  assert.deepEqual(calls, [
    'store.open:/mnt/wifi5',
    'db.migrate',
    'services.create',
    'http.create',
    'api.register',
    'dhcp.create',
    'dhcp.start',
    'http.start',
  ]);
  assert.equal(app.isStarted(), true);
  assert.equal(app.health().wanRequired, false);
  assert.equal(app.health().database, 'sqlite');
});

test('production startup does not require provider connectivity or license state', async () => {
  const { deps } = fixture();
  const app = createProductionApp({
    ...deps,
    providerAdapters: {},
  });
  await app.start();
  assert.equal(app.isStarted(), true);
  assert.equal(app.health().legacyCoreAllowed, false);
  await app.stop();
});

test('graceful shutdown stops HTTP before closing persistent SQLite store', async () => {
  const { calls, deps } = fixture();
  const app = createProductionApp(deps);
  await app.start();
  calls.length = 0;
  await app.stop();
  assert.deepEqual(calls, ['http.stop', 'dhcp.stop', 'store.close']);
  assert.equal(app.isStarted(), false);
});

test('failed HTTP startup closes the opened store and remains stopped', async () => {
  const { calls, deps, store } = fixture();
  const app = createProductionApp({
    ...deps,
    createHttp: () => ({
      upstream3000Router: { register() {}, routeCount() { return 0; } },
      upstream3001Router: { register() {}, routeCount() { return 0; } },
      async start() { calls.push('http.start'); throw new Error('bind failed'); },
      async stop() { calls.push('http.stop'); },
    }),
    registerApi: () => { calls.push('api.register'); return Object.freeze({ routeCount: 1 }); },
  });

  await assert.rejects(app.start(), /bind failed/);
  assert.equal(app.isStarted(), false);
  assert.ok(calls.includes('store.close'));
  assert.equal(typeof store.close, 'function');
});


test('default production composition includes rental and reseller local services', async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'ethyl-compose-real-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const http = {
    upstream3000Router: createRouter(),
    upstream3001Router: createRouter(),
    async start() {},
    async stop() {},
    snapshot() { return Object.freeze({ started: true }); },
  };
  const app = createProductionApp({
    config: { stateRoot: root, logLevel: 'info' },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    createHttp: () => http,
  });
  await app.start();
  t.after(() => app.stop());
  const services = app.services();
  assert.equal(typeof services.rental.register, 'function');
  assert.equal(typeof services.resellers.create, 'function');
});
