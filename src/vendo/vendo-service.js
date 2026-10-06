'use strict';

const { withTransaction } = require('../db/transaction');
const { createId } = require('../business/ids');
const { mapSale } = require('../sales/sales-service');
const { mapTransaction } = require('../transactions/transactions-service');

function positiveInt(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return value;
}

function nonNegativeInt(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer`);
  }
  return value;
}

function nonEmpty(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function mapRate(row) {
  if (!row) return undefined;
  return Object.freeze({
    id: row.id,
    amountMinor: row.amount_minor,
    seconds: row.seconds,
    pulses: row.pulses,
    enabled: Boolean(row.enabled),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapSession(row) {
  if (!row) return undefined;
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

function createVendoService(options = {}) {
  const store = options.store;
  const now = options.now || Date.now;
  const createIdFn = options.createIdFn || ((prefix) => createId(prefix));

  if (!store || typeof store.all !== 'function' || typeof store.run !== 'function') {
    throw new TypeError('SQLite store is required');
  }

  async function createRate(input = {}) {
    const amountMinor = positiveInt(input.amountMinor, 'amountMinor');
    const seconds = positiveInt(input.seconds, 'seconds');
    const pulses = positiveInt(input.pulses ?? 1, 'pulses');
    const sortOrder = nonNegativeInt(input.sortOrder ?? 0, 'sortOrder');
    const enabled = input.enabled === undefined ? true : Boolean(input.enabled);
    const timestamp = now();
    const id = input.id || createIdFn('vendo_rate');

    await withTransaction(store, async (tx) => {
      tx.run(
        `INSERT INTO vendo_rates(
           id, amount_minor, seconds, pulses, enabled,
           sort_order, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, amountMinor, seconds, pulses, enabled ? 1 : 0, sortOrder, timestamp, timestamp]
      );
    });

    return mapRate(store.all('SELECT * FROM vendo_rates WHERE id = ?', [id])[0]);
  }

  function listRates() {
    return store.all(
      'SELECT * FROM vendo_rates ORDER BY sort_order, amount_minor, id'
    ).map(mapRate);
  }

  function resultFromEvent(eventKey) {
    const event = store.all(
      'SELECT * FROM coin_events WHERE event_key = ?',
      [eventKey]
    )[0];
    if (!event) return null;

    const transaction = store.all(
      'SELECT * FROM transactions WHERE id = ?',
      [event.transaction_id]
    )[0];
    const sale = store.all('SELECT * FROM sales WHERE id = ?', [event.sale_id])[0];
    const session = transaction && transaction.session_id
      ? store.all('SELECT * FROM sessions WHERE id = ?', [transaction.session_id])[0]
      : undefined;

    return Object.freeze({
      event: Object.freeze({
        id: event.id,
        source: event.source,
        eventKey: event.event_key,
        pulses: event.pulses,
        amountMinor: event.amount_minor,
        occurredAt: event.occurred_at,
      }),
      sale: mapSale(sale),
      transaction: mapTransaction(transaction),
      session: mapSession(session),
    });
  }

  async function recordCoin(input = {}) {
    const sessionId = nonEmpty(input.sessionId, 'sessionId');
    const source = nonEmpty(input.source, 'source');
    const eventKey = nonEmpty(input.eventKey, 'eventKey');
    const pulses = positiveInt(input.pulses, 'pulses');

    const prior = resultFromEvent(eventKey);
    if (prior) return prior;

    const timestamp = now();
    const eventId = createIdFn('coin_event');
    const saleId = createIdFn('sale');
    const transactionId = createIdFn('transaction');

    await withTransaction(store, async (tx) => {
      const rate = tx.all(
        `SELECT * FROM vendo_rates
         WHERE pulses = ? AND enabled = 1
         ORDER BY sort_order, amount_minor, id
         LIMIT 1`,
        [pulses]
      )[0];
      if (!rate) {
        throw new Error('no enabled vendo rate matches coin pulses');
      }

      const session = tx.all('SELECT * FROM sessions WHERE id = ?', [sessionId])[0];
      if (!session) {
        throw new Error('session not found');
      }

      const nextSeconds = session.remaining_seconds + rate.seconds;
      tx.run(
        `UPDATE sessions
         SET remaining_seconds = ?, state = 'active', updated_at = ?
         WHERE id = ?`,
        [nextSeconds, timestamp, sessionId]
      );

      tx.run(
        `INSERT INTO sales(
           id, kind, amount_minor, seconds, status, created_at, metadata_json
         ) VALUES (?, 'coin', ?, ?, 'completed', ?, '{}')`,
        [saleId, rate.amount_minor, rate.seconds, timestamp]
      );

      tx.run(
        `INSERT INTO transactions(
           id, kind, amount_minor, seconds_delta, device_id, user_id,
           session_id, sale_id, reference, created_at, metadata_json
         ) VALUES (?, 'coin_credit', ?, ?, ?, ?, ?, ?, ?, ?, '{}')`,
        [
          transactionId,
          rate.amount_minor,
          rate.seconds,
          session.device_id,
          session.user_id,
          sessionId,
          saleId,
          eventKey,
          timestamp,
        ]
      );

      tx.run(
        `INSERT INTO coin_events(
           id, source, event_key, pulses, amount_minor, occurred_at,
           transaction_id, sale_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [eventId, source, eventKey, pulses, rate.amount_minor, timestamp, transactionId, saleId]
      );
    });

    return resultFromEvent(eventKey);
  }

  return Object.freeze({
    createRate,
    listRates,
    recordCoin,
  });
}

module.exports = {
  createVendoService,
};
