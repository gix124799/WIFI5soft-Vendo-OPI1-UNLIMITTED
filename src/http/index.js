'use strict';

const {
  getHttpContract,
} = require('./http-contract');

const {
  createRouter,
} = require('./router');

const {
  createHttpListener,
} = require('./http-listener');

const {
  createHttpServiceGroup,
} = require('./http-service-group');

function validateOptionalFactory(
  value,
  name
) {
  if (
    value !== undefined &&
    typeof value !== 'function'
  ) {
    throw new TypeError(
      `${name} must be a function`
    );
  }

  return value;
}

function createHttpLayer(options = {}) {
  const logger = options.logger;

  const serverFactory =
    validateOptionalFactory(
      options.serverFactory,
      'serverFactory'
    );

  const suppliedListenerFactory =
    validateOptionalFactory(
      options.listenerFactory,
      'listenerFactory'
    );

  if (
    serverFactory !== undefined &&
    suppliedListenerFactory !== undefined
  ) {
    throw new Error(
      'serverFactory and listenerFactory cannot be supplied together'
    );
  }

  const contract = getHttpContract();

  const upstream3000Router =
    createRouter({
      logger,
    });

  const upstream3001Router =
    createRouter({
      logger,
    });

  const upstream3000Handler =
    (request, response) => {
      return upstream3000Router.handle(
        request,
        response
      );
    };

  const upstream3001Handler =
    (request, response) => {
      return upstream3001Router.handle(
        request,
        response
      );
    };

  let listenerFactory =
    suppliedListenerFactory;

  if (
    listenerFactory === undefined &&
    serverFactory !== undefined
  ) {
    listenerFactory = (config) => {
      return createHttpListener({
        ...config,
        serverFactory,
      });
    };
  }

  const groupOptions = {
    contract,
    upstream3000Handler,
    upstream3001Handler,
  };

  if (listenerFactory !== undefined) {
    groupOptions.listenerFactory =
      listenerFactory;
  }

  const serviceGroup =
    createHttpServiceGroup(
      groupOptions
    );

  return Object.freeze({
    contract,
    upstream3000Router,
    upstream3001Router,
    start: serviceGroup.start,
    stop: serviceGroup.stop,
    isStarted: serviceGroup.isStarted,
    snapshot: serviceGroup.snapshot,
  });
}

module.exports = {
  createHttpLayer,
};
