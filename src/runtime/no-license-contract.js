'use strict';

const optionalExternalProviders = Object.freeze([
  'eload',
  'epay',
]);

const contract = Object.freeze({
  legacyCoreAllowedInRelease: false,
  wanRequiredForLocalFeatures: false,
  productKeyValidationAllowed: false,
  activationServerAllowed: false,
  trialOrExpiryGateAllowed: false,
  boardEntitlementAllowed: false,
  featureEntitlementAllowed: false,
  licenseRefreshAllowed: false,
  licenseCacheAllowed: false,
  optionalExternalProviders,
});

function getNoLicenseContract() {
  return contract;
}

module.exports = {
  getNoLicenseContract,
};
