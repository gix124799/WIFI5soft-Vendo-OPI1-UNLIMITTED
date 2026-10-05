'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

const appPath = path.join(
  root,
  'src',
  'core',
  'app.js'
);

const registryPath = path.join(
  root,
  'src',
  'core',
  'subsystem-registry.js'
);

const binPath = path.join(
  root,
  'bin',
  'ethyl-core.js'
);

function loadApp() {
  assert.ok(
    fs.existsSync(appPath),
    'src/core/app.js must exist'
  );

  delete require.cache[require.resolve(appPath)];
  return require(appPath);
}

function makeDependencies() {
  const {
    createSubsystemRegistry
  } = require(registryPath);

  const inner = createSubsystemRegistry([
    'core',
    'storage'
  ]);

  const transitions = [];

  const registry = Object.freeze({
    get(name) {
      return inner.get(name);
    },

    set(name, state) {
      transitions.push([name, state]);
      inner.set(name, state);
    },

    snapshot() {
      return inner.snapshot();
    },

    overall() {
      return inner.overall();
    }
  });

  const logger = Object.freeze({
    debug() {},
    info() {},
    warn() {},
    error() {}
  });

  const store = Object.freeze({
    async readUtf8() {
      throw new Error(
        'foundation startup must not read state files'
      );
    },

    async writeUtf8() {
      throw new Error(
        'foundation startup must not write state files'
      );
    }
  });

  const config = Object.freeze({
    stateRoot: '/tmp/ethyl-foundation-test',
    logLevel: 'info'
  });

  return {
    config,
    logger,
    registry,
    store,
    transitions
  };
}

test('fresh application is stopped with both subsystems disabled', () => {
  const { createApp } = loadApp();
  const deps = makeDependencies();

  const app = createApp(deps);

  assert.equal(app.isStarted(), false);

  assert.deepEqual(app.health(), {
    overall: 'DISABLED',
    subsystems: {
      core: 'DISABLED',
      storage: 'DISABLED'
    }
  });
});

test('start marks storage then core READY without state-file access', async () => {
  const { createApp } = loadApp();
  const deps = makeDependencies();

  const app = createApp(deps);

  await app.start();

  assert.equal(app.isStarted(), true);

  assert.deepEqual(
    deps.transitions,
    [
      ['storage', 'READY'],
      ['core', 'READY']
    ]
  );

  assert.deepEqual(app.health(), {
    overall: 'READY',
    subsystems: {
      core: 'READY',
      storage: 'READY'
    }
  });
});

test('start is idempotent', async () => {
  const { createApp } = loadApp();
  const deps = makeDependencies();

  const app = createApp(deps);

  await app.start();
  await app.start();

  assert.deepEqual(
    deps.transitions,
    [
      ['storage', 'READY'],
      ['core', 'READY']
    ]
  );
});

test('stop marks core then storage DISABLED', async () => {
  const { createApp } = loadApp();
  const deps = makeDependencies();

  const app = createApp(deps);

  await app.start();

  deps.transitions.length = 0;

  await app.stop();

  assert.equal(app.isStarted(), false);

  assert.deepEqual(
    deps.transitions,
    [
      ['core', 'DISABLED'],
      ['storage', 'DISABLED']
    ]
  );

  assert.equal(
    app.health().overall,
    'DISABLED'
  );
});

test('stop is idempotent', async () => {
  const { createApp } = loadApp();
  const deps = makeDependencies();

  const app = createApp(deps);

  await app.start();

  deps.transitions.length = 0;

  await app.stop();
  await app.stop();

  assert.deepEqual(
    deps.transitions,
    [
      ['core', 'DISABLED'],
      ['storage', 'DISABLED']
    ]
  );
});

test('health result is frozen and exposes status only', async () => {
  const { createApp } = loadApp();
  const deps = makeDependencies();

  const app = createApp(deps);

  await app.start();

  const health = app.health();

  assert.equal(
    Object.isFrozen(health),
    true
  );

  assert.equal(
    Object.isFrozen(health.subsystems),
    true
  );

  assert.deepEqual(
    Object.keys(health).sort(),
    ['overall', 'subsystems']
  );

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      health,
      'config'
    ),
    false
  );

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      health,
      'credentials'
    ),
    false
  );
});

test('foundation app start creates no net/http/https server', async () => {
  const net = require('node:net');
  const http = require('node:http');
  const https = require('node:https');

  const originalNet = net.createServer;
  const originalHttp = http.createServer;
  const originalHttps = https.createServer;

  let serverCreationCalls = 0;

  function forbiddenCreateServer() {
    serverCreationCalls += 1;

    throw new Error(
      'foundation application must not create a network server'
    );
  }

  net.createServer = forbiddenCreateServer;
  http.createServer = forbiddenCreateServer;
  https.createServer = forbiddenCreateServer;

  try {
    delete require.cache[require.resolve(appPath)];

    const { createApp } = require(appPath);
    const deps = makeDependencies();

    const app = createApp(deps);

    await app.start();

    assert.equal(
      serverCreationCalls,
      0
    );
  } finally {
    net.createServer = originalNet;
    http.createServer = originalHttp;
    https.createServer = originalHttps;

    delete require.cache[require.resolve(appPath)];
  }
});

test('entrypoint exports main without starting on require', () => {
  delete require.cache[require.resolve(binPath)];

  const entry = require(binPath);

  assert.equal(
    typeof entry.main,
    'function'
  );
});
