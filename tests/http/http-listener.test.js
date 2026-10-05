'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const modulePath = path.resolve(
  __dirname,
  '../../src/http/http-listener.js'
);

function loadSubject() {
  try {
    return require(modulePath);
  } catch (error) {
    if (
      error &&
      error.code === 'MODULE_NOT_FOUND' &&
      String(error.message).includes('http-listener')
    ) {
      return null;
    }

    throw error;
  }
}

class FakeServer extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = options;

    this.listenCalls = [];
    this.closeCalls = 0;

    this.currentAddress = null;
  }

  listen(port, host) {
    this.listenCalls.push({
      port,
      host,
    });

    if (this.options.throwOnListen) {
      throw this.options.throwOnListen;
    }

    queueMicrotask(() => {
      if (this.options.listenError) {
        this.emit(
          'error',
          this.options.listenError
        );
        return;
      }

      this.currentAddress = {
        address: host,
        port,
      };

      this.emit('listening');
    });

    return this;
  }

  close(callback) {
    this.closeCalls += 1;
    this.currentAddress = null;

    queueMicrotask(() => {
      if (typeof callback === 'function') {
        callback(
          this.options.closeError || undefined
        );
      }
    });

    return this;
  }

  address() {
    return this.currentAddress;
  }
}

function createFactory(sequence = []) {
  const calls = [];
  const servers = [];

  function serverFactory(handler) {
    calls.push({
      handler,
    });

    const options =
      sequence.length > servers.length
        ? sequence[servers.length]
        : {};

    const server = new FakeServer(
      options
    );

    servers.push(server);

    return server;
  }

  return {
    calls,
    servers,
    serverFactory,
  };
}

function handler() {}

test('exports createHttpListener', () => {
  const subject = loadSubject();

  assert.ok(
    subject,
    'http-listener module must exist'
  );

  assert.equal(
    typeof subject.createHttpListener,
    'function'
  );
});

test('accepts only the literal localhost host token', () => {
  const subject = loadSubject();

  assert.ok(subject);

  const factory = createFactory();

  assert.doesNotThrow(() => {
    subject.createHttpListener({
      host: 'localhost',
      port: 3000,
      handler,
      serverFactory: factory.serverFactory,
    });
  });

  for (const host of [
    '127.0.0.1',
    '::1',
    '0.0.0.0',
    '::',
    '',
    null,
  ]) {
    assert.throws(
      () => {
        subject.createHttpListener({
          host,
          port: 3000,
          handler,
          serverFactory: factory.serverFactory,
        });
      },
      /host/i
    );
  }
});

test('accepts only integer TCP ports from 1 through 65535', () => {
  const subject = loadSubject();

  assert.ok(subject);

  const factory = createFactory();

  for (const port of [
    0,
    -1,
    65536,
    1.5,
    '3000',
    null,
  ]) {
    assert.throws(
      () => {
        subject.createHttpListener({
          host: 'localhost',
          port,
          handler,
          serverFactory: factory.serverFactory,
        });
      },
      /port/i
    );
  }

  assert.doesNotThrow(() => {
    subject.createHttpListener({
      host: 'localhost',
      port: 1,
      handler,
      serverFactory: factory.serverFactory,
    });
  });

  assert.doesNotThrow(() => {
    subject.createHttpListener({
      host: 'localhost',
      port: 65535,
      handler,
      serverFactory: factory.serverFactory,
    });
  });
});

test('construction performs no server creation or bind', () => {
  const subject = loadSubject();

  assert.ok(subject);

  const factory = createFactory();

  const listener = subject.createHttpListener({
    host: 'localhost',
    port: 3000,
    handler,
    serverFactory: factory.serverFactory,
  });

  assert.equal(factory.calls.length, 0);
  assert.equal(factory.servers.length, 0);

  assert.equal(
    listener.isStarted(),
    false
  );

  assert.equal(
    listener.address(),
    null
  );
});

test('start creates one server and listens on localhost with the exact port', async () => {
  const subject = loadSubject();

  assert.ok(subject);

  const factory = createFactory();

  const listener = subject.createHttpListener({
    host: 'localhost',
    port: 3000,
    handler,
    serverFactory: factory.serverFactory,
  });

  await listener.start();

  assert.equal(factory.calls.length, 1);
  assert.equal(factory.servers.length, 1);

  assert.deepEqual(
    factory.servers[0].listenCalls,
    [
      {
        port: 3000,
        host: 'localhost',
      },
    ]
  );

  assert.equal(
    listener.isStarted(),
    true
  );

  assert.deepEqual(
    listener.address(),
    {
      address: 'localhost',
      port: 3000,
    }
  );
});

