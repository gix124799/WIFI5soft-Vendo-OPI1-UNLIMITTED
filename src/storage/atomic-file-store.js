'use strict';

const path = require('node:path');
const fsPromises = require('node:fs/promises');
const {
  randomBytes: defaultRandomBytes
} = require('node:crypto');

const UNSUPPORTED_DIR_SYNC_CODES = new Set([
  'EINVAL',
  'ENOSYS',
  'ENOTSUP',
  'EOPNOTSUPP',
  'EPERM'
]);

function createAtomicFileStore({
  root,
  fsImpl = fsPromises,
  randomBytes = defaultRandomBytes
} = {}) {
  if (
    typeof root !== 'string' ||
    !path.isAbsolute(root)
  ) {
    throw new TypeError(
      'store root must be an absolute path'
    );
  }

  if (
    !fsImpl ||
    typeof fsImpl !== 'object'
  ) {
    throw new TypeError(
      'fsImpl must be an object'
    );
  }

  if (typeof randomBytes !== 'function') {
    throw new TypeError(
      'randomBytes must be a function'
    );
  }

  const normalizedRoot = path.resolve(root);

  function resolveRequested(relativePath) {
    if (
      typeof relativePath !== 'string' ||
      relativePath.trim() === ''
    ) {
      throw new TypeError(
        'requested path must be a non-empty relative path'
      );
    }

    if (path.isAbsolute(relativePath)) {
      throw new TypeError(
        'requested path must be relative'
      );
    }

    const target = path.resolve(
      normalizedRoot,
      relativePath
    );

    const relative = path.relative(
      normalizedRoot,
      target
    );

    if (
      relative === '' ||
      relative === '..' ||
      relative.startsWith(
        '..' + path.sep
      ) ||
      path.isAbsolute(relative)
    ) {
      throw new TypeError(
        'requested path traversal outside store root'
      );
    }

    return target;
  }

  async function syncDirectory(directory) {
    let handle;

    try {
      handle = await fsImpl.open(
        directory,
        'r'
      );

      await handle.sync();
    } catch (error) {
      if (
        !error ||
        !UNSUPPORTED_DIR_SYNC_CODES.has(
          error.code
        )
      ) {
        throw error;
      }
    } finally {
      if (handle) {
        await handle.close().catch(() => {});
      }
    }
  }

  async function readUtf8(relativePath) {
    const target = resolveRequested(
      relativePath
    );

    return fsImpl.readFile(
      target,
      'utf8'
    );
  }

  async function writeUtf8(
    relativePath,
    content
  ) {
    if (typeof content !== 'string') {
      throw new TypeError(
        'content must be a string'
      );
    }

    const target = resolveRequested(
      relativePath
    );

    const directory = path.dirname(target);
    const basename = path.basename(target);

    await fsImpl.mkdir(
      directory,
      {
        recursive: true
      }
    );

    const suffix = randomBytes(8);

    if (
      !Buffer.isBuffer(suffix) ||
      suffix.length === 0
    ) {
      throw new TypeError(
        'randomBytes must return a non-empty Buffer'
      );
    }

    const temporary = path.join(
      directory,
      `.${basename}.${process.pid}.${suffix.toString('hex')}.tmp`
    );

    let handle = null;

    try {
      handle = await fsImpl.open(
        temporary,
        'wx',
        0o600
      );

      await handle.writeFile(
        content,
        'utf8'
      );

      await handle.sync();
      await handle.close();

      handle = null;

      await fsImpl.rename(
        temporary,
        target
      );

      await syncDirectory(directory);
    } catch (error) {
      if (handle) {
        await handle.close().catch(() => {});
      }

      await fsImpl.unlink(
        temporary
      ).catch(() => {});

      throw error;
    }
  }

  return Object.freeze({
    readUtf8,
    writeUtf8
  });
}

module.exports = {
  createAtomicFileStore
};
