'use strict';

const { withTransaction } = require('../db/transaction');
const { createId } = require('../business/ids');

function normalizeUsername(value) {
  if (
    typeof value !== 'string' ||
    value.trim() === '' ||
    value.trim() !== value
  ) {
    throw new TypeError('username must be a non-empty trimmed string');
  }

  return value;
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
    throw new TypeError('user metadata must be an object');
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
    username: row.username,
    displayName: row.display_name,
    metadata: Object.freeze(JSON.parse(row.metadata_json)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function createUserService(options = {}) {
  const store = options.store;
  const now = options.now || Date.now;
  const createIdFn = options.createIdFn || ((prefix) => createId(prefix));

  if (!store || typeof store.all !== 'function') {
    throw new TypeError('SQLite store is required');
  }

  function get(id) {
    if (typeof id !== 'string' || id.trim() === '') {
      throw new TypeError('user id must be a non-empty string');
    }

    const rows = store.all(
      'SELECT * FROM users WHERE id = ?',
      [id]
    );

    return mapRow(rows[0]);
  }

  function getByUsername(username) {
    const normalized = normalizeUsername(username);
    const rows = store.all(
      'SELECT * FROM users WHERE username = ?',
      [normalized]
    );

    return mapRow(rows[0]);
  }

  function list() {
    return store.all(
      'SELECT * FROM users ORDER BY created_at, id'
    ).map(mapRow);
  }

  async function upsert(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new TypeError('user input must be an object');
    }

    const username = normalizeUsername(input.username);
    const existing = getByUsername(username);
    const metadata = normalizeMetadata(input.metadata);
    const timestamp = now();

    if (existing) {
      const displayName = input.displayName === undefined
        ? existing.displayName
        : input.displayName;

      if (
        displayName !== null &&
        displayName !== undefined &&
        typeof displayName !== 'string'
      ) {
        throw new TypeError('displayName must be a string or null');
      }

      await withTransaction(store, async (tx) => {
        tx.run(
          `UPDATE users
           SET username = ?, display_name = ?, metadata_json = ?, updated_at = ?
           WHERE id = ?`,
          [
            username,
            displayName ?? null,
            JSON.stringify(metadata),
            timestamp,
            existing.id,
          ]
        );
      });

      return get(existing.id);
    }

    const id = input.id === undefined
      ? createIdFn('user')
      : input.id;

    if (typeof id !== 'string' || id.trim() === '') {
      throw new TypeError('user id must be a non-empty string');
    }

    const displayName = input.displayName ?? null;

    if (displayName !== null && typeof displayName !== 'string') {
      throw new TypeError('displayName must be a string or null');
    }

    await withTransaction(store, async (tx) => {
      tx.run(
        `INSERT INTO users(
           id, username, display_name, metadata_json, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          id,
          username,
          displayName,
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
    getByUsername,
    list,
    upsert,
  });
}

module.exports = {
  createUserService,
};
