'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const adminRoot = path.join(root, 'src', 'ui', 'admin');

function read(name) {
  return fs.readFileSync(path.join(adminRoot, name), 'utf8');
}

test('admin shell exposes required navigation and honest guarded provider actions', () => {
  const html = read('index.html');
  assert.match(html, /<meta\s+name="viewport"/i);
  assert.match(html, /aria-label="Admin navigation"/i);
  for (const label of ['Dashboard', 'Sales', 'Sessions', 'Vouchers', 'PPPoE', 'ELOAD', 'Sub-vendo / Rental', 'Settings']) {
    assert.match(html, new RegExp(label.replace('/', '\\/')));
  }
  assert.match(html, /NO KEY NEEDED/);
  assert.match(html, /disabled[^>]*>[^<]*Apply order/i);
  assert.doesNotMatch(html, /https?:\/\//i);
});

test('admin shell uses local assets and responsive accessible styles', () => {
  const html = read('index.html');
  const css = read('admin.css');
  const js = read('admin.js');
  assert.match(html, /href="admin\.css"/);
  assert.match(html, /src="admin\.js"/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
  assert.match(css, /--accent:/);
  assert.doesNotMatch(css, /@import|https?:\/\//i);
  assert.doesNotMatch(js, /innerHTML|\beval\s*\(|new\s+Function|XMLHttpRequest|WebSocket|EventSource|https?:\/\//i);
});

test('admin JavaScript preserves dashboard routing while using only local API calls', () => {
  const js = read('admin.js');
  assert.match(js, /URLSearchParams/);
  assert.match(js, /dashboard/);
  assert.match(js, /aria-current/);
  assert.match(js, /fetch\s*\(/);
  assert.match(js, /\/api\/v1\//);
});
