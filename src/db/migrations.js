'use strict';

const {
  CURRENT_SCHEMA_VERSION,
  getSchemaStatements,
} = require('./schema');

function readUserVersion(store) {
  const rows = store.all('PRAGMA user_version');

  if (
    rows.length !== 1 ||
    !Number.isInteger(rows[0].user_version)
  ) {
    throw new Error('unable to read SQLite schema version');
  }

  return rows[0].user_version;
}

async function migrateFromZero(store) {
  store.exec('BEGIN IMMEDIATE');

  try {
    for (const sql of getSchemaStatements()) {
      store.exec(sql);
    }

    store.run(
      'INSERT INTO schema_meta(key, value) VALUES (?, ?)',
      ['schema_version', String(CURRENT_SCHEMA_VERSION)]
    );

    store.exec(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION}`);
    store.exec('COMMIT');
  } catch (error) {
    try {
      store.exec('ROLLBACK');
    } catch (_rollbackError) {
      // Preserve the migration failure.
    }

    throw error;
  }

  await store.persist();
}

async function applyMigrations(store) {
  if (
    !store ||
    typeof store.all !== 'function' ||
    typeof store.run !== 'function' ||
    typeof store.exec !== 'function' ||
    typeof store.persist !== 'function'
  ) {
    throw new TypeError('SQLite store is required');
  }

  store.exec('PRAGMA foreign_keys = ON');

  const version = readUserVersion(store);

  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `unsupported future SQLite schema version ${version}`
    );
  }

  if (version === CURRENT_SCHEMA_VERSION) {
    return;
  }

  if (version !== 0) {
    throw new Error(
      `unsupported SQLite schema migration from version ${version}`
    );
  }

  await migrateFromZero(store);
}

module.exports = {
  applyMigrations,
};
