'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { parseDhcpEventLine, createDhcpEventListener } = require('../../src/network/dhcp-event-listener');

test('parses verified dnsmasq event line format', () => {
  assert.deepEqual(parseDhcpEventLine('add 10.0.0.50 aa:bb:cc:dd:ee:ff br-lan 1791269999 phone-1'), {
    action: 'add', ip: '10.0.0.50', mac: 'aa:bb:cc:dd:ee:ff', interface: 'br-lan', leaseExpires: 1791269999, hostname: 'phone-1'
  });
});

test('rejects malformed and unsupported DHCP event lines', () => {
  assert.throws(() => parseDhcpEventLine('oops'), /DHCP event/i);
  assert.throws(() => parseDhcpEventLine('hack 10.0.0.2 aa:bb:cc:dd:ee:ff br-lan 1 host'), /action/i);
});

test('listener binds only loopback:1337 and persists device metadata', async () => {
  const calls = [];
  let connectionHandler;
  const server = new EventEmitter();
  server.listen = (options, cb) => { calls.push(['listen', options]); cb(); };
  server.close = (cb) => { calls.push(['close']); cb(); };
  const netImpl = { createServer(handler) { connectionHandler = handler; return server; } };
  const devices = { async upsert(input) { calls.push(['upsert', input]); } };
  const listener = createDhcpEventListener({ devices, netImpl });
  await listener.start();
  assert.deepEqual(calls[0], ['listen', { host: '127.0.0.1', port: 1337 }]);
  const socket = new EventEmitter();
  connectionHandler(socket);
  socket.emit('data', Buffer.from('add 10.0.0.9 02:00:00:00:00:09 br-lan 2000 phone9\n'));
  socket.emit('end');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls[1][0], 'upsert');
  assert.equal(calls[1][1].mac, '02:00:00:00:00:09');
  assert.equal(calls[1][1].metadata.ip, '10.0.0.9');
  assert.equal(calls[1][1].metadata.interface, 'br-lan');
  await listener.stop();
  assert.equal(calls.at(-1)[0], 'close');
});
