'use strict';

function deepFreeze(value) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return Object.freeze(value);
}

const HTTP_CONTRACT = deepFreeze({
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

function getHttpContract() {
  return HTTP_CONTRACT;
}

module.exports = {
  getHttpContract,
};
