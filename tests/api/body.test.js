'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

const { parseJsonBody, MAX_JSON_BYTES } = require('../../src/api/body');

function request(body, contentType = 'application/json') {
  const stream = Readable.from([Buffer.from(body)]);
  stream.headers = { 'content-type': contentType };
  return stream;
}

test('parses bounded application/json request bodies', async () => {
  const result = await parseJsonBody(request('{"hello":"world"}'));
  assert.deepEqual(result, { hello: 'world' });
});

test('rejects non-json content type', async () => {
  await assert.rejects(
    parseJsonBody(request('{}', 'text/plain')),
    /content-type/i
  );
});

test('rejects bodies over the configured maximum', async () => {
  const oversized = '"' + 'x'.repeat(MAX_JSON_BYTES + 1) + '"';
  await assert.rejects(
    parseJsonBody(request(oversized)),
    /too large/i
  );
});
