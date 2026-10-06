'use strict';

const optionalExternalProviders = Object.freeze([
  'eload',
  'epay',
]);

const contract = Object.freeze({
  legacyCoreAllowedInRelease: false,
  wanRequiredForLocalFeatures: false,
  optionalExternalProviders,
});

function getOfflineRuntimeContract() {
  return contract;
}

module.exports = {
  getOfflineRuntimeContract,
};
