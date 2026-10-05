#!/usr/bin/env node
'use strict';

const {
  loadConfig
} = require('../src/config/load-config');

const {
  createLogger
} = require('../src/logging/logger');

const {
  createSubsystemRegistry
} = require('../src/core/subsystem-registry');

const {
  createAtomicFileStore
} = require('../src/storage/atomic-file-store');

const {
  createApp
} = require('../src/core/app');

async function main({
  processImpl = process
} = {}) {
  const config = loadConfig(
    processImpl.env
  );

  const logger = createLogger({
    level: config.logLevel
  });

  const registry = createSubsystemRegistry([
    'core',
    'storage'
  ]);

  const store = createAtomicFileStore({
    root: config.stateRoot
  });

  const app = createApp({
    config,
    logger,
    registry,
    store
  });

  await app.start();

  logger.info(
    'ETHYLNET foundation started'
  );

  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    try {
      logger.info(
        'ETHYLNET foundation stopping',
        { signal }
      );

      await app.stop();

      logger.info(
        'ETHYLNET foundation stopped',
        { signal }
      );
    } catch (error) {
      logger.error(
        'ETHYLNET foundation shutdown failed',
        {
          signal,
          error:
            error instanceof Error
              ? error.message
              : String(error)
        }
      );

      processImpl.exitCode = 1;
    }
  }

  processImpl.once(
    'SIGINT',
    () => {
      void shutdown('SIGINT');
    }
  );

  processImpl.once(
    'SIGTERM',
    () => {
      void shutdown('SIGTERM');
    }
  );

  return Object.freeze({
    app,
    shutdown
  });
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(
      String(
        error && error.stack
          ? error.stack
          : error
      ) + '\n'
    );

    process.exitCode = 1;
  });
}

module.exports = {
  main
};
