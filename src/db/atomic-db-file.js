'use strict';

const defaultFs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

function validateTarget(targetPath) {
  if (typeof targetPath !== 'string' || !path.isAbsolute(targetPath)) {
    throw new TypeError('database target path must be absolute');
  }

  return path.normalize(targetPath);
}

function validateBytes(bytes) {
  if (!(Buffer.isBuffer(bytes) || bytes instanceof Uint8Array)) {
    throw new TypeError('database bytes must be Buffer or Uint8Array');
  }

  return Buffer.from(bytes);
}

async function syncDirectory(directory, fsImpl) {
  let handle;

  try {
    handle = await fsImpl.open(directory, 'r');
    await handle.sync();
  } catch (error) {
    if (!['EINVAL', 'ENOTSUP', 'EBADF', 'EISDIR'].includes(error && error.code)) {
      throw error;
    }
  } finally {
    if (handle) {
      await handle.close();
    }
  }
}

async function writeAtomicDatabaseFile(targetPath, bytes, options = {}) {
  const target = validateTarget(targetPath);
  const payload = validateBytes(bytes);
  const fsImpl = options.fsImpl || defaultFs;
  const directory = path.dirname(target);
  const temp = `${target}.tmp-${process.pid}-${crypto.randomBytes(8).toString('hex')}`;

  await fsImpl.mkdir(directory, { recursive: true });

  let handle;
  let renamed = false;

  try {
    handle = await fsImpl.open(temp, 'wx', 0o600);
    await handle.writeFile(payload);
    await handle.sync();
    await handle.close();
    handle = null;

    await fsImpl.rename(temp, target);
    renamed = true;
    await syncDirectory(directory, fsImpl);
  } finally {
    if (handle) {
      try {
        await handle.close();
      } catch (_error) {
        // Best-effort close during failure cleanup.
      }
    }

    if (!renamed) {
      try {
        await fsImpl.unlink(temp);
      } catch (error) {
        if (!error || error.code !== 'ENOENT') {
          // Preserve the original write/rename error when one already exists.
        }
      }
    }
  }
}

module.exports = {
  writeAtomicDatabaseFile,
};
