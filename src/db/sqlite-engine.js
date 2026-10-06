'use strict';

const initSqlJs = require('sql.js');

let enginePromise = null;

function resolveWasm() {
  return require.resolve('sql.js/dist/sql-wasm.wasm');
}

async function getSqliteEngine() {
  if (!enginePromise) {
    const wasmPath = resolveWasm();

    enginePromise = initSqlJs({
      locateFile() {
        return wasmPath;
      },
    });
  }

  return enginePromise;
}

module.exports = {
  getSqliteEngine,
};
