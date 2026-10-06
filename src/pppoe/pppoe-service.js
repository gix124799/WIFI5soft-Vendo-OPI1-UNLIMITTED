'use strict';

const { withTransaction } = require('../db/transaction');
const { createId } = require('../business/ids');

const PPPoE_LOCAL_BACKEND = Object.freeze({
  host: '127.0.0.1',
  port: 3002,
  wanRequired: false,
});

function nonEmpty(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function mapPublic(row) {
  if (!row) return undefined;
  return Object.freeze({
    id: row.id,
    username: row.username,
    profile: row.profile,
    enabled: Boolean(row.enabled),
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapPrivate(row) {
  if (!row) return undefined;
  return Object.freeze({
    ...mapPublic(row),
    secret: row.secret,
  });
}

function createPppoeService(options = {}) {
  const store = options.store;
  const now = options.now || Date.now;
  const createIdFn = options.createIdFn || ((prefix) => createId(prefix));
  const adapter = options.adapter || {};

  if (!store || typeof store.all !== 'function' || typeof store.run !== 'function') {
    throw new TypeError('SQLite store is required');
  }

  const apply = typeof adapter.upsertAccount === 'function'
    ? adapter.upsertAccount.bind(adapter)
    : async () => {};
  const removeFromSystem = typeof adapter.removeAccount === 'function'
    ? adapter.removeAccount.bind(adapter)
    : async () => {};

  function getRow(id) {
    return store.all('SELECT * FROM pppoe_accounts WHERE id = ?', [id])[0];
  }

  function get(id) {
    return mapPublic(getRow(nonEmpty(id, 'account id')));
  }

  function list() {
    return store.all(
      'SELECT * FROM pppoe_accounts ORDER BY created_at, id'
    ).map(mapPublic);
  }

  async function create(input = {}) {
    const username = nonEmpty(input.username, 'username');
    const secret = nonEmpty(input.secret, 'secret');
    const profile = input.profile == null ? null : nonEmpty(input.profile, 'profile');
    const enabled = input.enabled === undefined ? true : Boolean(input.enabled);
    const expiresAt = input.expiresAt == null ? null : input.expiresAt;
    if (expiresAt !== null && (!Number.isSafeInteger(expiresAt) || expiresAt < 0)) {
      throw new TypeError('expiresAt must be a non-negative safe integer or null');
    }

    const id = input.id || createIdFn('pppoe_account');
    const timestamp = now();
    const candidate = {
      id,
      username,
      secret,
      profile,
      enabled,
      expiresAt,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await withTransaction(store, async (tx) => {
      tx.run(
        `INSERT INTO pppoe_accounts(
           id, username, secret, profile, enabled, expires_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, username, secret, profile, enabled ? 1 : 0, expiresAt, timestamp, timestamp]
      );
      await apply(Object.freeze({ ...candidate }));
    });

    return get(id);
  }

  async function update(id, changes = {}) {
    const accountId = nonEmpty(id, 'account id');
    const existing = getRow(accountId);
    if (!existing) throw new Error('PPPoE account not found');

    const username = changes.username === undefined
      ? existing.username
      : nonEmpty(changes.username, 'username');
    const secret = changes.secret === undefined
      ? existing.secret
      : nonEmpty(changes.secret, 'secret');
    const profile = changes.profile === undefined
      ? existing.profile
      : (changes.profile == null ? null : nonEmpty(changes.profile, 'profile'));
    const enabled = changes.enabled === undefined
      ? Boolean(existing.enabled)
      : Boolean(changes.enabled);
    const expiresAt = changes.expiresAt === undefined
      ? existing.expires_at
      : changes.expiresAt;
    if (expiresAt !== null && (!Number.isSafeInteger(expiresAt) || expiresAt < 0)) {
      throw new TypeError('expiresAt must be a non-negative safe integer or null');
    }

    const timestamp = now();
    const candidate = {
      id: accountId,
      username,
      secret,
      profile,
      enabled,
      expiresAt,
      createdAt: existing.created_at,
      updatedAt: timestamp,
    };

    await withTransaction(store, async (tx) => {
      tx.run(
        `UPDATE pppoe_accounts
         SET username = ?, secret = ?, profile = ?, enabled = ?, expires_at = ?, updated_at = ?
         WHERE id = ?`,
        [username, secret, profile, enabled ? 1 : 0, expiresAt, timestamp, accountId]
      );
      await apply(Object.freeze({ ...candidate }));
    });

    return get(accountId);
  }

  async function remove(id) {
    const accountId = nonEmpty(id, 'account id');
    const existing = getRow(accountId);
    if (!existing) return false;

    await withTransaction(store, async (tx) => {
      await removeFromSystem(mapPrivate(existing));
      tx.run('DELETE FROM pppoe_accounts WHERE id = ?', [accountId]);
    });

    return true;
  }

  return Object.freeze({
    backend: PPPoE_LOCAL_BACKEND,
    create,
    update,
    remove,
    get,
    list,
  });
}

module.exports = {
  PPPoE_LOCAL_BACKEND,
  createPppoeService,
};
