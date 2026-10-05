'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getSqliteEngine,
} = require('../../src/db/sqlite-engine');

test('loads SQLite from a local vendored WASM asset', async () => {
  const SQL = await getSqliteEngine();

  assert.equal(typeof SQL.Database, 'function');

  const db = new SQL.Database();
  db.run('CREATE TABLE proof(id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
  db.run('INSERT INTO proof(value) VALUES (?)', ['hello']);

  const bytes = db.export();
  const header = Buffer.from(bytes.subarray(0, 16)).toString('binary');

  assert.equal(header, 'SQLite format 3\u0000');

  const reopened = new SQL.Database(bytes);
  const rows = reopened.exec('SELECT id, value FROM proof');

  assert.deepEqual(rows[0].values, [[1, 'hello']]);

  reopened.close();
  db.close();
});

test('caches one engine instance without network configuration', async () => {
  const first = await getSqliteEngine();
  const second = await getSqliteEngine();

  assert.equal(first, second);
});
