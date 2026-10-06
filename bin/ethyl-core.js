#!/usr/bin/env node
'use strict';

const { loadConfig } = require('../src/config/load-config');
const { createLogger } = require('../src/logging/logger');
const { createProductionApp } = require('../src/core/app');

async function main({
  processImpl = process,
  appFactory = createProductionApp,
  providerAdapters = {},
} = {}) {
  const config = loadConfig(processImpl.env);
  const logger = createLogger({ level: config.logLevel });
  const app = appFactory({
    config,
    logger,
    providerAdapters,
  });

  await app.start();
  logger.info('ETHYLNET local backend started', {
    database: 'sqlite',
    wanRequired: false,
  });

  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;

    try {
      logger.info('ETHYLNET local backend stopping', { signal });
      await app.stop();
      logger.info('ETHYLNET local backend stopped', { signal });
    } catch (error) {
      logger.error('ETHYLNET local backend shutdown failed', {
        signal,
        error: error instanceof Error ? error.message : String(error),
      });
      processImpl.exitCode = 1;
    }
  }

  processImpl.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  processImpl.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  return Object.freeze({ app, shutdown });
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(
      String(error && error.stack ? error.stack : error) + '\n'
    );
    process.exitCode = 1;
  });
}

module.exports = {
  main,
};
