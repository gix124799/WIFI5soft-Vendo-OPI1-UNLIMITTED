'use strict';

function createAccessReconciler(options = {}) {
  const sessions = options.sessions;
  const devices = options.devices;
  const adapter = options.adapter;
  const logger = options.logger || { warn() {} };
  const setIntervalFn = options.setIntervalFn || setInterval;
  const clearIntervalFn = options.clearIntervalFn || clearInterval;
  const intervalMs = options.intervalMs ?? 5000;
  if (!sessions || typeof sessions.list !== 'function') throw new TypeError('session service is required');
  if (!devices || typeof devices.get !== 'function') throw new TypeError('device service is required');
  if (!adapter || typeof adapter.sync !== 'function') throw new TypeError('access adapter is required');
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1000) throw new TypeError('access interval must be at least 1000ms');
  let timer = null;
  let running = false;

  async function reconcile() {
    const entries = [];
    for (const session of sessions.list()) {
      if (session.state !== 'active' || session.remainingSeconds <= 0) continue;
      const device = devices.get(session.deviceId);
      if (!device || !device.mac) continue;
      entries.push(Object.freeze({ mac: device.mac, remainingSeconds: session.remainingSeconds }));
    }
    await adapter.sync(entries);
    return Object.freeze(entries);
  }

  async function start() {
    if (running) return;
    await reconcile();
    timer = setIntervalFn(() => {
      Promise.resolve(reconcile()).catch((error) => logger.warn('access reconciliation failed', { error: error.message }));
    }, intervalMs);
    if (timer && typeof timer.unref === 'function') timer.unref();
    running = true;
  }

  async function stop() {
    if (!running) return;
    if (timer !== null) clearIntervalFn(timer);
    timer = null;
    running = false;
  }

  return Object.freeze({ reconcile, start, stop, isStarted: () => running });
}

module.exports = { createAccessReconciler };
