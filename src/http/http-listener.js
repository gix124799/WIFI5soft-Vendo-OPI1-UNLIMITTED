'use strict';

const http = require('node:http');

function validateHost(host) {
  if (host !== 'localhost') {
    throw new TypeError(
      'host must be exactly localhost'
    );
  }

  return host;
}

function validatePort(port) {
  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new TypeError(
      'port must be an integer from 1 through 65535'
    );
  }

  return port;
}

function validateHandler(handler) {
  if (typeof handler !== 'function') {
    throw new TypeError(
      'handler must be a function'
    );
  }

  return handler;
}

function defaultServerFactory(handler) {
  return http.createServer(handler);
}

function createHttpListener(options = {}) {
  const host = validateHost(
    options.host
  );

  const port = validatePort(
    options.port
  );

  const handler = validateHandler(
    options.handler
  );

  const serverFactory =
    options.serverFactory === undefined
      ? defaultServerFactory
      : options.serverFactory;

  if (typeof serverFactory !== 'function') {
    throw new TypeError(
      'serverFactory must be a function'
    );
  }

  let server = null;
  let started = false;
  let starting = null;
  let stopping = null;

  function isStarted() {
    return started;
  }

  function address() {
    if (
      !started ||
      !server ||
      typeof server.address !== 'function'
    ) {
      return null;
    }

    return server.address();
  }

  function closeServerQuietly(target) {
    return new Promise((resolve) => {
      if (
        !target ||
        typeof target.close !== 'function'
      ) {
        resolve();
        return;
      }

      let finished = false;

      function finish() {
        if (finished) {
          return;
        }

        finished = true;
        resolve();
      }

      try {
        const result = target.close(
          () => finish()
        );

        if (
          result &&
          typeof result.then === 'function'
        ) {
          result.then(
            finish,
            finish
          );
        }
      } catch (_error) {
        finish();
      }

      queueMicrotask(finish);
    });
  }

  async function start() {
    if (started) {
      return;
    }

    if (starting) {
      return starting;
    }

    if (stopping) {
      await stopping;
    }

    starting = new Promise(
      (resolve, reject) => {
        let candidate;

        try {
          candidate = serverFactory(
            handler
          );
        } catch (error) {
          reject(error);
          return;
        }

        if (
          !candidate ||
          typeof candidate.once !== 'function' ||
          typeof candidate.removeListener !== 'function' ||
          typeof candidate.listen !== 'function'
        ) {
          reject(
            new TypeError(
              'serverFactory must return an HTTP-server-compatible object'
            )
          );
          return;
        }

        server = candidate;

        let settled = false;

        function cleanupListeners() {
          candidate.removeListener(
            'error',
            onError
          );

          candidate.removeListener(
            'listening',
            onListening
          );
        }

        function onListening() {
          if (settled) {
            return;
          }

          settled = true;
          cleanupListeners();

          started = true;

          resolve();
        }

        function onError(error) {
          if (settled) {
            return;
          }

          settled = true;
          cleanupListeners();

          started = false;

          void closeServerQuietly(
            candidate
          ).finally(() => {
            if (server === candidate) {
              server = null;
            }

            reject(error);
          });
        }

        candidate.once(
          'error',
          onError
        );

        candidate.once(
          'listening',
          onListening
        );

        try {
          candidate.listen(
            port,
            host
          );
        } catch (error) {
          if (!settled) {
            settled = true;
            cleanupListeners();

            started = false;

            void closeServerQuietly(
              candidate
            ).finally(() => {
              if (server === candidate) {
                server = null;
              }

              reject(error);
            });
          }
        }
      }
    );

    try {
      await starting;
    } finally {
      starting = null;
    }
  }

  async function stop() {
    if (stopping) {
      return stopping;
    }

    if (starting) {
      try {
        await starting;
      } catch (_error) {
        return;
      }
    }

    if (
      !started ||
      !server
    ) {
      started = false;
      server = null;
      return;
    }

    const target = server;

    stopping = new Promise(
      (resolve, reject) => {
        let settled = false;

        function finish(error) {
          if (settled) {
            return;
          }

          settled = true;

          started = false;

          if (server === target) {
            server = null;
          }

          if (error) {
            reject(error);
            return;
          }

          resolve();
        }

        try {
          target.close(
            (error) => {
              finish(error);
            }
          );
        } catch (error) {
          finish(error);
        }
      }
    );

    try {
      await stopping;
    } finally {
      stopping = null;
    }
  }

  return Object.freeze({
    start,
    stop,
    isStarted,
    address,
  });
}

module.exports = {
  createHttpListener,
};
