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

test('admin shell exposes the required navigation and safe pending states', () => {
  const html = read('index.html');

  assert.match(html, /<meta\s+name="viewport"/i);
  assert.match(html, /aria-label="Admin navigation"/i);
  assert.match(html, /Dashboard/);
  assert.match(html, /Sales/);
  assert.match(html, /Sessions/);
  assert.match(html, /Vouchers/);
  assert.match(html, /PPPoE/);
  assert.match(html, /ELOAD/);
  assert.match(html, /Sub-vendo \/ Rental/);
  assert.match(html, /Settings/);
  assert.match(html, /Backend integration pending/);
  assert.match(html, /disabled[^>]*>[^<]*(Create|Apply|Save)/i);
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
  assert.doesNotMatch(js, /innerHTML|\beval\s*\(|new\s+Function|fetch\s*\(/);
});

test('admin JavaScript accepts dashboard entry without creating API behavior', () => {
  const js = read('admin.js');

  assert.match(js, /URLSearchParams/);
  assert.match(js, /dashboard/);
  assert.match(js, /aria-current/);
  assert.doesNotMatch(js, /XMLHttpRequest|WebSocket|EventSource|fetch\s*\(/);
});