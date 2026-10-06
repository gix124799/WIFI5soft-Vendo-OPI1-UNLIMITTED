'use strict';

function validateStore(store) {
  if (
    !store ||
    typeof store.all !== 'function' ||
    typeof store.run !== 'function'
  ) {
    throw new TypeError('SQLite store is required');
  }

  return store;
}

function validateSql(sql) {
  if (typeof sql !== 'string' || sql.trim() === '') {
    throw new TypeError('SQL must be a non-empty string');
  }

  return sql;
}

function validateParams(params) {
  if (
    !Array.isArray(params) &&
    !(
      params &&
      typeof params === 'object' &&
      Object.getPrototypeOf(params) === Object.prototype
    )
  ) {
    throw new TypeError('SQL parameters must be an array or plain object');
  }

  return params;
}

function createQueryApi(store) {
  const target = validateStore(store);

  function all(sql, params = []) {
    return target.all(
      validateSql(sql),
      validateParams(params)
    );
  }

  function run(sql, params = []) {
    return target.run(
      validateSql(sql),
      validateParams(params)
    );
  }

  return Object.freeze({
    all,
    run,
  });
}

module.exports = {
  createQueryApi,
};
