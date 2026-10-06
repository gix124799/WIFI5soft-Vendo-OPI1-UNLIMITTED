'use strict';

const net = require('node:net');

const VALID_ACTIONS = Object.freeze(new Set(['add', 'old', 'del']));
const MAX_BUFFER_BYTES = 4096;

function parseDhcpEventLine(line) {
  if (typeof line !== 'string' || line.trim() === '') throw new TypeError('DHCP event line must be non-empty');
  const parts = line.trim().split(/\s+/);
  if (parts.length < 5 || parts.length > 6) throw new TypeError('DHCP event line has invalid field count');
  const [action, ip, mac, iface, leaseRaw, hostname = null] = parts;
  if (!VALID_ACTIONS.has(action)) throw new TypeError('unsupported DHCP event action');
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) throw new TypeError('DHCP event IP is invalid');
  if (!/^[0-9a-f]{2}(?::[0-9a-f]{2}){5}$/i.test(mac)) throw new TypeError('DHCP event MAC is invalid');
  if (!iface) throw new TypeError('DHCP event interface is required');
  const leaseExpires = Number(leaseRaw);
  if (!Number.isSafeInteger(leaseExpires) || leaseExpires < 0) throw new TypeError('DHCP lease expiry is invalid');
  return Object.freeze({
    action,
    ip,
    mac: mac.toLowerCase(),
    interface: iface,
    leaseExpires,
    hostname,
  });
}

function createDhcpEventListener(options = {}) {
  const devices = options.devices;
  const netImpl = options.netImpl || net;
  const logger = options.logger || { warn() {} };
  if (!devices || typeof devices.upsert !== 'function') throw new TypeError('device service is required');
  if (!netImpl || typeof netImpl.createServer !== 'function') throw new TypeError('net implementation is required');

  let server = null;
  let started = false;
  let starting = null;
  let stopping = null;

  async function applyEvent(event) {
    await devices.upsert({
      mac: event.mac,
      name: event.hostname || undefined,
      metadata: {
        ip: event.ip,
        interface: event.interface,
        leaseExpires: event.leaseExpires,
        dhcpAction: event.action,
        released: event.action === 'del',
      },
    });
  }

  function onConnection(socket) {
    let buffer = '';
    let chain = Promise.resolve();
    socket.on('data', (chunk) => {
      buffer += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      if (Buffer.byteLength(buffer, 'utf8') > MAX_BUFFER_BYTES) {
        buffer = '';
        logger.warn('DHCP event buffer exceeded limit');
        return;
      }
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        chain = chain.then(async () => {
          try { await applyEvent(parseDhcpEventLine(line)); }
          catch (error) { logger.warn('DHCP event rejected', { error: error.message }); }
        });
      }
    });
    socket.on('end', () => {
      if (!buffer.trim()) return;
      const line = buffer;
      buffer = '';
      chain = chain.then(async () => {
        try { await applyEvent(parseDhcpEventLine(line)); }
        catch (error) { logger.warn('DHCP event rejected', { error: error.message }); }
      });
    });
  }

  async function start() {
    if (started) return;
    if (starting) return starting;
    starting = new Promise((resolve, reject) => {
      const candidate = netImpl.createServer(onConnection);
      let settled = false;
      const onError = (error) => {
        if (!settled) { settled = true; reject(error); }
      };
      if (typeof candidate.once === 'function') candidate.once('error', onError);
      candidate.listen({ host: '127.0.0.1', port: 1337 }, () => {
        settled = true;
        if (typeof candidate.off === 'function') candidate.off('error', onError);
        server = candidate;
        started = true;
        resolve();
      });
    });
    try { await starting; } finally { starting = null; }
  }

  async function stop() {
    if (stopping) return stopping;
    if (starting) await starting;
    if (!started || !server) return;
    stopping = new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    try { await stopping; } finally { stopping = null; server = null; started = false; }
  }

  return Object.freeze({ start, stop, isStarted: () => started });
}

module.exports = { MAX_BUFFER_BYTES, parseDhcpEventLine, createDhcpEventListener };
