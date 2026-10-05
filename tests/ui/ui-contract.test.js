'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { getUiContract } = require('../../src/ui/ui-contract.js');

test('exposes only verified UI compatibility routes and no business APIs', () => {
  const contract = getUiContract();

  assert.deepEqual(contract.routes, [
    '/',
    '/admin',
    '/reseller',
    '/tty-terminal'
  ]);
  assert.equal(contract.dashboardEntry, '/admin?page=dashboard');
  assert.equal(contract.staticRootEvidence, '/tmp/i/public');
  assert.deepEqual(contract.listenerOwnership, [3000, 3001]);
  assert.deepEqual(contract.verifiedBusinessApis, []);
  assert.deepEqual(contract.verifiedAdminMutationApis, []);
  assert.deepEqual(contract.verifiedPortalMutationApis, []);
});

test('returns a deeply frozen contract', () => {
  const contract = getUiContract();

  assert.equal(Object.isFrozen(contract), true);
  assert.equal(Object.isFrozen(contract.routes), true);
  assert.equal(Object.isFrozen(contract.listenerOwnership), true);
  assert.equal(Object.isFrozen(contract.verifiedBusinessApis), true);
  assert.equal(Object.isFrozen(contract.verifiedAdminMutationApis), true);
  assert.equal(Object.isFrozen(contract.verifiedPortalMutationApis), true);
});