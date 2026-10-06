'use strict';

const { STATES } = require('./subsystem-registry');

function createApp({ config, logger, registry, store } = {}) {
  if (!config || typeof config !== 'object') throw new TypeError('config is required');
  if (!logger || typeof logger.info !== 'function' || typeof logger.error !== 'function') {
    throw new TypeError('logger is required');
  }
  if (!registry || typeof registry.set !== 'function' || typeof registry.snapshot !== 'function' || typeof registry.overall !== 'function') {
    throw new TypeError('registry is required');
  }
  if (!store || typeof store.readUtf8 !== 'function' || typeof store.writeUtf8 !== 'function') {
    throw new TypeError('store is required');
  }

  let started = false;
  let startPromise = null;
  let stopPromise = null;

  async function start() {
    if (started) return;
    if (startPromise) return startPromise;
    startPromise = (async () => {
      registry.set('storage', STATES.READY);
      registry.set('core', STATES.READY);
      started = true;
    })();
    try { await startPromise; } finally { startPromise = null; }
  }

  async function stop() {
    if (stopPromise) return stopPromise;
    if (startPromise) await startPromise;
    if (!started) return;
    stopPromise = (async () => {
      registry.set('core', STATES.DISABLED);
      registry.set('storage', STATES.DISABLED);
      started = false;
    })();
    try { await stopPromise; } finally { stopPromise = null; }
  }

  function health() {
    return Object.freeze({ overall: registry.overall(), subsystems: registry.snapshot() });
  }

  return Object.freeze({ start, stop, health, isStarted: () => started });
}

function defaultServices({ store, providerAdapters = {}, pppoeAdapter = {} }) {
  const { createSettingsService } = require('../settings/settings-service');
  const { createDeviceService } = require('../devices/device-service');
  const { createUserService } = require('../users/user-service');
  const { createSessionService } = require('../session/session-service');
  const { createVoucherService } = require('../voucher/voucher-service');
  const { createVendoService } = require('../vendo/vendo-service');
  const { createSalesService } = require('../sales/sales-service');
  const { createTransactionsService } = require('../transactions/transactions-service');
  const { createPppoeService } = require('../pppoe/pppoe-service');
  const { createProviderOperationService } = require('../providers/provider-operation-service');
  const { createRentalService } = require('../rental/rental-service');
  const { createResellerService } = require('../reseller/reseller-service');

  return Object.freeze({
    settings: createSettingsService({ store }),
    devices: createDeviceService({ store }),
    users: createUserService({ store }),
    sessions: createSessionService({ store }),
    vouchers: createVoucherService({ store }),
    vendo: createVendoService({ store }),
    sales: createSalesService({ store }),
    transactions: createTransactionsService({ store }),
    pppoe: createPppoeService({ store, adapter: pppoeAdapter }),
    providers: createProviderOperationService({ store, adapters: providerAdapters }),
    rental: createRentalService({ store }),
    resellers: createResellerService({ store }),
  });
}


function defaultAccess({ services, logger }) {
  const { createOpenWrtAccessAdapter } = require('../network/openwrt-access-adapter');
  const { createAccessReconciler } = require('../network/access-reconciler');
  return createAccessReconciler({
    sessions: services.sessions,
    devices: services.devices,
    adapter: createOpenWrtAccessAdapter(),
    logger,
  });
}

