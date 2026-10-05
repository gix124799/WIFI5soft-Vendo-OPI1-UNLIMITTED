'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const {
  getHttpContract,
} = require('../../src/http/http-contract');

const {
  createHttpLayer,
} = require('../../src/http');

const repoRoot = path.resolve(
  __dirname,
  '../..'
);

const runtimeFiles = [
  'src/http/http-contract.js',
  'src/http/router.js',
  'src/http/http-listener.js',
  'src/http/http-service-group.js',
  'src/http/index.js',
];

function read(rel) {
  return fs.readFileSync(
    path.join(repoRoot, rel),
    'utf8'
  );
}

function sha256(rel) {
  return crypto
    .createHash('sha256')
    .update(
      fs.readFileSync(
        path.join(repoRoot, rel)
      )
    )
    .digest('hex');
}

test('preserves literal localhost application upstream contract', () => {
  const contract = getHttpContract();

  assert.equal(
    contract.host,
    'localhost'
  );

  assert.equal(
    contract.upstream3000.host,
    'localhost'
  );

  assert.equal(
    contract.upstream3000.port,
    3000
  );

  assert.equal(
    contract.upstream3001.host,
    'localhost'
  );

  assert.equal(
    contract.upstream3001.port,
    3001
  );

  assert.notEqual(
    contract.host,
    '127.0.0.1'
  );

  assert.notEqual(
    contract.host,
    '::1'
  );
});

test('runtime HTTP source does not substitute localhost with numeric loopback or wildcard hosts', () => {
  const text = runtimeFiles
    .map(read)
    .join('\n');

  for (const forbidden of [
    '127.0.0.1',
    '0.0.0.0',
    "'::1'",
    '"::1"',
    "'::'",
    '"::"',
  ]) {
    assert.equal(
      text.includes(forbidden),
      false,
      `runtime HTTP source contains forbidden host token ${forbidden}`
    );
  }
});

test('HTTP listener ownership is exactly ports 3000 and 3001', () => {
  const creations = [];

  function listenerFactory(config) {
    creations.push({
      host: config.host,
      port: config.port,
    });

    let started = false;

    return {
      async start() {
        started = true;
      },

      async stop() {
        started = false;
      },

      isStarted() {
        return started;
      },
    };
  }

  const layer = createHttpLayer({
    listenerFactory,
  });

  assert.equal(
    layer.isStarted(),
    false
  );

  assert.deepEqual(
    creations,
    [
      {
        host: 'localhost',
        port: 3000,
      },
      {
        host: 'localhost',
        port: 3001,
      },
    ]
  );

  const owned = creations.map(
    (entry) => entry.port
  );

  assert.deepEqual(
    owned,
    [3000, 3001]
  );
});

test('reserved and Nginx-owned ports remain outside HTTP listener ownership', () => {
  const contract = getHttpContract();

  assert.equal(
    contract.reserved.pppoe.port,
    3002
  );

  assert.equal(
    contract.reserved.terminal.port,
    7681
  );

  assert.deepEqual(
    contract.nginxExternalPorts,
    [
      80,
      443,
      4455,
      8081,
      4400,
    ]
  );

  const owned = new Set([
    contract.upstream3000.port,
    contract.upstream3001.port,
  ]);

  const protectedPorts = [
    contract.reserved.pppoe.port,
    contract.reserved.terminal.port,
    ...contract.nginxExternalPorts,
  ];

  for (const port of protectedPorts) {
    assert.equal(
      owned.has(port),
      false,
      `protected port ${port} became HTTP-owned`
    );
  }
});

test('HTTP layer starts with zero business routes', () => {
  const layer = createHttpLayer({
    listenerFactory(config) {
      let started = false;

      return {
        async start() {
          started = true;
        },

        async stop() {
          started = false;
        },

        isStarted() {
          return started;
        },
      };
    },
  });

  assert.equal(
    layer.upstream3000Router.routeCount(),
    0
  );

  assert.equal(
    layer.upstream3001Router.routeCount(),
    0
  );
});

test('HTTP runtime contains no product-license activation trial or entitlement subsystem', () => {
  const text = runtimeFiles
    .map(read)
    .join('\n')
    .toLowerCase();

  const forbidden = [
    'product-key',
    'product_key',
    'activation-server',
    'activation_server',
    'license-refresh',
    'license_refresh',
    'trial-expiry',
    'trial_expiry',
    'board-entitlement',
    'board_entitlement',
    'feature-entitlement',
    'feature_entitlement',
  ];

  for (const term of forbidden) {
    assert.equal(
      text.includes(term),
      false,
      `forbidden entitlement implementation token found: ${term}`
    );
  }
});

test('preserved clean-room references retain exact hashes', () => {
  const expected = {
    'reference-plaintext/io-index.js':
      '380f186c770e4525c933dd6cec3012d37912a8156e12a60b5a2195b48a123c43',

    'reference-plaintext/io-package.json':
      'a89558ed9c743622581df35aebf1afec5c557696b8455d9d7330793679ad6991',

    'spec/editable-mnt-wifi5-paths.txt':
      'fba8812511d5297010578e0f2284ecb23bba46205c29b37b5119c8c3752cea2d',

    'spec/feature-matrix.tsv':
      'afb5a33901abe78191c7d92b0e0b27a59e9d5a7c77f90ce1500912d3fa146fc8',

    'spec/implementation-boundary.txt':
      'c72a87708969afc50fe236b0e922e59278e95ac602b01480b937d13380c6230a',

    'spec/important-listeners.txt':
      '5aa223f59f4583b8487163c040a2c1eb00c40fc09af4da3facab4a3b5a540696',

    'spec/known-protected-runtime-paths.txt':
      '0b3ade7e386ada4a08d69ebe0e927dae5ed2977f7901905f1fba8e465050c82c',

    'spec/network-contract.txt':
      'ce25bfa9b11b87002af64ff323bc6fdb07b7fc5041efd177fa41a031174bad46',

    'spec/nginx-full-contract.txt':
      '46d431a26abccb9d4507bcd3d19acaa0febb264473af11322b3210627351470e',

    'spec/nginx-port-route-map.txt':
      '2cce25f130c8f8f59f0e1fae1d34205574334c02e73f216ec56697a2741885ce',

    'spec/persistent-storage-contract.txt':
      '264bc3dd72e2ebfe2ab14c13d9c083f7657b0197283dffbd73a9c17f8f36740a',

    'spec/port-map.tsv':
      '1be1bbf42870bd6b30136595ecf0100b4ae59e66d02b25aea1bcd870834110c6',

    'spec/protected-feature-contract.txt':
      'fa271991d6984346f71324d87e80ad04c66fdbea5361fdf5c48be1ea7b529cc5',

    'spec/unresolved-contracts.txt':
      '96f3663f6089f3443a508a81116e3910daa182fb56ff3f3b81a1e5d551d655c7',
  };

  for (
    const [rel, wanted]
    of Object.entries(expected)
  ) {
    assert.equal(
      sha256(rel),
      wanted,
      `reference hash changed: ${rel}`
    );
  }
});
