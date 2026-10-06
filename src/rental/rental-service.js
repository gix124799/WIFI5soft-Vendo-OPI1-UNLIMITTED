'use strict';

const { withTransaction } = require('../db/transaction');
const { createId } = require('../business/ids');

const VALID_STATES = Object.freeze(['offline', 'online', 'active', 'disabled']);

function objectInput(input, label) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError(`${label} must be an object`);
  }
  return input;
}
function text(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${label} must be a non-empty string`);
  return value.trim();
}
function metadata(value) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('rental metadata must be an object');
  JSON.stringify(value);
  return { ...value };
}
function mapRow(row) {
  if (!row) return undefined;
  return Object.freeze({
    id: row.id,
    name: row.name,
    deviceKey: row.device_key,
    state: row.state,
    metadata: Object.freeze(JSON.parse(row.metadata_json)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function createRentalService(options = {}) {
  const store = options.store;
  const now = options.now || Date.now;
  const createIdFn = options.createIdFn || ((prefix) => createId(prefix));
  const adapter = options.adapter || {};
  if (!store || typeof store.all !== 'function') throw new TypeError('SQLite store is required');

  function get(id) {
    const key = text(id, 'rental device id');
    return mapRow(store.all('SELECT * FROM rental_devices WHERE id = ?', [key])[0]);
  }
  function list() {
    return store.all('SELECT * FROM rental_devices ORDER BY created_at, id').map(mapRow);
  }
  async function register(input = {}) {
    objectInput(input, 'rental device input');
    const name = text(input.name, 'rental device name');
    const deviceKey = text(input.deviceKey, 'rental device key');
    const meta = metadata(input.metadata);
    const timestamp = now();
    const existing = store.all('SELECT id FROM rental_devices WHERE device_key = ?', [deviceKey])[0];
    if (existing) throw new Error('rental device key already exists');
    const id = input.id === undefined ? createIdFn('rental') : text(input.id, 'rental device id');
    await withTransaction(store, async (tx) => {
      tx.run(`INSERT INTO rental_devices(id, name, device_key, state, metadata_json, created_at, updated_at)
              VALUES (?, ?, ?, 'offline', ?, ?, ?)`, [id, name, deviceKey, JSON.stringify(meta), timestamp, timestamp]);
    });
    return get(id);
  }
  async function setState(id, state) {
    const current = get(id);
    if (!current) throw new Error('rental device not found');
    if (!VALID_STATES.includes(state)) throw new TypeError('invalid rental device state');
    const timestamp = now();
    await withTransaction(store, async (tx) => {
      tx.run('UPDATE rental_devices SET state = ?, updated_at = ? WHERE id = ?', [state, timestamp, current.id]);
      if (typeof adapter.applyState === 'function') {
        await adapter.applyState(Object.freeze({ ...current, state, updatedAt: timestamp }));
      }
    });
    return get(current.id);
  }
  return Object.freeze({ get, list, register, setState });
}

module.exports = { VALID_STATES, createRentalService };
