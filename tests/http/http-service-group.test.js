'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  getHttpContract,
} = require('../../src/http/http-contract');

const modulePath = path.resolve(
  __dirname,
  '../../src/http/http-service-group.js'
);

function loadSubject() {
  try {
    return require(modulePath);
  } catch (error) {
    if (
      error &&
      error.code === 'MODULE_NOT_FOUND' &&
      String(error.message).includes('http-service-group')
    ) {
      return null;
    }

    throw error;
  }
}

function handler3000() {}
function handler3001() {}

function createListenerFactory(options = {}) {
  const events = [];
  const creations = [];
  const listeners = [];

  const failStartOnce = new Set(
    options.failStartOnce || []
  );

  const failStopOnce = new Set(
    options.failStopOnce || []
  );

  function listenerFactory(config) {
    const state = {
      host: config.host,
      port: config.port,
      handler: config.handler,
      started: false,
      startCalls: 0,
      stopCalls: 0,
    };

    creations.push({
      host: config.host,
      port: config.port,
      handler: config.handler,
    });

    const listener = {
      async start() {
        state.startCalls += 1;
        events.push(
          `start:${state.port}`
        );

        if (
          failStartOnce.has(state.port)
        ) {
          failStartOnce.delete(
            state.port
          );

          throw new Error(
            `start failed ${state.port}`
          );
        }

        state.started = true;
      },

      async stop() {
        state.stopCalls += 1;
        events.push(
          `stop:${state.port}`
        );

        if (
          failStopOnce.has(state.port)
        ) {
          failStopOnce.delete(
            state.port
          );

          state.started = false;

          throw new Error(
            `stop failed ${state.port}`
          );
        }

        state.started = false;
      },

      isStarted() {
        return state.started;
      },

      address() {
        if (!state.started) {
          return null;
        }

        return {
          address: state.host,
          port: state.port,
        };
      },

      _state: state,
    };

    listeners.push(listener);

    return listener;
  }

  return {
    events,
    creations,
    listeners,
    listenerFactory,
  };
}

test('exports createHttpServiceGroup', () => {
  const subject = loadSubject();

  assert.ok(
    subject,
    'http-service-group module must exist'
  );

  assert.equal(
    typeof subject.createHttpServiceGroup,
    'function'
  );
});

test('constructs exactly two localhost listeners for ports 3000 and 3001', () => {
  const subject = loadSubject();

  assert.ok(subject);

  const factory = createListenerFactory();

  const group = subject.createHttpServiceGroup({
    contract: getHttpContract(),
    upstream3000Handler: handler3000,
    upstream3001Handler: handler3001,
    listenerFactory: factory.listenerFactory,
  });

  assert.equal(
    typeof group.start,
    'function'
  );

  assert.deepEqual(
    factory.creations,
    [
      {
        host: 'localhost',
        port: 3000,
        handler: handler3000,
      },
      {
        host: 'localhost',
        port: 3001,
        handler: handler3001,
      },
    ]
  );
});

test('does not create listeners for reserved or Nginx-owned ports', () => {
  const subject = loadSubject();

  assert.ok(subject);

  const contract = getHttpContract();
  const factory = createListenerFactory();

  subject.createHttpServiceGroup({
    contract,
    upstream3000Handler: handler3000,
    upstream3001Handler: handler3001,
    listenerFactory: factory.listenerFactory,
  });

  const ownedPorts = new Set(
    factory.creations.map(
      (entry) => entry.port
    )
  );

  assert.deepEqual(
    [...ownedPorts].sort((a, b) => a - b),
    [3000, 3001]
  );

  const protectedPorts = [
    contract.reserved.pppoe.port,
    contract.reserved.terminal.port,
    ...contract.nginxExternalPorts,
  ];

  for (const port of protectedPorts) {
    assert.equal(
      ownedPorts.has(port),
      false,
      `protected port ${port} must not be owned`
    );
  }
});

test('construction performs no listener start', () => {
  const subject = loadSubject();

  assert.ok(subject);

  const factory = createListenerFactory();

  const group = subject.createHttpServiceGroup({
    contract: getHttpContract(),
    upstream3000Handler: handler3000,
    upstream3001Handler: handler3001,
    listenerFactory: factory.listenerFactory,
  });

  assert.deepEqual(
    factory.events,
    []
  );

  assert.equal(
    group.isStarted(),
    false
  );
});

test('starts 3000 before 3001 and is idempotent', async () => {
  const subject = loadSubject();

  assert.ok(subject);

  const factory = createListenerFactory();

  const group = subject.createHttpServiceGroup({
    contract: getHttpContract(),
    upstream3000Handler: handler3000,
    upstream3001Handler: handler3001,
    listenerFactory: factory.listenerFactory,
  });

  await group.start();
  await group.start();

  assert.deepEqual(
    factory.events,
    [
      'start:3000',
      'start:3001',
    ]
  );

  assert.equal(
    group.isStarted(),
    true
  );

  assert.equal(
    factory.listeners[0]._state.startCalls,
    1
  );

  assert.equal(
    factory.listeners[1]._state.startCalls,
    1
  );
});

