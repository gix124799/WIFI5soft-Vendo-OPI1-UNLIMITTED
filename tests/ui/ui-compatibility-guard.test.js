'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const uiRoot = path.join(root, 'src', 'ui');
const { getUiContract } = require(path.join(uiRoot, 'ui-contract.js'));

function collectFiles(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...collectFiles(full));
    if (entry.isFile()) result.push(full);
  }
  return result;
}

function allUiText() {
  return collectFiles(uiRoot)
    .filter((file) => /\.(?:html|css|js)$/.test(file))
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');
}

test('UI contract stays inside verified route and listener boundaries', () => {
  const contract = getUiContract();
  assert.deepEqual(contract.routes, ['/', '/admin', '/reseller', '/tty-terminal']);
  assert.deepEqual(contract.listenerOwnership, [3000, 3001]);
  assert.equal(contract.dashboardEntry, '/admin?page=dashboard');
  assert.deepEqual(contract.verifiedBusinessApis, []);
  assert.deepEqual(contract.verifiedAdminMutationApis, []);
  assert.deepEqual(contract.verifiedPortalMutationApis, []);
});

test('UI assets use only same-origin local API calls and no dangerous dynamic code', () => {
  const text = allUiText();
  assert.doesNotMatch(text, /https?:\/\//i);
  assert.doesNotMatch(text, /<script[^>]+src=["']\/\//i);
  assert.doesNotMatch(text, /@import/i);
  assert.doesNotMatch(text, /\beval\s*\(/);
  assert.doesNotMatch(text, /new\s+Function/);
  assert.doesNotMatch(text, /innerHTML\s*=/);
  assert.doesNotMatch(text, /XMLHttpRequest|WebSocket|EventSource/);

  const fetchTargets = [...text.matchAll(/fetch\s*\(\s*["']([^"']+)["']/g)]
    .map((match) => match[1]);
  for (const target of fetchTargets) {
    assert.match(target, /^\/api\/v1\//);
  }
});

test('UI assets do not contain obvious embedded credentials or new listener code', () => {
  const text = allUiText();
  assert.doesNotMatch(text, /(?:password|secret|access[_-]?token|api[_-]?key)\s*[:=]\s*["'][^"']+["']/i);
  assert.doesNotMatch(text, /\.listen\s*\(|createServer\s*\(/);
});

test('UI remains compatible with the local SQLite production entrypoint', () => {
  const entry = fs.readFileSync(path.join(root, 'bin', 'ethyl-core.js'), 'utf8');
  assert.match(entry, /createProductionApp/);
  assert.doesNotMatch(entry, /\/soft\/index\.o|https?:\/\//i);
});
