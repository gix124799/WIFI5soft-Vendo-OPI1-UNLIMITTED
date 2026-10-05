'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const modulePath = path.join(
  root,
  'src',
  'config',
  'load-config.js'
);

function loadSubject() {
  assert.ok(
    fs.existsSync(modulePath),
    'src/config/load-config.js must exist'
  );

  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

test('uses /mnt/wifi5 and info when overrides are absent', () => {
  const { loadConfig } = loadSubject();

  const config = loadConfig({});

  assert.deepEqual(config, {
    stateRoot: '/mnt/wifi5',
    logLevel: 'info'
  });
});

test('accepts and normalizes an absolute state-root override', () => {
  const { loadConfig } = loadSubject();

  const requested =
    path.join(os.tmpdir(), 'ethyl-state', '..', 'state-root') +
    path.sep;

  const config = loadConfig({
    ETHYL_STATE_ROOT: requested
  });

  assert.equal(
    config.stateRoot,
    path.normalize(requested)
  );
});

test('rejects a relative state-root override', () => {
  const { loadConfig } = loadSubject();

  assert.throws(
    () => loadConfig({
      ETHYL_STATE_ROOT: 'fixtures/state'
    }),
    /absolute/i
  );
});

test('rejects a blank state-root override', () => {
  const { loadConfig } = loadSubject();

  assert.throws(
    () => loadConfig({
      ETHYL_STATE_ROOT: ''
    }),
    /state.*root|blank|empty/i
  );

  assert.throws(
    () => loadConfig({
      ETHYL_STATE_ROOT: '   '
    }),
    /state.*root|blank|empty/i
  );
});

test('supports only debug info warn and error log levels', () => {
  const { loadConfig, VALID_LOG_LEVELS } = loadSubject();

  assert.deepEqual(
    [...VALID_LOG_LEVELS],
    ['debug', 'info', 'warn', 'error']
  );

  for (const level of VALID_LOG_LEVELS) {
    const config = loadConfig({
      ETHYL_LOG_LEVEL: level
    });

    assert.equal(config.logLevel, level);
  }

  assert.throws(
    () => loadConfig({
      ETHYL_LOG_LEVEL: 'verbose'
    }),
    /log.*level|unsupported|invalid/i
  );
});

test('configuration and valid log-level collection are frozen', () => {
  const { loadConfig, VALID_LOG_LEVELS } = loadSubject();

  const config = loadConfig({});

  assert.equal(Object.isFrozen(config), true);
  assert.equal(Object.isFrozen(VALID_LOG_LEVELS), true);
});

test('relative state-root rejection occurs without creating the path', () => {
  const { loadConfig } = loadSubject();

  const relative =
    'fixtures/config-loader-must-not-create-this';

  const resolved = path.resolve(relative);

  assert.equal(fs.existsSync(resolved), false);

  assert.throws(
    () => loadConfig({
      ETHYL_STATE_ROOT: relative
    }),
    /absolute/i
  );

  assert.equal(fs.existsSync(resolved), false);
});
