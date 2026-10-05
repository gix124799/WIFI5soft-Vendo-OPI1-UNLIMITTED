'use strict';

function normalizeMethod(method) {
  if (
    typeof method !== 'string' ||
    method.trim() === ''
  ) {
    throw new TypeError(
      'method must be a non-empty string'
    );
  }

  return method.trim().toUpperCase();
}

function validatePathname(pathname) {
  if (
    typeof pathname !== 'string' ||
    pathname.length === 0 ||
    !pathname.startsWith('/') ||
    pathname.includes('?') ||
    pathname.includes('#')
  ) {
    throw new TypeError(
      'pathname must be an absolute path without query or fragment'
    );
  }

  return pathname;
}

function routeKey(method, pathname) {
  return `${method} ${pathname}`;
}

function createRouter(options = {}) {
  const logger = options.logger || null;
  const routes = new Map();

  function register(method, pathname, handler) {
    const normalizedMethod = normalizeMethod(
      method
    );

    const normalizedPathname = validatePathname(
      pathname
    );

    if (typeof handler !== 'function') {
      throw new TypeError(
        'handler must be a function'
      );
    }

    const key = routeKey(
      normalizedMethod,
      normalizedPathname
    );

    if (routes.has(key)) {
      throw new Error(
        `route already registered: ${key}`
      );
    }

    routes.set(
      key,
      handler
    );
  }

  async function handle(request, response) {
    const method = normalizeMethod(
      request && request.method
    );

    let pathname;

    try {
      pathname = new URL(
        request && request.url
          ? request.url
          : '/',
        'http://localhost'
      ).pathname;
    } catch (_error) {
      response.statusCode = 404;
      response.end('');
      return;
    }

    const handler = routes.get(
      routeKey(
        method,
        pathname
      )
    );

    if (!handler) {
      response.statusCode = 404;
      response.end('');
      return;
    }

    try {
      await handler(
        request,
        response
      );
    } catch (_error) {
      if (
        logger &&
        typeof logger.error === 'function'
      ) {
        logger.error(
          'http_handler_failed',
          {
            method,
            pathname,
          }
        );
      }

      if (!response.ended) {
        response.statusCode = 500;
        response.end('');
      }
    }
  }

  function routeCount() {
    return routes.size;
  }

  return Object.freeze({
    register,
    handle,
    routeCount,
  });
}

module.exports = {
  createRouter,
};
