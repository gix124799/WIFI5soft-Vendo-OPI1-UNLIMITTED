'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertMinorUnits,
} = require('../../src/business/money');

test('accepts safe integer minor units', () => {
  assert.equal(assertMinorUnits(0), 0);
  assert.equal(assertMinorUnits(125), 125);
  assert.equal(assertMinorUnits(-25, { allowNegative: true }), -25);
});

test('rejects floats unsafe integers and negative values by default', () => {
  assert.throws(() => assertMinorUnits(1.5), /integer/i);
  assert.throws(() => assertMinorUnits(Number.MAX_SAFE_INTEGER + 1), /safe/i);
  assert.throws(() => assertMinorUnits(-1), /negative|non-negative/i);
});
