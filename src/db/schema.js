'use strict';

const CURRENT_SCHEMA_VERSION = 1;

const SCHEMA_TABLES = Object.freeze([
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
]);

const statements = Object.freeze([
  `CREATE TABLE schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,

  `CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,

  `CREATE TABLE devices (
    id TEXT PRIMARY KEY,
    mac TEXT UNIQUE,
    name TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,

  `CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    display_name TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,

  `CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    user_id TEXT,
    remaining_seconds INTEGER NOT NULL DEFAULT 0 CHECK (remaining_seconds >= 0),
    state TEXT NOT NULL CHECK (state IN ('active', 'paused', 'exhausted', 'ended')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (device_id) REFERENCES devices(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,

  `CREATE TABLE vouchers (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    credit_seconds INTEGER NOT NULL CHECK (credit_seconds >= 0),
    price_minor INTEGER NOT NULL DEFAULT 0 CHECK (price_minor >= 0),
    status TEXT NOT NULL CHECK (status IN ('active', 'redeemed', 'disabled')),
    valid_until INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,

  `CREATE TABLE voucher_redemptions (
    id TEXT PRIMARY KEY,
    voucher_id TEXT NOT NULL UNIQUE,
    session_id TEXT,
    device_id TEXT,
    user_id TEXT,
    transaction_id TEXT UNIQUE,
    redeemed_at INTEGER NOT NULL,
    FOREIGN KEY (voucher_id) REFERENCES vouchers(id),
    FOREIGN KEY (session_id) REFERENCES sessions(id),
    FOREIGN KEY (device_id) REFERENCES devices(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id)
  )`,

  `CREATE TABLE vendo_rates (
    id TEXT PRIMARY KEY,
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    seconds INTEGER NOT NULL CHECK (seconds > 0),
    pulses INTEGER NOT NULL DEFAULT 1 CHECK (pulses > 0),
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,

  `CREATE TABLE coin_events (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    event_key TEXT NOT NULL UNIQUE,
    pulses INTEGER NOT NULL CHECK (pulses > 0),
    amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
    occurred_at INTEGER NOT NULL,
    transaction_id TEXT,
    sale_id TEXT,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id),
    FOREIGN KEY (sale_id) REFERENCES sales(id)
  )`,

  `CREATE TABLE sales (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
    seconds INTEGER NOT NULL DEFAULT 0 CHECK (seconds >= 0),
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}'
  )`,

  `CREATE TABLE transactions (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    amount_minor INTEGER NOT NULL DEFAULT 0,
    seconds_delta INTEGER NOT NULL DEFAULT 0,
    device_id TEXT,
    user_id TEXT,
    session_id TEXT,
    sale_id TEXT,
    reference TEXT,
    created_at INTEGER NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (device_id) REFERENCES devices(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (session_id) REFERENCES sessions(id),
    FOREIGN KEY (sale_id) REFERENCES sales(id)
  )`,

  `CREATE TABLE pppoe_accounts (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    secret TEXT NOT NULL,
    profile TEXT,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    expires_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,

  `CREATE TABLE pppoe_sessions (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    state TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    FOREIGN KEY (account_id) REFERENCES pppoe_accounts(id)
  )`,

  `CREATE TABLE provider_operations (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    operation TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'unavailable')),
    request_json TEXT NOT NULL DEFAULT '{}',
    response_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,

  `CREATE TABLE idempotency_keys (
    scope TEXT NOT NULL,
    key TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (scope, key)
  )`,

  `CREATE TABLE audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    actor TEXT,
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL
  )`,

  'CREATE INDEX idx_sessions_device ON sessions(device_id)',
  'CREATE INDEX idx_sessions_user ON sessions(user_id)',
  'CREATE INDEX idx_transactions_created ON transactions(created_at)',
  'CREATE INDEX idx_sales_created ON sales(created_at)',
  'CREATE INDEX idx_pppoe_sessions_account ON pppoe_sessions(account_id)',
  'CREATE INDEX idx_provider_operations_provider ON provider_operations(provider, created_at)',
]);

function getSchemaStatements() {
  return [...statements];
}

module.exports = {
  CURRENT_SCHEMA_VERSION,
  SCHEMA_TABLES,
  getSchemaStatements,
};
