'use strict';

const { withTransaction } = require('../db/transaction');
const { createId } = require('../business/ids');

function objectInput(input, label) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError(`${label} must be an object`);
  return input;
}
function text(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${label} must be a non-empty string`);
  return value.trim();
}
function metadata(value) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('reseller metadata must be an object');
  JSON.stringify(value);
  return { ...value };
}
function mapRow(row) {
  if (!row) return undefined;
  return Object.freeze({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    enabled: row.enabled === 1,
    metadata: Object.freeze(JSON.parse(row.metadata_json)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function createResellerService(options = {}) {
  const store = options.store;
  const now = options.now || Date.now;
  const createIdFn = options.createIdFn || ((prefix) => createId(prefix));
  if (!store || typeof store.all !== 'function') throw new TypeError('SQLite store is required');

  function get(id) {
    const key = text(id, 'reseller id');
    return mapRow(store.all('SELECT * FROM resellers WHERE id = ?', [key])[0]);
  }
  function list() {
    return store.all('SELECT * FROM resellers ORDER BY created_at, id').map(mapRow);
  }
  async function create(input = {}) {
    objectInput(input, 'reseller input');
    const username = text(input.username, 'reseller username');
    if (store.all('SELECT id FROM resellers WHERE username = ?', [username])[0]) throw new Error('reseller username already exists');
    const id = input.id === undefined ? createIdFn('reseller') : text(input.id, 'reseller id');
    const displayName = input.displayName == null ? null : text(input.displayName, 'reseller display name');
    const meta = metadata(input.metadata);
    const timestamp = now();
    await withTransaction(store, async (tx) => {
      tx.run(`INSERT INTO resellers(id, username, display_name, enabled, metadata_json, created_at, updated_at)
              VALUES (?, ?, ?, 1, ?, ?, ?)`, [id, username, displayName, JSON.stringify(meta), timestamp, timestamp]);
    });
    return get(id);
  }
  async function update(id, changes = {}) {
    objectInput(changes, 'reseller changes');
    const current = get(id);
    if (!current) throw new Error('reseller not found');
    const displayName = changes.displayName === undefined ? current.displayName : (changes.displayName === null ? null : text(changes.displayName, 'reseller display name'));
    const enabled = changes.enabled === undefined ? current.enabled : changes.enabled;
    if (typeof enabled !== 'boolean') throw new TypeError('reseller enabled must be boolean');
    const meta = changes.metadata === undefined ? current.metadata : metadata(changes.metadata);
    const timestamp = now();
    await withTransaction(store, async (tx) => {
      tx.run('UPDATE resellers SET display_name = ?, enabled = ?, metadata_json = ?, updated_at = ? WHERE id = ?', [displayName, enabled ? 1 : 0, JSON.stringify(meta), timestamp, current.id]);
    });
    return get(current.id);
  }
  return Object.freeze({ get, list, create, update });
}

module.exports = { createResellerService };
