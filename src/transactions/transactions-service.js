'use strict';

function mapTransaction(row) {
  if (!row) {
    return undefined;
  }

  return Object.freeze({
    id: row.id,
    kind: row.kind,
    amountMinor: row.amount_minor,
    secondsDelta: row.seconds_delta,
    deviceId: row.device_id,
    userId: row.user_id,
    sessionId: row.session_id,
    saleId: row.sale_id,
    reference: row.reference,
    createdAt: row.created_at,
    metadata: JSON.parse(row.metadata_json || '{}'),
  });
}

function createTransactionsService(options = {}) {
  const store = options.store;
  if (!store || typeof store.all !== 'function') {
    throw new TypeError('SQLite store is required');
  }

  function list() {
    return store.all(
      'SELECT * FROM transactions ORDER BY created_at, id'
    ).map(mapTransaction);
  }

  function get(id) {
    return mapTransaction(
      store.all('SELECT * FROM transactions WHERE id = ?', [id])[0]
    );
  }

  return Object.freeze({ list, get });
}

module.exports = {
  createTransactionsService,
  mapTransaction,
};
