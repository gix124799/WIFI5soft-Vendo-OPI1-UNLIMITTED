'use strict';

const {
  getHttpContract,
} = require('./http-contract');

const {
  createHttpListener,
} = require('./http-listener');

function validateHandler(
  value,
  name
) {
  if (typeof value !== 'function') {
    throw new TypeError(
      `${name} must be a function`
    );
  }

  return value;
}

function validateContract(contract) {
  if (
    !contract ||
    typeof contract !== 'object'
  ) {
    throw new TypeError(
      'contract must be an object'
    );
  }

  if (
    contract.host !== 'localhost' ||
    !contract.upstream3000 ||
    contract.upstream3000.host !== 'localhost' ||
    contract.upstream3000.port !== 3000 ||
    !contract.upstream3001 ||
    contract.upstream3001.host !== 'localhost' ||
    contract.upstream3001.port !== 3001
  ) {
    throw new Error(
      'contract must preserve localhost:3000 and localhost:3001'
    );
  }

  const protectedPorts = new Set([
    contract.reserved &&
      contract.reserved.pppoe &&
      contract.reserved.pppoe.port,

    contract.reserved &&
      contract.reserved.terminal &&
      contract.reserved.terminal.port,

    ...(
      Array.isArray(
        contract.nginxExternalPorts
      )
        ? contract.nginxExternalPorts
        : []
    ),
  ]);

  if (
    protectedPorts.has(3000) ||
    protectedPorts.has(3001)
  ) {
    throw new Error(
      'application ports overlap protected ports'
    );
  }

  return contract;
}

function createHttpServiceGroup(options = {}) {
  const contract = validateContract(
    options.contract || getHttpContract()
  );

  const upstream3000Handler =
    validateHandler(
      options.upstream3000Handler,
      'upstream3000Handler'
    );

  const upstream3001Handler =
    validateHandler(
      options.upstream3001Handler,
      'upstream3001Handler'
    );

  const listenerFactory =
    options.listenerFactory === undefined
      ? createHttpListener
      : options.listenerFactory;

  if (typeof listenerFactory !== 'function') {
    throw new TypeError(
      'listenerFactory must be a function'
    );
  }

  const upstream3000 =
    listenerFactory({
      host: contract.upstream3000.host,
      port: contract.upstream3000.port,
      handler: upstream3000Handler,
    });

  const upstream3001 =
    listenerFactory({
      host: contract.upstream3001.host,
      port: contract.upstream3001.port,
      handler: upstream3001Handler,
    });

  for (
    const [name, listener]
    of [
      ['upstream3000', upstream3000],
      ['upstream3001', upstream3001],
    ]
  ) {
    if (
      !listener ||
      typeof listener.start !== 'function' ||
      typeof listener.stop !== 'function' ||
      typeof listener.isStarted !== 'function'
    ) {
      throw new TypeError(
        `${name} listener is invalid`
      );
    }
  }

  let started = false;
  let starting = null;
  let stopping = null;

  function isStarted() {
    return started;
  }

  function snapshot() {
    return Object.freeze({
      started,

      upstream3000: Object.freeze({
        started:
          upstream3000.isStarted(),
      }),

      upstream3001: Object.freeze({
        started:
          upstream3001.isStarted(),
      }),
    });
  }

  async function startTransaction() {
    let upstream3000Started = false;

    try {
      await upstream3000.start();
      upstream3000Started = true;

      await upstream3001.start();

      started = true;
    } catch (error) {
      started = false;

      if (upstream3000Started) {
        try {
          await upstream3000.stop();
        } catch (_rollbackError) {
          /*
           * Preserve the original startup error.
           * Group state remains stopped.
           */
        }
      }

      throw error;
    }
  }

  async function start() {
    if (started) {
      return;
    }

    if (starting) {
      return starting;
    }

    if (stopping) {
      await stopping;
    }

    starting = startTransaction();

    try {
      await starting;
    } finally {
      starting = null;
    }
  }

  async function stopTransaction() {
    let firstError = null;

    try {
      await upstream3001.stop();
    } catch (error) {
      firstError = error;
    }

    try {
      await upstream3000.stop();
    } catch (error) {
      if (!firstError) {
        firstError = error;
      }
    }

    started = false;

    if (firstError) {
      throw firstError;
    }
  }

  async function stop() {
    if (stopping) {
      return stopping;
    }

    if (starting) {
      try {
        await starting;
      } catch (_error) {
        return;
      }
    }

    if (!started) {
      return;
    }

    stopping = stopTransaction();

    try {
      await stopping;
    } finally {
      stopping = null;
    }
  }

  return Object.freeze({
    start,
    stop,
    isStarted,
    snapshot,
  });
}

module.exports = {
  createHttpServiceGroup,
};
