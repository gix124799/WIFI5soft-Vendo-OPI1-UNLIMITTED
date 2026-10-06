'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const adminJs = fs.readFileSync(path.join(root, 'src', 'ui', 'admin', 'admin.js'), 'utf8');
const portalJs = fs.readFileSync(path.join(root, 'src', 'ui', 'portal', 'portal.js'), 'utf8');

function assertLocalOnly(source) {
  assert.doesNotMatch(source, /https?:\/\//i);
  assert.doesNotMatch(source, /WebSocket|EventSource|XMLHttpRequest|new\s+Function|\beval\s*\(/);
  const fetches = [...source.matchAll(/fetch\s*\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  assert.ok(fetches.length > 0, 'expected at least one local fetch');
  for (const target of fetches) {
    assert.match(target, /^\/api\/v1\//);
  }
}

test('admin UI reads real local dashboard data from same-origin API only', () => {
  assertLocalOnly(adminJs);
  assert.match(adminJs, /\/api\/v1\/health/);
  assert.match(adminJs, /\/api\/v1\/sales/);
  assert.match(adminJs, /\/api\/v1\/sessions/);
  assert.match(adminJs, /\/api\/v1\/vouchers/);
  assert.match(adminJs, /\/api\/v1\/pppoe\/accounts/);
  assert.match(adminJs, /\/api\/v1\/providers\/operations/);
});

test('portal UI reads health and vendo rates from same-origin API only', () => {
  assertLocalOnly(portalJs);
  assert.match(portalJs, /\/api\/v1\/health/);
  assert.match(portalJs, /\/api\/v1\/vendo\/rates/);
});

test('UI never fabricates provider success and keeps unavailable state visible', () => {
  assert.match(adminJs, /unavailable|offline/i);
  assert.doesNotMatch(adminJs, /provider\s+success/i);
  assert.doesNotMatch(portalJs, /payment\s+successful|load\s+successful/i);
});
