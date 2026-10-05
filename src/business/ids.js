'use strict';

const crypto = require('node:crypto');

const PREFIX_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;

function createId(prefix, options = {}) {
  if (
    typeof prefix !== 'string' ||
    !PREFIX_PATTERN.test(prefix)
  ) {
    throw new TypeError('invalid ID prefix');
  }

  const randomUUID = options.randomUUID || crypto.randomUUID;

  if (typeof randomUUID !== 'function') {
    throw new TypeError('randomUUID must be a function');
  }

  const value = randomUUID();

  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('randomUUID returned an invalid value');
  }

  return `${prefix}_${value}`;
}

function assertIdempotencyKey(value) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 128 ||
    value.trim() !== value
  ) {
    throw new TypeError('invalid idempotency key');
  }

  return value;
}

module.exports = {
  createId,
  assertIdempotencyKey,
};
