'use strict';

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.statusCode = statusCode;
  if (typeof response.setHeader === 'function') {
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.setHeader('cache-control', 'no-store');
    response.setHeader('content-length', Buffer.byteLength(body));
  }
  response.end(body);
}

function sendOk(response, data) {
  sendJson(response, 200, { ok: true, data });
}

function sendBadRequest(response, error) {
  const message = error instanceof Error ? error.message : 'invalid request';
  sendJson(response, 400, {
    ok: false,
    error: {
      code: 'bad_request',
      message,
    },
  });
}

module.exports = {
  sendJson,
  sendOk,
  sendBadRequest,
};
