'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CURRENT_SCHEMA_VERSION,
  SCHEMA_TABLES,
  getSchemaStatements,
} = require('../../src/db/schema');

test('declares schema version 1 and every approved persistent table', () => {
  assert.equal(CURRENT_SCHEMA_VERSION, 1);

  assert.deepEqual(
    [...SCHEMA_TABLES],
    [
      'schema_meta',
      'settings',
      'devices',
      'users',
      'sessions',
      'vouchers',
      'voucher_redemptions',
      'vendo_rates',
      'coin_events',
      'sales',
      'transactions',
      'pppoe_accounts',
      'pppoe_sessions',
      'provider_operations',
      'idempotency_keys',
      'audit_events',
    ]
  );

  assert.equal(Object.isFrozen(SCHEMA_TABLES), true);
});

test('schema statements contain no product licensing tables or fields', () => {
  const sql = getSchemaStatements().join('\n').toLowerCase();

  for (const forbidden of [
    'license_key',
    'activation',
    'trial_expir',
    'entitlement',
    'board_limit',
  ]) {
    assert.equal(sql.includes(forbidden), false, forbidden);
  }
});
