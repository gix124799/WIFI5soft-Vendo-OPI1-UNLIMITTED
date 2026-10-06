'use strict';

const MAX_JSON_BYTES = 64 * 1024;

function contentTypeIsJson(value) {
  return typeof value === 'string' && /^application\/json(?:\s*;|$)/i.test(value);
}

async function parseJsonBody(request, options = {}) {
  const maxBytes = options.maxBytes ?? MAX_JSON_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new TypeError('maxBytes must be a positive safe integer');
  }

  const headers = request && request.headers ? request.headers : {};
  if (!contentTypeIsJson(headers['content-type'])) {
    throw new Error('content-type must be application/json');
  }

  const declared = Number(headers['content-length']);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error('JSON body too large');
  }

  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      throw new Error('JSON body too large');
    }
    chunks.push(buffer);
  }

  const text = Buffer.concat(chunks).toString('utf8');
  if (text.trim() === '') {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    throw new Error('invalid JSON body');
  }
}

module.exports = {
  MAX_JSON_BYTES,
  parseJsonBody,
};
