'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { spawnSync } = require('node:child_process');

const modulePath = path.resolve(
  __dirname,
  '../../src/http/index.js'
);

function loadSubject() {
  try {
    return require(modulePath);
  } catch (error) {
    if (
      error &&
      error.code === 'MODULE_NOT_FOUND' &&
      String(error.message).includes('/src/http/index.js')
    ) {
      return null;
    }

    throw error;
  }
}

function createLogger() {
  return {
    error() {},
  };
}

class FakeServer extends EventEmitter {
  constructor(handler, events) {
    super();

    this.handler = handler;
    this.events = events;
    this.currentAddress = null;
  }

  listen(port, host) {
    this.events.push(
      `listen:${host}:${port}`
    );

    this.currentAddress = {
      address: host,
      port,
    };

    queueMicrotask(() => {
      this.emit('listening');
    });

    return this;
  }

  close(callback) {
    const address = this.currentAddress;

    this.events.push(
      `close:${address ? address.port : 'none'}`
    );

    this.currentAddress = null;

    queueMicrotask(() => {
      if (typeof callback === 'function') {
        callback();
      }
    });

    return this;
  }

  address() {
    return this.currentAddress;
  }
}

function createResponse() {
  return {
    statusCode: 200,
    body: '',
    ended: false,

    end(chunk = '') {
      this.body += String(chunk);
      this.ended = true;
    },
  };
}

test('exports createHttpLayer', () => {
  const subject = loadSubject();

  assert.ok(
    subject,
    'HTTP layer module must exist'
  );

  assert.equal(
    typeof subject.createHttpLayer,
    'function'
  );
});

test('importing the HTTP layer does not create an HTTP server', () => {
  const script = `
    const http = require('node:http');
    let calls = 0;

    http.createServer = function () {
      calls += 1;
      throw new Error('createServer must not run during import');
    };

    require(${JSON.stringify(modulePath)});

    process.stdout.write(String(calls));
  `;

  const result = spawnSync(
    process.execPath,
    ['-e', script],
    {
      encoding: 'utf8',
    }
  );

  assert.equal(
    result.status,
    0,
    result.stderr
  );

  assert.equal(
    result.stdout,
    '0'
  );
});

test('construction returns a frozen layer with exact contract and two empty routers', () => {
  const subject = loadSubject();

  assert.ok(subject);

  const layer = subject.createHttpLayer({
    logger: createLogger(),
  });

  assert.equal(
    Object.isFrozen(layer),
    true
  );

  assert.equal(
    layer.contract.host,
    'localhost'
  );

  assert.equal(
    layer.contract.upstream3000.port,
    3000
  );

  assert.equal(
    layer.contract.upstream3001.port,
    3001
  );

  assert.equal(
    layer.upstream3000Router.routeCount(),
    0
  );

  assert.equal(
    layer.upstream3001Router.routeCount(),
    0
  );

  assert.equal(
    layer.isStarted(),
    false
  );

  assert.deepEqual(
    layer.snapshot(),
    {
      started: false,
      upstream3000: {
        started: false,
      },
      upstream3001: {
        started: false,
      },
    }
  );
});

test('construction with a serverFactory performs no server creation or bind', () => {
  const subject = loadSubject();

  assert.ok(subject);

  const events = [];
  let serverFactoryCalls = 0;

  function serverFactory(handler) {
    serverFactoryCalls += 1;

    return new FakeServer(
      handler,
      events
    );
  }

  const layer = subject.createHttpLayer({
    logger: createLogger(),
    serverFactory,
  });

  assert.equal(
    serverFactoryCalls,
    0
  );

  assert.deepEqual(
    events,
    []
  );

  assert.equal(
    layer.isStarted(),
    false
  );
});

test('start wires exactly localhost:3000 and localhost:3001 through the provided serverFactory', async () => {
  const subject = loadSubject();

  assert.ok(subject);

  const events = [];
  const servers = [];

  function serverFactory(handler) {
    const server = new FakeServer(
      handler,
      events
    );

    servers.push(server);

    return server;
  }

  const layer = subject.createHttpLayer({
    logger: createLogger(),
    serverFactory,
  });

  await layer.start();

  assert.deepEqual(
    events,
    [
      'listen:localhost:3000',
      'listen:localhost:3001',
    ]
  );

  assert.equal(
    servers.length,
    2
  );

  assert.equal(
    layer.isStarted(),
    true
  );

  await layer.stop();

  assert.deepEqual(
    events,
    [
      'listen:localhost:3000',
      'listen:localhost:3001',
      'close:3001',
      'close:3000',
    ]
  );

  assert.equal(
    layer.isStarted(),
    false
  );
});

test('verified routes can be registered before start and are wired to the correct upstream', async () => {
  const subject = loadSubject();

  assert.ok(subject);

  const creations = [];

  function listenerFactory(config) {
    creations.push(config);

    let started = false;

    return {
      async start() {
        started = true;
      },

      async stop() {
        started = false;
      },

      isStarted() {
        return started;
      },
    };
  }

  const layer = subject.createHttpLayer({
    logger: createLogger(),
    listenerFactory,
  });

  layer.upstream3000Router.register(
    'GET',
    '/verified-3000',
    (_request, response) => {
      response.end('from-3000');
    }
  );

  layer.upstream3001Router.register(
    'GET',
    '/verified-3001',
    (_request, response) => {
      response.end('from-3001');
    }
  );

  assert.equal(
    layer.upstream3000Router.routeCount(),
    1
  );

  assert.equal(
    layer.upstream3001Router.routeCount(),
    1
  );

  await layer.start();

  assert.equal(
    creations.length,
    2
  );

  assert.equal(
    creations[0].port,
    3000
  );

  assert.equal(
    creations[1].port,
    3001
  );

  const response3000 = createResponse();

  await creations[0].handler(
    {
      method: 'GET',
      url: '/verified-3000',
    },
    response3000
  );

  assert.equal(
    response3000.statusCode,
    200
  );

  assert.equal(
    response3000.body,
    'from-3000'
  );

  const response3001 = createResponse();

  await creations[1].handler(
    {
      method: 'GET',
      url: '/verified-3001',
    },
    response3001
  );

  assert.equal(
    response3001.statusCode,
    200
  );

  assert.equal(
    response3001.body,
    'from-3001'
  );

  await layer.stop();
});

test('rejects ambiguous simultaneous serverFactory and listenerFactory injection', () => {
  const subject = loadSubject();

  assert.ok(subject);

  assert.throws(
    () => {
      subject.createHttpLayer({
        serverFactory() {},
        listenerFactory() {},
      });
    },
    /serverFactory.*listenerFactory|listenerFactory.*serverFactory/i
  );
});
