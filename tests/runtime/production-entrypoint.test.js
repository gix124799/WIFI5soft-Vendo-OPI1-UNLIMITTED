'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const entryPath = path.join(root, 'bin', 'ethyl-core.js');

function source() {
  return fs.readFileSync(entryPath, 'utf8');
}

test('production entrypoint boots the SQLite production app', () => {
  const text = source();
  assert.match(text, /createProductionApp/);
  assert.doesNotMatch(text, /createAtomicFileStore/);
  assert.doesNotMatch(text, /createApp\s*\(/);
});

test('production entrypoint has no legacy opaque-core fallback or WAN dependency', () => {
  const text = source();
  assert.doesNotMatch(text, /\/soft\/index\.o/);
  assert.doesNotMatch(text, /https?:\/\//i);
  assert.doesNotMatch(text, /activation|license\s*server|product\s*key|trial|expiry/i);
});
