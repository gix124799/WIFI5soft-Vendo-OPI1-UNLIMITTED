'use strict';

function mapVoucher(row) {
  if (!row) {
    return undefined;
  }

  return Object.freeze({
    id: row.id,
    code: row.code,
    creditSeconds: row.credit_seconds,
    priceMinor: row.price_minor,
    status: row.status,
    validUntil: row.valid_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapSession(row) {
  if (!row) {
    return undefined;
  }

  return Object.freeze({
    id: row.id,
    deviceId: row.device_id,
    userId: row.user_id,
    remainingSeconds: row.remaining_seconds,
    state: row.state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function createVoucherRepository(store) {
  if (!store || typeof store.all !== 'function' || typeof store.run !== 'function') {
    throw new TypeError('SQLite store is required');
  }

  return Object.freeze({
    getByCode(code) {
      return mapVoucher(
        store.all('SELECT * FROM vouchers WHERE code = ?', [code])[0]
      );
    },

    list() {
      return store.all(
        'SELECT * FROM vouchers ORDER BY created_at, id'
      ).map(mapVoucher);
    },

    getSession(id) {
      return mapSession(
        store.all('SELECT * FROM sessions WHERE id = ?', [id])[0]
      );
    },
  });
}

module.exports = {
  createVoucherRepository,
  mapVoucher,
  mapSession,
};
