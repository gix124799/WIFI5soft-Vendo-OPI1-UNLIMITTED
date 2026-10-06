'use strict';

const { withTransaction } = require('../db/transaction');
const { createId, assertIdempotencyKey } = require('../business/ids');
const { createVoucherRepository, mapVoucher, mapSession } = require('./voucher-repository');

function assertNonEmptyString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function assertNonNegativeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer`);
  }
  return value;
}

function assertPositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return value;
}

function createVoucherService(options = {}) {
  const store = options.store;
  const now = options.now || Date.now;
  const createIdFn = options.createIdFn || ((prefix) => createId(prefix));
  const repository = createVoucherRepository(store);

  async function create(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new TypeError('voucher input must be an object');
    }

    const code = assertNonEmptyString(input.code, 'code').trim();
    const creditSeconds = assertPositiveInteger(input.creditSeconds, 'creditSeconds');
    const priceMinor = assertNonNegativeInteger(input.priceMinor ?? 0, 'priceMinor');
    const validUntil = input.validUntil === undefined || input.validUntil === null
      ? null
      : assertNonNegativeInteger(input.validUntil, 'validUntil');
    const id = input.id || createIdFn('voucher');
    const timestamp = now();

    await withTransaction(store, async (tx) => {
      tx.run(
        `INSERT INTO vouchers(
           id, code, credit_seconds, price_minor, status,
           valid_until, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
        [id, code, creditSeconds, priceMinor, validUntil, timestamp, timestamp]
      );
    });

    return repository.getByCode(code);
  }

  function getByCode(code) {
    return repository.getByCode(assertNonEmptyString(code, 'code').trim());
  }

  function list() {
    return repository.list();
  }

  function readIdempotency(key) {
    const row = store.all(
      'SELECT result_json FROM idempotency_keys WHERE scope = ? AND key = ?',
      ['voucher-redeem', key]
    )[0];
    return row ? JSON.parse(row.result_json) : null;
  }

  async function redeem(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new TypeError('voucher redemption input must be an object');
    }

    const code = assertNonEmptyString(input.code, 'code').trim();
    const sessionId = assertNonEmptyString(input.sessionId, 'sessionId').trim();
    const key = assertIdempotencyKey(input.idempotencyKey);
    const prior = readIdempotency(key);

    if (prior) {
      return Object.freeze({
        voucher: repository.getByCode(prior.code),
        session: repository.getSession(prior.sessionId),
        transactionId: prior.transactionId,
        redemptionId: prior.redemptionId,
      });
    }

    const timestamp = now();
    const transactionId = createIdFn('transaction');
    const redemptionId = createIdFn('voucher_redemption');

    const snapshot = await withTransaction(store, async (tx) => {
      const voucherRow = tx.all('SELECT * FROM vouchers WHERE code = ?', [code])[0];
      if (!voucherRow) {
        throw new Error('voucher not found');
      }
      if (voucherRow.status !== 'active') {
        throw new Error('voucher is not active');
      }
      if (voucherRow.valid_until !== null && timestamp > voucherRow.valid_until) {
        throw new Error('voucher expired');
      }

      const sessionRow = tx.all('SELECT * FROM sessions WHERE id = ?', [sessionId])[0];
      if (!sessionRow) {
        throw new Error('session not found');
      }

      const nextSeconds = sessionRow.remaining_seconds + voucherRow.credit_seconds;
      tx.run(
        `UPDATE sessions
         SET remaining_seconds = ?, state = 'active', updated_at = ?
         WHERE id = ?`,
        [nextSeconds, timestamp, sessionId]
      );

      tx.run(
        `INSERT INTO transactions(
           id, kind, amount_minor, seconds_delta, device_id, user_id,
           session_id, reference, created_at, metadata_json
         ) VALUES (?, 'voucher_redemption', ?, ?, ?, ?, ?, ?, ?, '{}')`,
        [
          transactionId,
          voucherRow.price_minor,
          voucherRow.credit_seconds,
          sessionRow.device_id,
          sessionRow.user_id,
          sessionId,
          key,
          timestamp,
        ]
      );

      tx.run(
        `INSERT INTO voucher_redemptions(
           id, voucher_id, session_id, device_id, user_id,
           transaction_id, redeemed_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          redemptionId,
          voucherRow.id,
          sessionId,
          sessionRow.device_id,
          sessionRow.user_id,
          transactionId,
          timestamp,
        ]
      );

      tx.run(
        `UPDATE vouchers
         SET status = 'redeemed', updated_at = ?
         WHERE id = ?`,
        [timestamp, voucherRow.id]
      );

      const result = {
        code,
        sessionId,
        transactionId,
        redemptionId,
      };

      tx.run(
        `INSERT INTO idempotency_keys(scope, key, result_json, created_at)
         VALUES ('voucher-redeem', ?, ?, ?)`,
        [key, JSON.stringify(result), timestamp]
      );

      return result;
    });

    return Object.freeze({
      voucher: mapVoucher(
        store.all('SELECT * FROM vouchers WHERE code = ?', [code])[0]
      ),
      session: mapSession(
        store.all('SELECT * FROM sessions WHERE id = ?', [sessionId])[0]
      ),
      transactionId: snapshot.transactionId,
      redemptionId: snapshot.redemptionId,
    });
  }

  return Object.freeze({
    create,
    getByCode,
    list,
    redeem,
  });
}

module.exports = {
  createVoucherService,
};
