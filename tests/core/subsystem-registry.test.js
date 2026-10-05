'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const modulePath = path.join(
  root,
  'src',
  'core',
  'subsystem-registry.js'
);

function loadSubject() {
  assert.ok(
    fs.existsSync(modulePath),
    'src/core/subsystem-registry.js must exist'
  );

  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

test('exports the exact frozen subsystem health states', () => {
  const { STATES } = loadSubject();

  assert.deepEqual(STATES, {
    READY: 'READY',
    DEGRADED: 'DEGRADED',
    FAILED: 'FAILED',
    DISABLED: 'DISABLED'
  });

  assert.equal(Object.isFrozen(STATES), true);
});

test('registered subsystems start DISABLED', () => {
  const { createSubsystemRegistry, STATES } = loadSubject();

  const registry = createSubsystemRegistry([
    'core',
    'storage'
  ]);

  assert.equal(registry.get('core'), STATES.DISABLED);
  assert.equal(registry.get('storage'), STATES.DISABLED);
  assert.equal(registry.overall(), STATES.DISABLED);
});

test('registered subsystem can transition through every valid state', () => {
  const { createSubsystemRegistry, STATES } = loadSubject();

  const registry = createSubsystemRegistry(['core']);

  for (const state of [
    STATES.READY,
    STATES.DEGRADED,
    STATES.FAILED,
    STATES.DISABLED
  ]) {
    registry.set('core', state);
    assert.equal(registry.get('core'), state);
  }
});

test('snapshot is frozen and does not expose mutable internal state', () => {
  const { createSubsystemRegistry, STATES } = loadSubject();

  const registry = createSubsystemRegistry([
    'core',
    'storage'
  ]);

  registry.set('core', STATES.READY);

  const snapshot = registry.snapshot();

  assert.equal(Object.isFrozen(snapshot), true);
  assert.deepEqual(snapshot, {
    core: STATES.READY,
    storage: STATES.DISABLED
  });

  assert.throws(
    () => {
      snapshot.core = STATES.FAILED;
    },
    TypeError
  );

  assert.equal(registry.get('core'), STATES.READY);
});

test('overall state follows FAILED DEGRADED READY DISABLED precedence', () => {
  const { createSubsystemRegistry, STATES } = loadSubject();

  const registry = createSubsystemRegistry([
    'a',
    'b',
    'c'
  ]);

  assert.equal(registry.overall(), STATES.DISABLED);

  registry.set('a', STATES.READY);
  assert.equal(registry.overall(), STATES.READY);

  registry.set('b', STATES.DEGRADED);
  assert.equal(registry.overall(), STATES.DEGRADED);

  registry.set('c', STATES.FAILED);
  assert.equal(registry.overall(), STATES.FAILED);

  registry.set('c', STATES.DISABLED);
  assert.equal(registry.overall(), STATES.DEGRADED);

  registry.set('b', STATES.DISABLED);
  assert.equal(registry.overall(), STATES.READY);

  registry.set('a', STATES.DISABLED);
  assert.equal(registry.overall(), STATES.DISABLED);
});

test('duplicate subsystem names are rejected', () => {
  const { createSubsystemRegistry } = loadSubject();

  assert.throws(
    () => createSubsystemRegistry([
      'core',
      'core'
    ]),
    /duplicate/i
  );
});

test('unknown subsystem names are rejected by get and set', () => {
  const { createSubsystemRegistry, STATES } = loadSubject();

  const registry = createSubsystemRegistry(['core']);

  assert.throws(
    () => registry.get('missing'),
    /unknown.*subsystem/i
  );

  assert.throws(
    () => registry.set('missing', STATES.READY),
    /unknown.*subsystem/i
  );
});

test('invalid subsystem states are rejected', () => {
  const { createSubsystemRegistry } = loadSubject();

  const registry = createSubsystemRegistry(['core']);

  assert.throws(
    () => registry.set('core', 'BROKEN'),
    /invalid.*state/i
  );

  assert.equal(
    registry.get('core'),
    'DISABLED'
  );
});
