'use strict';

const { withTransaction } = require('../db/transaction');
const { createId, assertIdempotencyKey } = require('../business/ids');

function nonEmpty(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function jsonClone(value, name) {
  if (value === undefined) {
    return {};
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_error) {
    throw new TypeError(`${name} must be JSON serializable`);
  }
}

function mapOperation(row) {
  if (!row) return undefined;
  return Object.freeze({
    id: row.id,
    provider: row.provider,
    operation: row.operation,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    request: JSON.parse(row.request_json || '{}'),
    response: row.response_json === null ? null : JSON.parse(row.response_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function createProviderOperationService(options = {}) {
  const store = options.store;
  const adapters = options.adapters || {};
  const now = options.now || Date.now;
  const createIdFn = options.createIdFn || ((prefix) => createId(prefix));

  if (!store || typeof store.all !== 'function' || typeof store.run !== 'function') {
    throw new TypeError('SQLite store is required');
  }

  function getByIdempotencyKey(key) {
    const normalized = assertIdempotencyKey(key);
    return mapOperation(
      store.all(
        'SELECT * FROM provider_operations WHERE idempotency_key = ?',
        [normalized]
      )[0]
    );
  }

  function get(id) {
    return mapOperation(
      store.all('SELECT * FROM provider_operations WHERE id = ?', [nonEmpty(id, 'operation id')])[0]
    );
  }

  function list() {
    return store.all(
      'SELECT * FROM provider_operations ORDER BY created_at, id'
    ).map(mapOperation);
  }

  async function setTerminal(id, status, response) {
    const timestamp = now();
    await withTransaction(store, async (tx) => {
      tx.run(
        `UPDATE provider_operations
         SET status = ?, response_json = ?, updated_at = ?
         WHERE id = ?`,
        [status, response === null ? null : JSON.stringify(response), timestamp, id]
      );
    });
    return get(id);
  }

  async function execute(input = {}) {
    const provider = nonEmpty(input.provider, 'provider');
    const operation = nonEmpty(input.operation, 'operation');
    const idempotencyKey = assertIdempotencyKey(input.idempotencyKey);
    const request = jsonClone(input.request, 'request');

    const prior = getByIdempotencyKey(idempotencyKey);
    if (prior) {
      return prior;
    }

    const id = input.id || createIdFn('provider_operation');
    const timestamp = now();

    await withTransaction(store, async (tx) => {
      tx.run(
        `INSERT INTO provider_operations(
           id, provider, operation, idempotency_key, status,
           request_json, response_json, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 'pending', ?, NULL, ?, ?)`,
        [id, provider, operation, idempotencyKey, JSON.stringify(request), timestamp, timestamp]
      );
    });

    const adapter = adapters[provider];
    if (!adapter || typeof adapter.execute !== 'function') {
      return setTerminal(id, 'unavailable', null);
    }

    try {
      const response = jsonClone(
        await adapter.execute(Object.freeze({
          provider,
          operation,
          idempotencyKey,
          request: Object.freeze({ ...request }),
        })),
        'provider response'
      );
      return setTerminal(id, 'succeeded', response);
    } catch (error) {
      return setTerminal(id, 'failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return Object.freeze({
    execute,
    get,
    getByIdempotencyKey,
    list,
  });
}

module.exports = {
  createProviderOperationService,
};
