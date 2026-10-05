'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const packagePath = path.join(root, 'package.json');
const entryPath = path.join(root, 'bin', 'ethyl-core.js');

test('Node runtime major version is at least 18', () => {
  const major = Number(process.versions.node.split('.')[0]);

  assert.ok(
    Number.isInteger(major) && major >= 18,
    `expected Node.js >=18, got ${process.version}`
  );
});

test('package contract exists and uses CommonJS without production dependencies', () => {
  assert.ok(
    fs.existsSync(packagePath),
    'package.json must exist'
  );

  const pkg = JSON.parse(
    fs.readFileSync(packagePath, 'utf8')
  );

  assert.equal(pkg.name, 'ethyl-core');
  assert.equal(pkg.private, true);
  assert.equal(pkg.type, 'commonjs');
  assert.equal(pkg.engines.node, '>=18');
  assert.equal(pkg.scripts.test, 'node --test');

  assert.ok(
    !Object.prototype.hasOwnProperty.call(pkg, 'dependencies') ||
      Object.keys(pkg.dependencies).length === 0,
    'foundation must have no production dependencies'
  );
});

test('foundation executable entrypoint exists', () => {
  assert.ok(
    fs.existsSync(entryPath),
    'bin/ethyl-core.js must exist'
  );
});
