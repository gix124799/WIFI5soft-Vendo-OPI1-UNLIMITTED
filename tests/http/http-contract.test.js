'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const modulePath = path.resolve(
  __dirname,
  '../../src/http/http-contract.js'
);

function loadSubject() {
  try {
    return require(modulePath);
  } catch (error) {
    if (
      error &&
      error.code === 'MODULE_NOT_FOUND' &&
      String(error.message).includes('http-contract')
    ) {
      return null;
    }

    throw error;
  }
}

test('exports getHttpContract', () => {
  const subject = loadSubject();

  assert.ok(
    subject,
    'http-contract module must exist'
  );

  assert.equal(
    typeof subject.getHttpContract,
    'function'
  );
});

test('returns the exact preserved HTTP network contract', () => {
  const subject = loadSubject();

  assert.ok(
    subject,
    'http-contract module must exist'
  );

  const contract = subject.getHttpContract();

  assert.deepEqual(contract, {
    host: 'localhost',
    upstream3000: {
      host: 'localhost',
      port: 3000,
    },
    upstream3001: {
      host: 'localhost',
      port: 3001,
    },
    reserved: {
      pppoe: {
        port: 3002,
      },
      terminal: {
        port: 7681,
      },
    },
    nginxExternalPorts: [
      80,
      443,
      4455,
      8081,
      4400,
    ],
  });

  assert.notEqual(
    contract.host,
    '127.0.0.1'
  );

  assert.notEqual(
    contract.host,
    '::1'
  );
});

test('returns a deeply frozen contract', () => {
  const subject = loadSubject();

  assert.ok(
    subject,
    'http-contract module must exist'
  );

  const contract = subject.getHttpContract();

  assert.equal(Object.isFrozen(contract), true);
  assert.equal(Object.isFrozen(contract.upstream3000), true);
  assert.equal(Object.isFrozen(contract.upstream3001), true);
  assert.equal(Object.isFrozen(contract.reserved), true);
  assert.equal(Object.isFrozen(contract.reserved.pppoe), true);
  assert.equal(Object.isFrozen(contract.reserved.terminal), true);
  assert.equal(Object.isFrozen(contract.nginxExternalPorts), true);

  assert.throws(
    () => {
      contract.upstream3000.host = '127.0.0.1';
    },
    TypeError
  );
});

test('keeps application ports separate from protected ports', () => {
  const subject = loadSubject();

  assert.ok(
    subject,
    'http-contract module must exist'
  );

  const contract = subject.getHttpContract();

  const applicationPorts = new Set([
    contract.upstream3000.port,
    contract.upstream3001.port,
  ]);

  const protectedPorts = new Set([
    contract.reserved.pppoe.port,
    contract.reserved.terminal.port,
    ...contract.nginxExternalPorts,
  ]);

  assert.equal(applicationPorts.size, 2);

  for (const port of applicationPorts) {
    assert.equal(
      protectedPorts.has(port),
      false,
      `application port ${port} overlaps a protected port`
    );
  }
});
