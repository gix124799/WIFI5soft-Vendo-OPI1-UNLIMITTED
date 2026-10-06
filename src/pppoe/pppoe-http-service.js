'use strict';

const { createRouter } = require('../http/router');
const { createHttpListener } = require('../http/http-listener');
const { parseJsonBody } = require('../api/body');
const { sendJson, sendOk, sendBadRequest } = require('../api/json');

function createPppoeHttpService(options = {}) {
  const pppoe = options.pppoe;
  const logger = options.logger;
  const listenerFactory = options.listenerFactory || ((config) => createHttpListener(config));
  if (!pppoe || typeof pppoe.list !== 'function') throw new TypeError('PPPoE service is required');
  if (typeof listenerFactory !== 'function') throw new TypeError('listenerFactory is required');

  const router = createRouter({ logger });
  const get = (action) => async (_req, res) => {
    try { sendOk(res, await action()); } catch (error) { sendBadRequest(res, error); }
  };
  const post = (action) => async (req, res) => {
    try { sendOk(res, await action(await parseJsonBody(req))); } catch (error) { sendBadRequest(res, error); }
  };
  router.register('GET', '/', async (_req, res) => sendJson(res, 200, {
    status: 'ok', service: 'pppoe', local: true, wanRequired: false, database: 'sqlite'
  }));
  router.register('GET', '/api/v1/pppoe/accounts', get(() => pppoe.list()));
  router.register('POST', '/api/v1/pppoe/accounts', post((body) => pppoe.create(body)));
  router.register('POST', '/api/v1/pppoe/accounts/update', post((body) => {
    const { id, ...changes } = body; return pppoe.update(id, changes);
  }));
  router.register('POST', '/api/v1/pppoe/accounts/delete', post(async (body) => ({ removed: await pppoe.remove(body.id) })));

  const listener = listenerFactory({
    host: 'localhost',
    port: 3002,
    handler: (request, response) => router.handle(request, response),
  });
  return Object.freeze({
    start: listener.start,
    stop: listener.stop,
    isStarted: listener.isStarted,
    router,
  });
}

module.exports = { createPppoeHttpService };