function createProductionApp(options = {}) {
  const config = options.config;
  const logger = options.logger;
  if (!config || typeof config.stateRoot !== 'string') throw new TypeError('config with stateRoot is required');
  if (!logger || typeof logger.info !== 'function' || typeof logger.error !== 'function') throw new TypeError('logger is required');

  const openStore = options.openStore || require('../db/sqlite-store').openSqliteStore;
  const migrate = options.migrate || require('../db/migrations').applyMigrations;
  const createHttp = options.createHttp || require('../http').createHttpLayer;
  const createDhcp = options.createDhcp || require('../network/dhcp-event-listener').createDhcpEventListener;
  const createPppoeHttp = options.createPppoeHttp || require('../pppoe/pppoe-http-service').createPppoeHttpService;
  const createAccess = options.createAccess || defaultAccess;
  const createServices = options.createServices || defaultServices;
  const registerApi = options.registerApi || require('../api/register-local-api').registerLocalApi;
  const providerAdapters = options.providerAdapters || {};
  const pppoeAdapter = options.pppoeAdapter || (config.openwrt === true
    ? require('../pppoe/openwrt-pppoe-adapter').createOpenWrtPppoeAdapter()
    : {});

  let started = false;
  let starting = null;
  let stopping = null;
  let store = null;
  let http = null;
  let dhcp = null;
  let pppoeHttp = null;
  let access = null;
  let services = null;

  async function startTransaction() {
    try {
      store = await openStore({ stateRoot: config.stateRoot });
      await migrate(store);
      services = createServices({ store, providerAdapters, pppoeAdapter, logger, config });
      http = createHttp({ logger });
      registerApi(http.upstream3000Router, services);
      pppoeHttp = createPppoeHttp({ pppoe: services.pppoe, logger });
      dhcp = createDhcp({ devices: services.devices, logger });
      await dhcp.start();
      await pppoeHttp.start();
      if (config.openwrt === true) {
        access = createAccess({ services, logger, config });
        await access.start();
      }
      await http.start();
      started = true;
    } catch (error) {
      started = false;
      if (http && typeof http.stop === 'function') {
        try { await http.stop(); } catch (_stopError) {}
      }
      if (pppoeHttp && typeof pppoeHttp.stop === 'function') {
        try { await pppoeHttp.stop(); } catch (_stopError) {}
      }
      if (access && typeof access.stop === 'function') {
        try { await access.stop(); } catch (_stopError) {}
      }
      if (dhcp && typeof dhcp.stop === 'function') {
        try { await dhcp.stop(); } catch (_stopError) {}
      }
      if (store && typeof store.close === 'function') {
        try { await store.close(); } catch (_closeError) {}
      }
      http = null;
      pppoeHttp = null;
      access = null;
      dhcp = null;
      store = null;
      services = null;
      throw error;
    }
  }

  async function start() {
    if (started) return;
    if (starting) return starting;
    if (stopping) await stopping;
    starting = startTransaction();
    try { await starting; } finally { starting = null; }
  }

  async function stopTransaction() {
    let firstError = null;
    if (http && typeof http.stop === 'function') {
      try { await http.stop(); } catch (error) { firstError = error; }
    }
    if (pppoeHttp && typeof pppoeHttp.stop === 'function') {
      try { await pppoeHttp.stop(); } catch (error) { if (!firstError) firstError = error; }
    }
    if (access && typeof access.stop === 'function') {
      try { await access.stop(); } catch (error) { if (!firstError) firstError = error; }
    }
    if (dhcp && typeof dhcp.stop === 'function') {
      try { await dhcp.stop(); } catch (error) { if (!firstError) firstError = error; }
    }
    if (store && typeof store.close === 'function') {
      try { await store.close(); } catch (error) { if (!firstError) firstError = error; }
    }
    started = false;
    http = null;
    pppoeHttp = null;
    access = null;
    dhcp = null;
    store = null;
    services = null;
    if (firstError) throw firstError;
  }

  async function stop() {
    if (stopping) return stopping;
    if (starting) {
      try { await starting; } catch (_error) { return; }
    }
    if (!started) return;
    stopping = stopTransaction();
    try { await stopping; } finally { stopping = null; }
  }

  function health() {
    return Object.freeze({
      started,
      local: true,
      wanRequired: false,
      database: 'sqlite',
      legacyCoreAllowed: false,
      http: http && typeof http.snapshot === 'function' ? http.snapshot() : null,
      pppoe: pppoeHttp ? Object.freeze({ started: pppoeHttp.isStarted() }) : null,
    });
  }

  return Object.freeze({
    start,
    stop,
    health,
    isStarted: () => started,
    services: () => services,
    http: () => http,
  });
}

module.exports = {
  createApp,
  createProductionApp,
};