test('repeated start is idempotent', async () => {
  const subject = loadSubject();

  assert.ok(subject);

  const factory = createFactory();

  const listener = subject.createHttpListener({
    host: 'localhost',
    port: 3001,
    handler,
    serverFactory: factory.serverFactory,
  });

  await listener.start();
  await listener.start();

  assert.equal(factory.calls.length, 1);
  assert.equal(
    factory.servers[0].listenCalls.length,
    1
  );

  assert.equal(
    listener.isStarted(),
    true
  );
});

test('stop before start is safe and does not create a server', async () => {
  const subject = loadSubject();

  assert.ok(subject);

  const factory = createFactory();

  const listener = subject.createHttpListener({
    host: 'localhost',
    port: 3000,
    handler,
    serverFactory: factory.serverFactory,
  });

  await listener.stop();

  assert.equal(factory.calls.length, 0);
  assert.equal(
    listener.isStarted(),
    false
  );
});

test('stop closes a started server and is idempotent', async () => {
  const subject = loadSubject();

  assert.ok(subject);

  const factory = createFactory();

  const listener = subject.createHttpListener({
    host: 'localhost',
    port: 3000,
    handler,
    serverFactory: factory.serverFactory,
  });

  await listener.start();
  await listener.stop();
  await listener.stop();

  assert.equal(
    factory.servers[0].closeCalls,
    1
  );

  assert.equal(
    listener.isStarted(),
    false
  );

  assert.equal(
    listener.address(),
    null
  );
});

test('EADDRINUSE rejects start, closes partial server state, and remains stopped', async () => {
  const subject = loadSubject();

  assert.ok(subject);

  const error = Object.assign(
    new Error('address already in use'),
    {
      code: 'EADDRINUSE',
    }
  );

  const factory = createFactory([
    {
      listenError: error,
    },
  ]);

  const listener = subject.createHttpListener({
    host: 'localhost',
    port: 3000,
    handler,
    serverFactory: factory.serverFactory,
  });

  await assert.rejects(
    listener.start(),
    (caught) => {
      assert.equal(
        caught,
        error
      );

      return true;
    }
  );

  assert.equal(
    factory.servers[0].closeCalls,
    1
  );

  assert.equal(
    listener.isStarted(),
    false
  );

  assert.equal(
    listener.address(),
    null
  );
});

test('a later start retry succeeds after a failed start', async () => {
  const subject = loadSubject();

  assert.ok(subject);

  const error = Object.assign(
    new Error('address already in use'),
    {
      code: 'EADDRINUSE',
    }
  );

  const factory = createFactory([
    {
      listenError: error,
    },
    {},
  ]);

  const listener = subject.createHttpListener({
    host: 'localhost',
    port: 3001,
    handler,
    serverFactory: factory.serverFactory,
  });

  await assert.rejects(
    listener.start(),
    /address already in use/
  );

  assert.equal(
    listener.isStarted(),
    false
  );

  await listener.start();

  assert.equal(factory.servers.length, 2);

  assert.equal(
    listener.isStarted(),
    true
  );

  assert.deepEqual(
    listener.address(),
    {
      address: 'localhost',
      port: 3001,
    }
  );
});

test('a synchronous listen failure leaves the listener retryable', async () => {
  const subject = loadSubject();

  assert.ok(subject);

  const listenError = new Error(
    'synchronous listen failure'
  );

  const factory = createFactory([
    {
      throwOnListen: listenError,
    },
    {},
  ]);

  const listener = subject.createHttpListener({
    host: 'localhost',
    port: 3000,
    handler,
    serverFactory: factory.serverFactory,
  });

  await assert.rejects(
    listener.start(),
    /synchronous listen failure/
  );

  assert.equal(
    listener.isStarted(),
    false
  );

  assert.equal(
    factory.servers[0].closeCalls,
    1
  );

  await listener.start();

  assert.equal(
    listener.isStarted(),
    true
  );
});
