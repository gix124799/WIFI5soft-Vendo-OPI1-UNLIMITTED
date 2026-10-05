'use strict';

function validateStore(store) {
  if (
    !store ||
    typeof store.exec !== 'function' ||
    typeof store.run !== 'function' ||
    typeof store.all !== 'function' ||
    typeof store.persist !== 'function'
  ) {
    throw new TypeError('transaction requires a SQLite store');
  }

  return store;
}

async function withTransaction(store, operation) {
  const target = validateStore(store);

  if (typeof operation !== 'function') {
    throw new TypeError('transaction operation must be a function');
  }

  target.exec('BEGIN IMMEDIATE');

  let result;

  try {
    result = await operation(target);
    target.exec('COMMIT');
  } catch (error) {
    try {
      target.exec('ROLLBACK');
    } catch (_rollbackError) {
      // Preserve the business/SQL failure.
    }

    throw error;
  }

  await target.persist();
  return result;
}

module.exports = {
  withTransaction,
};
