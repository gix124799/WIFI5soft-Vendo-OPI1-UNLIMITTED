'use strict';

const { withTransaction } = require('../db/transaction');

function validateKey(key) {
  if (
    typeof key !== 'string' ||
    key.trim() !== key ||
    key.length < 1 ||
    key.length > 128
  ) {
    throw new TypeError('invalid setting key');
  }

  return key;
}

function serializeValue(value) {
  const json = JSON.stringify(value);

  if (json === undefined) {
    throw new TypeError('setting value must be JSON serializable');
  }

  return json;
}

function createSettingsService(options = {}) {
  const store = options.store;
  const now = options.now || Date.now;

  if (!store || typeof store.all !== 'function') {
    throw new TypeError('SQLite store is required');
  }

  function get(key) {
    const target = validateKey(key);
    const rows = store.all(
      'SELECT value_json FROM settings WHERE key = ?',
      [target]
    );

    if (rows.length === 0) {
      return undefined;
    }

    return JSON.parse(rows[0].value_json);
  }

  function list() {
    return store.all(
      'SELECT key, value_json, updated_at FROM settings ORDER BY key'
    ).map((row) => Object.freeze({
      key: row.key,
      value: JSON.parse(row.value_json),
      updatedAt: row.updated_at,
    }));
  }

  async function set(key, value) {
    const target = validateKey(key);
    const json = serializeValue(value);
    const timestamp = now();

    await withTransaction(store, async (tx) => {
      tx.run(
        `INSERT INTO settings(key, value_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at`,
        [target, json, timestamp]
      );
    });

    return value;
  }

  return Object.freeze({
    get,
    list,
    set,
  });
}

module.exports = {
  createSettingsService,
};
