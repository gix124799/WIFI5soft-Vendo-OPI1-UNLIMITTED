'use strict';

const {
  STATES
} = require('./subsystem-registry');

function createApp({
  config,
  logger,
  registry,
  store
} = {}) {
  if (
    !config ||
    typeof config !== 'object'
  ) {
    throw new TypeError(
      'config is required'
    );
  }

  if (
    !logger ||
    typeof logger.info !== 'function' ||
    typeof logger.error !== 'function'
  ) {
    throw new TypeError(
      'logger is required'
    );
  }

  if (
    !registry ||
    typeof registry.set !== 'function' ||
    typeof registry.snapshot !== 'function' ||
    typeof registry.overall !== 'function'
  ) {
    throw new TypeError(
      'registry is required'
    );
  }

  if (
    !store ||
    typeof store.readUtf8 !== 'function' ||
    typeof store.writeUtf8 !== 'function'
  ) {
    throw new TypeError(
      'store is required'
    );
  }

  let started = false;
  let startPromise = null;
  let stopPromise = null;

  async function start() {
    if (started) {
      return;
    }

    if (startPromise) {
      return startPromise;
    }

    startPromise = (async () => {
      registry.set(
        'storage',
        STATES.READY
      );

      registry.set(
        'core',
        STATES.READY
      );

      started = true;
    })();

    try {
      await startPromise;
    } finally {
      startPromise = null;
    }
  }

  async function stop() {
    if (stopPromise) {
      return stopPromise;
    }

    if (startPromise) {
      await startPromise;
    }

    if (!started) {
      return;
    }

    stopPromise = (async () => {
      registry.set(
        'core',
        STATES.DISABLED
      );

      registry.set(
        'storage',
        STATES.DISABLED
      );

      started = false;
    })();

    try {
      await stopPromise;
    } finally {
      stopPromise = null;
    }
  }

  function health() {
    return Object.freeze({
      overall: registry.overall(),
      subsystems: registry.snapshot()
    });
  }

  function isStarted() {
    return started;
  }

  return Object.freeze({
    start,
    stop,
    health,
    isStarted
  });
}

module.exports = {
  createApp
};
