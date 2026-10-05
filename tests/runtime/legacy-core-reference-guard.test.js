'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

function collectJsFiles(dir) {
  const out = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      out.push(...collectJsFiles(target));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(target);
    }
  }

  return out;
}

test('production runtime contains no legacy-core startup reference', () => {
  const files = [
    ...collectJsFiles(path.join(root, 'src')),
    ...collectJsFiles(path.join(root, 'bin')),
  ];

  const violations = [];

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');

    if (text.includes('/soft/index.o')) {
      violations.push(path.relative(root, file));
    }
  }

  assert.deepEqual(violations, []);
});

test('production code does not implement product-license gates', () => {
  const contractPath = path.join(
    root,
    'src',
    'runtime',
    'no-license-contract.js'
  );

  const files = [
    ...collectJsFiles(path.join(root, 'src')),
    ...collectJsFiles(path.join(root, 'bin')),
  ].filter((file) => file !== contractPath);

  const forbidden = [
    /licenseKey/i,
    /activationServer/i,
    /trialExpires/i,
    /boardEntitlement/i,
    /featureEntitlement/i,
    /licenseRefresh/i,
    /licenseCache/i,
  ];

  const violations = [];

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');

    for (const pattern of forbidden) {
      if (pattern.test(text)) {
        violations.push(`${path.relative(root, file)}:${pattern}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});
