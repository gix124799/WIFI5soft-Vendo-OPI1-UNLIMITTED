'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getNoLicenseContract,
} = require('../../src/runtime/no-license-contract');

test('declares local runtime independent of licensing and WAN', () => {
  const contract = getNoLicenseContract();

  assert.equal(contract.legacyCoreAllowedInRelease, false);
  assert.equal(contract.wanRequiredForLocalFeatures, false);
  assert.equal(contract.productKeyValidationAllowed, false);
  assert.equal(contract.activationServerAllowed, false);
  assert.equal(contract.trialOrExpiryGateAllowed, false);
  assert.equal(contract.boardEntitlementAllowed, false);
  assert.equal(contract.featureEntitlementAllowed, false);
  assert.equal(contract.licenseRefreshAllowed, false);
  assert.equal(contract.licenseCacheAllowed, false);
});

test('returns a deeply frozen contract', () => {
  const contract = getNoLicenseContract();

  assert.equal(Object.isFrozen(contract), true);
  assert.equal(Object.isFrozen(contract.optionalExternalProviders), true);
  assert.deepEqual(contract.optionalExternalProviders, ['eload', 'epay']);
});
