'use strict';

const { withTransaction } = require('../db/transaction');
const { createId, assertIdempotencyKey } = require('../business/ids');

function assertPositiveSeconds(value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError('seconds must be a positive safe integer');
  }

  return value;
}

function assertInitialSeconds(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('initialSeconds must be a non-negative safe integer');
  }

  return value;
}

function effectiveSession(row, timestamp) {
  if (!row) return undefined;
  let remainingSeconds = row.remaining_seconds;
  let state = row.state;
  if (state === 'active' && row.expires_at !== null && row.expires_at !== undefined) {
    remainingSeconds = Math.max(0, Math.ceil((row.expires_at - timestamp) / 1000));
    if (remainingSeconds === 0) state = 'exhausted';
  }
  return Object.freeze({
    id: row.id,
    deviceId: row.device_id,
    userId: row.user_id,
    remainingSeconds,
    state,
    expiresAt: row.expires_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function createSessionService(options = {}) {
  const store = options.store;
  const now = options.now || Date.now;
  const createIdFn = options.createIdFn || ((prefix) => createId(prefix));

  if (!store || typeof store.all !== 'function') {
    throw new TypeError('SQLite store is required');
  }

  function get(id) {
    if (typeof id !== 'string' || id.trim() === '') {
      throw new TypeError('session id must be a non-empty string');
    }

    return effectiveSession(
      store.all('SELECT * FROM sessions WHERE id = ?', [id])[0],
      now()
    );
  }

  function list() {
    const timestamp = now();
    return store.all(
      'SELECT * FROM sessions ORDER BY created_at, id'
    ).map((row) => effectiveSession(row, timestamp));
  }

  async function create(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new TypeError('session input must be an object');
    }

    if (typeof input.deviceId !== 'string' || input.deviceId.trim() === '') {
      throw new TypeError('deviceId is required');
    }

    if (
      input.userId !== undefined &&
      input.userId !== null &&
      (typeof input.userId !== 'string' || input.userId.trim() === '')
    ) {
      throw new TypeError('userId must be a non-empty string or null');
    }

    const initialSeconds = assertInitialSeconds(input.initialSeconds ?? 0);
    const id = input.id || createIdFn('session');
    const timestamp = now();

    await withTransaction(store, async (tx) => {
      tx.run(
        `INSERT INTO sessions(
           id, device_id, user_id, remaining_seconds, state, created_at, updated_at, expires_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.deviceId,
          input.userId ?? null,
          initialSeconds,
          'active',
          timestamp,
          timestamp,
          initialSeconds > 0 ? timestamp + (initialSeconds * 1000) : null,
        ]
      );

      if (initialSeconds > 0) {
        tx.run(
          `INSERT INTO transactions(
             id, kind, amount_minor, seconds_delta, device_id, user_id,
             session_id, reference, created_at, metadata_json
           ) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, '{}')`,
          [
            createIdFn('transaction'),
            'session_initial_time',
            initialSeconds,
            input.deviceId,
            input.userId ?? null,
            id,
            'session-create',
            timestamp,
          ]
        );
      }
    });

    return get(id);
  }

  function readIdempotency(key) {
    const rows = store.all(
      'SELECT result_json FROM idempotency_keys WHERE scope = ? AND key = ?',
      ['session-time', key]
    );

    if (rows.length === 0) {
      return null;
    }

    return JSON.parse(rows[0].result_json);
  }

  async function changeTime({
    sessionId,
    seconds,
    idempotencyKey,
    direction,
  }) {
    if (typeof sessionId !== 'string' || sessionId.trim() === '') {
      throw new TypeError('sessionId is required');
    }

    const amount = assertPositiveSeconds(seconds);
    const key = assertIdempotencyKey(idempotencyKey);
    const prior = readIdempotency(key);

    if (prior) {
      const current = get(sessionId);
      if (!current) {
        throw new Error('session not found');
      }
      return current;
    }

    const timestamp = now();
    const transactionId = createIdFn('transaction');

    const result = await withTransaction(store, async (tx) => {
      const row = tx.all(
        'SELECT * FROM sessions WHERE id = ?',
        [sessionId]
      )[0];

      if (!row) {
        throw new Error('session not found');
      }

      const effective = effectiveSession(row, timestamp);
      let nextSeconds;
      let delta;
      let nextState;
      let kind;

      if (direction === 'add') {
        nextSeconds = effective.remainingSeconds + amount;
        delta = amount;
        nextState = 'active';
        kind = 'session_time_credit';
      } else {
        if (effective.remainingSeconds < amount) {
          throw new Error('insufficient remaining session time');
        }
        nextSeconds = effective.remainingSeconds - amount;
        delta = -amount;
        nextState = nextSeconds === 0 ? 'exhausted' : 'active';
        kind = 'session_time_debit';
      }

      const expiresAt = nextSeconds > 0 ? timestamp + (nextSeconds * 1000) : null;
      tx.run(
        `UPDATE sessions
         SET remaining_seconds = ?, state = ?, updated_at = ?, expires_at = ?
         WHERE id = ?`,
        [nextSeconds, nextState, timestamp, expiresAt, sessionId]
      );

      tx.run(
        `INSERT INTO transactions(
           id, kind, amount_minor, seconds_delta, device_id, user_id,
           session_id, reference, created_at, metadata_json
         ) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, '{}')`,
        [
          transactionId,
          kind,
          delta,
          row.device_id,
          row.user_id,
          sessionId,
          key,
          timestamp,
        ]
      );

      const snapshot = {
        sessionId,
        transactionId,
        secondsDelta: delta,
      };

      tx.run(
        `INSERT INTO idempotency_keys(scope, key, result_json, created_at)
         VALUES (?, ?, ?, ?)`,
        [
          'session-time',
          key,
          JSON.stringify(snapshot),
          timestamp,
        ]
      );

      return snapshot;
    });

    void result;
    return get(sessionId);
  }

  function addTime(input) {
    return changeTime({ ...input, direction: 'add' });
  }

  function consumeTime(input) {
    return changeTime({ ...input, direction: 'consume' });
  }

  return Object.freeze({
    create,
    get,
    list,
    addTime,
    consumeTime,
  });
}

module.exports = {
  createSessionService,
};
