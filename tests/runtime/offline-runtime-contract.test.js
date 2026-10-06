'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getOfflineRuntimeContract,
} = require('../../src/runtime/offline-runtime-contract');

test('declares a local runtime with no WAN requirement', () => {
  const contract = getOfflineRuntimeContract();
  assert.deepEqual(Object.keys(contract).sort(), [
    'legacyCoreAllowedInRelease',
    'optionalExternalProviders',
    'wanRequiredForLocalFeatures',
  ]);
  assert.equal(contract.legacyCoreAllowedInRelease, false);
  assert.equal(contract.wanRequiredForLocalFeatures, false);
});

test('returns a deeply frozen contract', () => {
  const contract = getOfflineRuntimeContract();
  assert.equal(Object.isFrozen(contract), true);
  assert.equal(Object.isFrozen(contract.optionalExternalProviders), true);
  assert.deepEqual(contract.optionalExternalProviders, ['eload', 'epay']);
});
