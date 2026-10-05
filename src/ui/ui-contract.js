'use strict';

function freezeArray(values) {
  return Object.freeze([...values]);
}

const UI_CONTRACT = Object.freeze({
  routes: freezeArray([
    '/',
    '/admin',
    '/reseller',
    '/tty-terminal'
  ]),
  dashboardEntry: '/admin?page=dashboard',
  staticRootEvidence: '/tmp/i/public',
  listenerOwnership: freezeArray([3000, 3001]),
  verifiedBusinessApis: freezeArray([]),
  verifiedAdminMutationApis: freezeArray([]),
  verifiedPortalMutationApis: freezeArray([])
});

function getUiContract() {
  return UI_CONTRACT;
}

module.exports = Object.freeze({
  getUiContract
});