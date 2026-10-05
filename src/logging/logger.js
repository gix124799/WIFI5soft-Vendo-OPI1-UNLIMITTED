'use strict';

const LEVEL_ORDER = Object.freeze({
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
});

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'secret',
  'vouchersecret'
]);

function sanitize(value) {
  if (Array.isArray(value)) {
    return value.map(item => sanitize(item));
  }

  if (
    value !== null &&
    typeof value === 'object'
  ) {
    const result = {};

    for (const [key, item] of Object.entries(value)) {
      if (
        SENSITIVE_KEYS.has(
          key.toLowerCase()
        )
      ) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = sanitize(item);
      }
    }

    return result;
  }

  return value;
}

function createLogger({
  level = 'info',
  write = line => process.stdout.write(
    line + '\n'
  ),
  clock = () => new Date()
} = {}) {
  if (
    !Object.prototype.hasOwnProperty.call(
      LEVEL_ORDER,
      level
    )
  ) {
    throw new TypeError(
      `invalid log level: ${level}`
    );
  }

  function emit(entryLevel, message, fields) {
    if (
      LEVEL_ORDER[entryLevel] <
      LEVEL_ORDER[level]
    ) {
      return;
    }

    const now = clock();

    if (
      !now ||
      typeof now.toISOString !== 'function'
    ) {
      throw new TypeError(
        'clock must return a Date-like value'
      );
    }

    const record = {
      ts: now.toISOString(),
      level: entryLevel,
      message
    };

    if (fields !== undefined) {
      record.fields = sanitize(fields);
    }

    write(JSON.stringify(record));
  }

  return Object.freeze({
    debug(message, fields) {
      emit('debug', message, fields);
    },

    info(message, fields) {
      emit('info', message, fields);
    },

    warn(message, fields) {
      emit('warn', message, fields);
    },

    error(message, fields) {
      emit('error', message, fields);
    }
  });
}

module.exports = {
  createLogger
};
