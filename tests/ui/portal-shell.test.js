'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const portalRoot = path.join(root, 'src', 'ui', 'portal');

function read(name) {
  return fs.readFileSync(path.join(portalRoot, name), 'utf8');
}

test('portal shell is branded responsive and does not fabricate customer state', () => {
  const html = read('index.html');
  assert.match(html, /<meta\s+name="viewport"/i);
  assert.match(html, /ETHYLNET/);
  assert.match(html, /Connection status/i);
  assert.match(html, /Rates and access/i);
  assert.match(html, /Unavailable|local backend/i);
  assert.doesNotMatch(html, /Remaining time:\s*\d|Balance:\s*[₱$]?\d|MAC:\s*[0-9A-F]{2}:/i);
  assert.doesNotMatch(html, /https?:\/\//i);
});

test('portal uses local assets and only same-origin local API JavaScript', () => {
  const html = read('index.html');
  const css = read('portal.css');
  const js = read('portal.js');
  assert.match(html, /href="portal\.css"/);
  assert.match(html, /src="portal\.js"/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
  assert.match(css, /--accent:/);
  assert.doesNotMatch(css, /@import|https?:\/\//i);
  assert.match(js, /fetch\s*\(/);
  assert.match(js, /\/api\/v1\//);
  assert.doesNotMatch(js, /innerHTML|\beval\s*\(|new\s+Function|XMLHttpRequest|WebSocket|EventSource|https?:\/\//i);
});

test('portal core content remains present without JavaScript', () => {
  const html = read('index.html');
  assert.match(html, /<main/i);
  assert.match(html, /Connection status/i);
  assert.match(html, /Rates and access/i);
  assert.match(html, /Voucher/i);
});
