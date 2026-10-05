'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const modulePath = path.join(
  root,
  'src',
  'logging',
  'logger.js'
);

function loadSubject() {
  assert.ok(
    fs.existsSync(modulePath),
    'src/logging/logger.js must exist'
  );

  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function fixedClock() {
  return new Date('2026-10-05T14:00:00.000Z');
}

test('emits deterministic structured JSON', () => {
  const { createLogger } = loadSubject();

  const lines = [];
  const logger = createLogger({
    level: 'info',
    write: line => lines.push(line),
    clock: fixedClock
  });

  logger.info('foundation started', {
    component: 'core'
  });

  assert.equal(lines.length, 1);

  const record = JSON.parse(lines[0]);

  assert.deepEqual(record, {
    ts: '2026-10-05T14:00:00.000Z',
    level: 'info',
    message: 'foundation started',
    fields: {
      component: 'core'
    }
  });
});

test('omits fields property when no fields are supplied', () => {
  const { createLogger } = loadSubject();

  const lines = [];
  const logger = createLogger({
    write: line => lines.push(line),
    clock: fixedClock
  });

  logger.info('plain message');

  const record = JSON.parse(lines[0]);

  assert.deepEqual(record, {
    ts: '2026-10-05T14:00:00.000Z',
    level: 'info',
    message: 'plain message'
  });
});

test('filters messages below configured log level', () => {
  const { createLogger } = loadSubject();

  const lines = [];
  const logger = createLogger({
    level: 'warn',
    write: line => lines.push(line),
    clock: fixedClock
  });

  logger.debug('debug');
  logger.info('info');
  logger.warn('warn');
  logger.error('error');

  assert.equal(lines.length, 2);

  assert.equal(
    JSON.parse(lines[0]).level,
    'warn'
  );

  assert.equal(
    JSON.parse(lines[1]).level,
    'error'
  );
});

test('redacts nested sensitive fields case-insensitively', () => {
  const { createLogger } = loadSubject();

  const lines = [];
  const logger = createLogger({
    level: 'debug',
    write: line => lines.push(line),
    clock: fixedClock
  });

  logger.debug('credentials', {
    password: 'one',
    TOKEN: 'two',
    nested: {
      Secret: 'three',
      voucherSecret: 'four',
      safe: 'keep-me'
    },
    list: [
      {
        PaSsWoRd: 'five',
        ordinary: 123
      }
    ]
  });

  const fields = JSON.parse(lines[0]).fields;

  assert.deepEqual(fields, {
    password: '[REDACTED]',
    TOKEN: '[REDACTED]',
    nested: {
      Secret: '[REDACTED]',
      voucherSecret: '[REDACTED]',
      safe: 'keep-me'
    },
    list: [
      {
        PaSsWoRd: '[REDACTED]',
        ordinary: 123
      }
    ]
  });
});

test('redaction does not mutate the caller object', () => {
  const { createLogger } = loadSubject();

  const lines = [];

  const input = {
    user: 'client-1',
    password: 'original-password',
    nested: {
      token: 'original-token',
      safe: true
    },
    list: [
      {
        secret: 'original-secret'
      }
    ]
  };

  const before = JSON.parse(
    JSON.stringify(input)
  );

  const logger = createLogger({
    write: line => lines.push(line),
    clock: fixedClock
  });

  logger.info('test', input);

  assert.deepEqual(input, before);

  const fields = JSON.parse(lines[0]).fields;

  assert.equal(fields.password, '[REDACTED]');
  assert.equal(
    fields.nested.token,
    '[REDACTED]'
  );
  assert.equal(
    fields.list[0].secret,
    '[REDACTED]'
  );
});

test('supports debug info warn and error methods', () => {
  const { createLogger } = loadSubject();

  const lines = [];
  const logger = createLogger({
    level: 'debug',
    write: line => lines.push(line),
    clock: fixedClock
  });

  logger.debug('d');
  logger.info('i');
  logger.warn('w');
  logger.error('e');

  assert.deepEqual(
    lines.map(line => JSON.parse(line).level),
    ['debug', 'info', 'warn', 'error']
  );
});

test('rejects an unsupported configured log level', () => {
  const { createLogger } = loadSubject();

  assert.throws(
    () => createLogger({
      level: 'verbose',
      write: () => {},
      clock: fixedClock
    }),
    /invalid.*log.*level|unsupported.*log.*level/i
  );
});
