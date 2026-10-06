'use strict';

const { withTransaction } = require('../db/transaction');
const { createId } = require('../business/ids');

function normalizeMac(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError('device MAC must be a non-empty string');
  }

  return value.trim().toLowerCase();
}

function normalizeMetadata(value) {
  if (value === undefined) {
    return {};
  }

  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new TypeError('device metadata must be an object');
  }

  JSON.stringify(value);
  return { ...value };
}

function mapRow(row) {
  if (!row) {
    return undefined;
  }

  return Object.freeze({
    id: row.id,
    mac: row.mac,
    name: row.name,
    metadata: Object.freeze(JSON.parse(row.metadata_json)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function createDeviceService(options = {}) {
  const store = options.store;
  const now = options.now || Date.now;
  const createIdFn = options.createIdFn || ((prefix) => createId(prefix));

  if (!store || typeof store.all !== 'function') {
    throw new TypeError('SQLite store is required');
  }

  function get(id) {
    if (typeof id !== 'string' || id.trim() === '') {
      throw new TypeError('device id must be a non-empty string');
    }

    const rows = store.all(
      'SELECT * FROM devices WHERE id = ?',
      [id]
    );

    return mapRow(rows[0]);
  }

  function getByMac(mac) {
    const normalized = normalizeMac(mac);
    const rows = store.all(
      'SELECT * FROM devices WHERE mac = ?',
      [normalized]
    );

    return mapRow(rows[0]);
  }

  function list() {
    return store.all(
      'SELECT * FROM devices ORDER BY created_at, id'
    ).map(mapRow);
  }

  async function upsert(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new TypeError('device input must be an object');
    }

    const mac = normalizeMac(input.mac);
    const existing = getByMac(mac);
    const metadata = normalizeMetadata(input.metadata);
    const timestamp = now();

    if (existing) {
      const name = input.name === undefined ? existing.name : input.name;

      if (name !== null && name !== undefined && typeof name !== 'string') {
        throw new TypeError('device name must be a string or null');
      }

      await withTransaction(store, async (tx) => {
        tx.run(
          `UPDATE devices
           SET mac = ?, name = ?, metadata_json = ?, updated_at = ?
           WHERE id = ?`,
          [
            mac,
            name ?? null,
            JSON.stringify(metadata),
            timestamp,
            existing.id,
          ]
        );
      });

      return get(existing.id);
    }

    const id = input.id === undefined
      ? createIdFn('device')
      : input.id;

    if (typeof id !== 'string' || id.trim() === '') {
      throw new TypeError('device id must be a non-empty string');
    }

    const name = input.name ?? null;

    if (name !== null && typeof name !== 'string') {
      throw new TypeError('device name must be a string or null');
    }

    await withTransaction(store, async (tx) => {
      tx.run(
        `INSERT INTO devices(
           id, mac, name, metadata_json, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          id,
          mac,
          name,
          JSON.stringify(metadata),
          timestamp,
          timestamp,
        ]
      );
    });

    return get(id);
  }

  return Object.freeze({
    get,
    getByMac,
    list,
    upsert,
  });
}

module.exports = {
  createDeviceService,
};