test('stops 3001 before 3000 and is idempotent', async () => {
  const subject = loadSubject();

  assert.ok(subject);

  const factory = createListenerFactory();

  const group = subject.createHttpServiceGroup({
    contract: getHttpContract(),
    upstream3000Handler: handler3000,
    upstream3001Handler: handler3001,
    listenerFactory: factory.listenerFactory,
  });

  await group.start();

  factory.events.length = 0;

  await group.stop();
  await group.stop();

  assert.deepEqual(
    factory.events,
    [
      'stop:3001',
      'stop:3000',
    ]
  );

  assert.equal(
    group.isStarted(),
    false
  );
});

test('stop before start is safe', async () => {
  const subject = loadSubject();

  assert.ok(subject);

  const factory = createListenerFactory();

  const group = subject.createHttpServiceGroup({
    contract: getHttpContract(),
    upstream3000Handler: handler3000,
    upstream3001Handler: handler3001,
    listenerFactory: factory.listenerFactory,
  });

  await group.stop();

  assert.deepEqual(
    factory.events,
    []
  );

  assert.equal(
    group.isStarted(),
    false
  );
});

test('if 3000 fails, 3001 is never started', async () => {
  const subject = loadSubject();

  assert.ok(subject);

  const factory = createListenerFactory({
    failStartOnce: [3000],
  });

  const group = subject.createHttpServiceGroup({
    contract: getHttpContract(),
    upstream3000Handler: handler3000,
    upstream3001Handler: handler3001,
    listenerFactory: factory.listenerFactory,
  });

  await assert.rejects(
    group.start(),
    /start failed 3000/
  );

  assert.deepEqual(
    factory.events,
    [
      'start:3000',
    ]
  );

  assert.equal(
    factory.listeners[1]._state.startCalls,
    0
  );

  assert.equal(
    group.isStarted(),
    false
  );
});

test('if 3001 fails, already-started 3000 is rolled back', async () => {
  const subject = loadSubject();

  assert.ok(subject);

  const factory = createListenerFactory({
    failStartOnce: [3001],
  });

  const group = subject.createHttpServiceGroup({
    contract: getHttpContract(),
    upstream3000Handler: handler3000,
    upstream3001Handler: handler3001,
    listenerFactory: factory.listenerFactory,
  });

  await assert.rejects(
    group.start(),
    /start failed 3001/
  );

  assert.deepEqual(
    factory.events,
    [
      'start:3000',
      'start:3001',
      'stop:3000',
    ]
  );

  assert.equal(
    factory.listeners[0].isStarted(),
    false
  );

  assert.equal(
    factory.listeners[1].isStarted(),
    false
  );

  assert.equal(
    group.isStarted(),
    false
  );
});

test('group can be retried after a transactional startup failure', async () => {
  const subject = loadSubject();

  assert.ok(subject);

  const factory = createListenerFactory({
    failStartOnce: [3001],
  });

  const group = subject.createHttpServiceGroup({
    contract: getHttpContract(),
    upstream3000Handler: handler3000,
    upstream3001Handler: handler3001,
    listenerFactory: factory.listenerFactory,
  });

  await assert.rejects(
    group.start(),
    /start failed 3001/
  );

  await group.start();

  assert.equal(
    group.isStarted(),
    true
  );

  assert.deepEqual(
    factory.events,
    [
      'start:3000',
      'start:3001',
      'stop:3000',
      'start:3000',
      'start:3001',
    ]
  );
});

test('snapshot is deeply frozen and reports lifecycle state only', async () => {
  const subject = loadSubject();

  assert.ok(subject);

  const factory = createListenerFactory();

  const group = subject.createHttpServiceGroup({
    contract: getHttpContract(),
    upstream3000Handler: handler3000,
    upstream3001Handler: handler3001,
    listenerFactory: factory.listenerFactory,
  });

  const before = group.snapshot();

  assert.deepEqual(
    before,
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

  assert.equal(
    Object.isFrozen(before),
    true
  );

  assert.equal(
    Object.isFrozen(before.upstream3000),
    true
  );

  assert.equal(
    Object.isFrozen(before.upstream3001),
    true
  );

  await group.start();

  const after = group.snapshot();

  assert.deepEqual(
    after,
    {
      started: true,
      upstream3000: {
        started: true,
      },
      upstream3001: {
        started: true,
      },
    }
  );

  assert.equal(
    JSON.stringify(after).includes('handler'),
    false
  );

  assert.equal(
    JSON.stringify(after).includes('password'),
    false
  );

  assert.equal(
    JSON.stringify(after).includes('secret'),
    false
  );
});
