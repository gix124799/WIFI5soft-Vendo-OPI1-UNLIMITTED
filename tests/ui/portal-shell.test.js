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

test('portal shell is branded, responsive and honest about unavailable data', () => {
  const html = read('index.html');

  assert.match(html, /<meta\s+name="viewport"/i);
  assert.match(html, /ETHYLNET/);
  assert.match(html, /Connection status/i);
  assert.match(html, /Rates and access/i);
  assert.match(html, /Backend integration pending/);
  assert.match(html, /disabled[^>]*>[^<]*(Connect|Voucher|Pay|Start)/i);
  assert.doesNotMatch(html, /Remaining time:\s*\d|Balance:\s*[₱$]?\d|MAC:\s*[0-9A-F]{2}:/i);
  assert.doesNotMatch(html, /https?:\/\//i);
});

test('portal uses only local assets and safe client JavaScript', () => {
  const html = read('index.html');
  const css = read('portal.css');
  const js = read('portal.js');

  assert.match(html, /href="portal\.css"/);
  assert.match(html, /src="portal\.js"/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
  assert.match(css, /--accent:/);
  assert.doesNotMatch(css, /@import|https?:\/\//i);
  assert.doesNotMatch(js, /innerHTML|\beval\s*\(|new\s+Function|fetch\s*\(|XMLHttpRequest|WebSocket|EventSource/);
});

test('portal core content remains present without JavaScript', () => {
  const html = read('index.html');

  assert.match(html, /<main/i);
  assert.match(html, /Connection status/i);
  assert.match(html, /Backend integration pending/);
  assert.match(html, /Rates and access/i);
});