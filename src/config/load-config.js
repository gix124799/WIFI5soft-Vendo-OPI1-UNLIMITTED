'use strict';

const path = require('node:path');

const VALID_LOG_LEVELS = Object.freeze([
  'debug',
  'info',
  'warn',
  'error'
]);

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function loadConfig(env = process.env) {
  if (env === null || typeof env !== 'object') {
    throw new TypeError('environment must be an object');
  }

  const rawStateRoot = hasOwn(env, 'ETHYL_STATE_ROOT')
    ? env.ETHYL_STATE_ROOT
    : '/mnt/wifi5';

  if (
    typeof rawStateRoot !== 'string' ||
    rawStateRoot.trim() === ''
  ) {
    throw new TypeError('state root must not be blank');
  }

  if (!path.isAbsolute(rawStateRoot)) {
    throw new TypeError('state root must be an absolute path');
  }

  const rawLogLevel = hasOwn(env, 'ETHYL_LOG_LEVEL')
    ? env.ETHYL_LOG_LEVEL
    : 'info';

  if (
    typeof rawLogLevel !== 'string' ||
    !VALID_LOG_LEVELS.includes(rawLogLevel)
  ) {
    throw new TypeError('invalid log level');
  }

  return Object.freeze({
    stateRoot: path.normalize(rawStateRoot),
    logLevel: rawLogLevel
  });
}

module.exports = {
  loadConfig,
  VALID_LOG_LEVELS
};
