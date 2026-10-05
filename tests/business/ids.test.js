'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createId,
  assertIdempotencyKey,
} = require('../../src/business/ids');

test('creates stable prefixed UUID identifiers', () => {
  const id = createId('session', {
    randomUUID() {
      return '123e4567-e89b-12d3-a456-426614174000';
    },
  });

  assert.equal(id, 'session_123e4567-e89b-12d3-a456-426614174000');
});

test('validates identifier prefixes and idempotency keys', () => {
  assert.throws(() => createId('../bad'), /prefix/i);
  assert.equal(assertIdempotencyKey('coin-node-1:event-42'), 'coin-node-1:event-42');
  assert.throws(() => assertIdempotencyKey(''), /idempotency/i);
  assert.throws(() => assertIdempotencyKey('x'.repeat(129)), /idempotency/i);
});
