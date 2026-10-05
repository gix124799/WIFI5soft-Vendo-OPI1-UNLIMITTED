'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const modulePath = path.resolve(
  __dirname,
  '../../src/http/router.js'
);

function loadSubject() {
  try {
    return require(modulePath);
  } catch (error) {
    if (
      error &&
      error.code === 'MODULE_NOT_FOUND' &&
      String(error.message).includes('router')
    ) {
      return null;
    }

    throw error;
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

function createLogger() {
  const calls = [];

  return {
    calls,

    error(message, fields) {
      calls.push({
        message,
        fields,
      });
    },
  };
}

test('exports createRouter', () => {
  const subject = loadSubject();

  assert.ok(
    subject,
    'router module must exist'
  );

  assert.equal(
    typeof subject.createRouter,
    'function'
  );
});

test('starts with zero registered routes', () => {
  const subject = loadSubject();

  assert.ok(subject);

  const router = subject.createRouter({
    logger: createLogger(),
  });

  assert.equal(router.routeCount(), 0);
});

test('registers and dispatches an exact method and pathname', async () => {
  const subject = loadSubject();

  assert.ok(subject);

  const router = subject.createRouter({
    logger: createLogger(),
  });

  router.register(
    'get',
    '/hello',
    async (_request, response) => {
      response.statusCode = 201;
      response.end('ok');
    }
  );

  assert.equal(router.routeCount(), 1);

  const response = createResponse();

  await router.handle(
    {
      method: 'GET',
      url: '/hello',
    },
    response
  );

  assert.equal(response.statusCode, 201);
  assert.equal(response.body, 'ok');
  assert.equal(response.ended, true);
});

test('query string does not change pathname identity', async () => {
  const subject = loadSubject();

  assert.ok(subject);

  const router = subject.createRouter({
    logger: createLogger(),
  });

  router.register(
    'GET',
    '/query',
    (_request, response) => {
      response.end('matched');
    }
  );

  const response = createResponse();

  await router.handle(
    {
      method: 'get',
      url: '/query?token=secret-value&x=1',
    },
    response
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, 'matched');
});

test('rejects duplicate method and pathname registration', () => {
  const subject = loadSubject();

  assert.ok(subject);

  const router = subject.createRouter({
    logger: createLogger(),
  });

  router.register(
    'GET',
    '/same',
    () => {}
  );

  assert.throws(
    () => {
      router.register(
        'get',
        '/same',
        () => {}
      );
    },
    /already registered/i
  );
});

test('rejects invalid route definitions', () => {
  const subject = loadSubject();

  assert.ok(subject);

  const router = subject.createRouter({
    logger: createLogger(),
  });

  assert.throws(
    () => router.register('', '/a', () => {}),
    /method/i
  );

  assert.throws(
    () => router.register('GET', '', () => {}),
    /pathname/i
  );

  assert.throws(
    () => router.register('GET', 'relative', () => {}),
    /pathname/i
  );

  assert.throws(
    () => router.register('GET', '/a?x=1', () => {}),
    /pathname/i
  );

  assert.throws(
    () => router.register('GET', '/a#fragment', () => {}),
    /pathname/i
  );

  assert.throws(
    () => router.register('GET', '/a', null),
    /handler/i
  );
});

test('unknown route returns controlled empty 404', async () => {
  const subject = loadSubject();

  assert.ok(subject);

  const router = subject.createRouter({
    logger: createLogger(),
  });

  const response = createResponse();

  await router.handle(
    {
      method: 'GET',
      url: '/not-registered',
    },
    response
  );

  assert.equal(response.statusCode, 404);
  assert.equal(response.body, '');
  assert.equal(response.ended, true);
});

test('synchronous handler exception returns controlled empty 500', async () => {
  const subject = loadSubject();

  assert.ok(subject);

  const logger = createLogger();

  const router = subject.createRouter({
    logger,
  });

  router.register(
    'POST',
    '/boom',
    () => {
      throw new Error(
        'TOP-SECRET-PASSWORD'
      );
    }
  );

  const response = createResponse();

  await router.handle(
    {
      method: 'POST',
      url: '/boom',
    },
    response
  );

  assert.equal(response.statusCode, 500);
  assert.equal(response.body, '');
  assert.equal(response.ended, true);

  assert.equal(logger.calls.length, 1);

  assert.deepEqual(
    logger.calls[0],
    {
      message: 'http_handler_failed',
      fields: {
        method: 'POST',
        pathname: '/boom',
      },
    }
  );

  assert.equal(
    JSON.stringify(logger.calls)
      .includes('TOP-SECRET-PASSWORD'),
    false
  );
});

test('asynchronous handler rejection returns controlled empty 500', async () => {
  const subject = loadSubject();

  assert.ok(subject);

  const logger = createLogger();

  const router = subject.createRouter({
    logger,
  });

  router.register(
    'GET',
    '/async-boom',
    async () => {
      throw new Error(
        'PRIVATE-TOKEN-VALUE'
      );
    }
  );

  const response = createResponse();

  await router.handle(
    {
      method: 'GET',
      url: '/async-boom?secret=do-not-log',
    },
    response
  );

  assert.equal(response.statusCode, 500);
  assert.equal(response.body, '');
  assert.equal(response.ended, true);

  assert.deepEqual(
    logger.calls,
    [
      {
        message: 'http_handler_failed',
        fields: {
          method: 'GET',
          pathname: '/async-boom',
        },
      },
    ]
  );

  const logged = JSON.stringify(
    logger.calls
  );

  assert.equal(
    logged.includes('PRIVATE-TOKEN-VALUE'),
    false
  );

  assert.equal(
    logged.includes('do-not-log'),
    false
  );
});
