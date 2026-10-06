'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CURRENT_SCHEMA_VERSION,
  SCHEMA_TABLES,
  getSchemaStatements,
  getMigrationStatements,
} = require('../../src/db/schema');

test('declares schema version 3 and every approved persistent table', () => {
  assert.equal(CURRENT_SCHEMA_VERSION, 3);

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
      'rental_devices',
      'resellers',
    ]
  );
  assert.equal(Object.isFrozen(SCHEMA_TABLES), true);
});

test('schema v1 to v2 migration adds rental and reseller tables only', () => {
  const sql = getMigrationStatements(1).join('\n');
  assert.match(sql, /CREATE TABLE rental_devices/i);
  assert.match(sql, /CREATE TABLE resellers/i);
  assert.doesNotMatch(sql, /CREATE TABLE settings/i);
});

test('schema v2 to v3 migration adds session expiry clock only', () => {
  const sql = getMigrationStatements(2).join('\n');
  assert.match(sql, /ALTER TABLE sessions ADD COLUMN expires_at/i);
  assert.match(sql, /UPDATE sessions\s+SET expires_at/i);
  assert.doesNotMatch(sql, /CREATE TABLE/i);
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
