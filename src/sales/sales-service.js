'use strict';

function mapSale(row) {
  if (!row) {
    return undefined;
  }

  return Object.freeze({
    id: row.id,
    kind: row.kind,
    amountMinor: row.amount_minor,
    seconds: row.seconds,
    status: row.status,
    createdAt: row.created_at,
    metadata: JSON.parse(row.metadata_json || '{}'),
  });
}

function createSalesService(options = {}) {
  const store = options.store;
  if (!store || typeof store.all !== 'function') {
    throw new TypeError('SQLite store is required');
  }

  function list() {
    return store.all(
      'SELECT * FROM sales ORDER BY created_at, id'
    ).map(mapSale);
  }

  function get(id) {
    return mapSale(
      store.all('SELECT * FROM sales WHERE id = ?', [id])[0]
    );
  }

  function totals() {
    const row = store.all(
      `SELECT COUNT(*) AS count,
              COALESCE(SUM(amount_minor), 0) AS amount_minor,
              COALESCE(SUM(seconds), 0) AS seconds
       FROM sales
       WHERE status = 'completed'`
    )[0];

    return Object.freeze({
      amountMinor: row.amount_minor,
      seconds: row.seconds,
      count: row.count,
    });
  }

  return Object.freeze({ list, get, totals });
}

module.exports = {
  createSalesService,
  mapSale,
};
