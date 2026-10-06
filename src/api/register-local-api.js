'use strict';

const { parseJsonBody } = require('./body');
const { sendJson, sendOk, sendBadRequest } = require('./json');

const LOCAL_API_ALIASES = Object.freeze({
  '/a_1': 'GET /api/v1/health',
  '/a_2': 'GET /api/v1/vendo/rates',
  '/c_2': 'POST /api/v1/vouchers/redeem',
  '/c_3': 'POST /api/v1/vendo/coin-events',
});

function requireRouter(router) {
  if (!router || typeof router.register !== 'function') {
    throw new TypeError('router is required');
  }
}

function requireServices(services) {
  const required = [
    'settings',
    'devices',
    'users',
    'sessions',
    'vouchers',
    'vendo',
    'sales',
    'transactions',
    'pppoe',
    'providers',
    'rental',
    'resellers',
  ];
  for (const name of required) {
    if (!services || !services[name]) {
      throw new TypeError(`service ${name} is required`);
    }
  }
  return services;
}

function getHandler(action) {
  return async (_request, response) => {
    try {
      sendOk(response, await action());
    } catch (error) {
      sendBadRequest(response, error);
    }
  };
}

function postHandler(action) {
  return async (request, response) => {
    try {
      const body = await parseJsonBody(request);
      sendOk(response, await action(body));
    } catch (error) {
      sendBadRequest(response, error);
    }
  };
}

function registerLocalApi(router, suppliedServices) {
  requireRouter(router);
  const services = requireServices(suppliedServices);

  const health = async (_request, response) => {
    sendJson(response, 200, {
      status: 'ok',
      local: true,
      wanRequired: false,
      database: 'sqlite',
    });
  };

  const listRates = getHandler(() => services.vendo.listRates());
  const redeemVoucher = postHandler((body) => services.vouchers.redeem(body));
  const recordCoin = postHandler((body) => services.vendo.recordCoin(body));

  router.register('GET', '/api/v1/health', health);
  router.register('GET', '/a_1', health);

  router.register('GET', '/api/v1/settings', getHandler(() => services.settings.list()));
  router.register('POST', '/api/v1/settings', postHandler(async (body) => {
    await services.settings.set(body.key, body.value);
    return { key: body.key, value: services.settings.get(body.key) };
  }));

  router.register('GET', '/api/v1/devices', getHandler(() => services.devices.list()));
  router.register('POST', '/api/v1/devices', postHandler((body) => services.devices.upsert(body)));

  router.register('GET', '/api/v1/users', getHandler(() => services.users.list()));
  router.register('POST', '/api/v1/users', postHandler((body) => services.users.upsert(body)));

  router.register('GET', '/api/v1/sessions', getHandler(() => services.sessions.list()));
  router.register('POST', '/api/v1/sessions', postHandler((body) => services.sessions.create(body)));
  router.register('POST', '/api/v1/sessions/time/add', postHandler((body) => services.sessions.addTime(body)));
  router.register('POST', '/api/v1/sessions/time/consume', postHandler((body) => services.sessions.consumeTime(body)));

  router.register('GET', '/api/v1/vouchers', getHandler(() => services.vouchers.list()));
  router.register('POST', '/api/v1/vouchers', postHandler((body) => services.vouchers.create(body)));
  router.register('POST', '/api/v1/vouchers/redeem', redeemVoucher);
  router.register('POST', '/c_2', redeemVoucher);

  router.register('GET', '/api/v1/vendo/rates', listRates);
  router.register('GET', '/a_2', listRates);
  router.register('POST', '/api/v1/vendo/rates', postHandler((body) => services.vendo.createRate(body)));
  router.register('POST', '/api/v1/vendo/coin-events', recordCoin);
  router.register('POST', '/c_3', recordCoin);

  router.register('GET', '/api/v1/sales', getHandler(() => services.sales.list()));
  router.register('GET', '/api/v1/transactions', getHandler(() => services.transactions.list()));

  router.register('GET', '/api/v1/pppoe/accounts', getHandler(() => services.pppoe.list()));
  router.register('POST', '/api/v1/pppoe/accounts', postHandler((body) => services.pppoe.create(body)));
  router.register('POST', '/api/v1/pppoe/accounts/update', postHandler((body) => {
    const { id, ...changes } = body;
    return services.pppoe.update(id, changes);
  }));
  router.register('POST', '/api/v1/pppoe/accounts/delete', postHandler(async (body) => ({
    removed: await services.pppoe.remove(body.id),
  })));

  router.register('GET', '/api/v1/providers/operations', getHandler(() => services.providers.list()));
  router.register('POST', '/api/v1/providers/execute', postHandler((body) => services.providers.execute(body)));

  router.register('GET', '/api/v1/rental/devices', getHandler(() => services.rental.list()));
  router.register('POST', '/api/v1/rental/devices', postHandler((body) => services.rental.register(body)));
  router.register('POST', '/api/v1/rental/devices/state', postHandler((body) => services.rental.setState(body.id, body.state)));

  router.register('GET', '/api/v1/resellers', getHandler(() => services.resellers.list()));
  router.register('POST', '/api/v1/resellers', postHandler((body) => services.resellers.create(body)));
  router.register('POST', '/api/v1/resellers/update', postHandler((body) => {
    const { id, ...changes } = body;
    return services.resellers.update(id, changes);
  }));

  return Object.freeze({
    aliases: LOCAL_API_ALIASES,
    routeCount: router.routeCount(),
  });
}

module.exports = {
  LOCAL_API_ALIASES,
  registerLocalApi,
};
