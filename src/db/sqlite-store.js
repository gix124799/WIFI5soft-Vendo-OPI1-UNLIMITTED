'use strict';

const defaultFs = require('node:fs/promises');
const path = require('node:path');

const {
  getSqliteEngine,
} = require('./sqlite-engine');

const {
  writeAtomicDatabaseFile,
} = require('./atomic-db-file');

const DEFAULT_DATABASE_RELATIVE_PATH = path.join(
  'ethyl',
  'ethyl.sqlite'
);

function resolveDatabasePath(
  stateRoot,
  relativePath = DEFAULT_DATABASE_RELATIVE_PATH
) {
  if (
    typeof stateRoot !== 'string' ||
    !path.isAbsolute(stateRoot)
  ) {
    throw new TypeError('state root must be an absolute path');
  }

  if (
    typeof relativePath !== 'string' ||
    relativePath.trim() === '' ||
    path.isAbsolute(relativePath)
  ) {
    throw new TypeError('database path must be a relative path inside state root');
  }

  const root = path.resolve(stateRoot);
  const target = path.resolve(root, relativePath);

  if (
    target === root ||
    !target.startsWith(root + path.sep)
  ) {
    throw new Error('database path must stay inside state root');
  }

  return target;
}

function rowsFromStatement(statement) {
  const rows = [];

  try {
    while (statement.step()) {
      rows.push(statement.getAsObject());
    }
  } finally {
    statement.free();
  }

  return rows;
}

function runIntegrityCheck(database) {
  const results = database.exec('PRAGMA integrity_check');

  if (
    results.length !== 1 ||
    results[0].values.length !== 1 ||
    results[0].values[0][0] !== 'ok'
  ) {
    throw new Error('SQLite database integrity check failed');
  }
}

async function fileExists(fsImpl, filename) {
  try {
    await fsImpl.access(filename);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

async function openSqliteStore(options = {}) {
  const stateRoot = options.stateRoot;
  const fsImpl = options.fsImpl || defaultFs;
  const engineProvider = options.engineProvider || getSqliteEngine;
  const databasePath = resolveDatabasePath(
    stateRoot,
    options.databaseRelativePath
  );

  await fsImpl.mkdir(path.dirname(databasePath), {
    recursive: true,
  });

  const SQL = await engineProvider();
  const existed = await fileExists(fsImpl, databasePath);
  let database;

  try {
    if (existed) {
      const bytes = await fsImpl.readFile(databasePath);
      database = new SQL.Database(bytes);
    } else {
      database = new SQL.Database();
      database.run('PRAGMA user_version = 0');
    }

    database.run('PRAGMA foreign_keys = ON');
    runIntegrityCheck(database);
  } catch (error) {
    if (database) {
      database.close();
    }

    throw new Error(
      `SQLite database integrity/open failure: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`
    );
  }

  let closed = false;

  function assertOpen() {
    if (closed) {
      throw new Error('SQLite store is closed');
    }
  }

  function exec(sql) {
    assertOpen();
    database.run(sql);
  }

  function run(sql, params = []) {
    assertOpen();
    database.run(sql, params);
  }

  function all(sql, params = []) {
    assertOpen();
    const statement = database.prepare(sql);

    if (params !== undefined) {
      statement.bind(params);
    }

    return rowsFromStatement(statement);
  }

  async function persist() {
    assertOpen();
    runIntegrityCheck(database);
    const bytes = Buffer.from(database.export());
    database.run('PRAGMA foreign_keys = ON');

    await writeAtomicDatabaseFile(
      databasePath,
      bytes,
      { fsImpl }
    );
  }

  async function close() {
    if (closed) {
      return;
    }

    await persist();
    database.close();
    closed = true;
  }

  const store = Object.freeze({
    databasePath,
    exec,
    run,
    all,
    persist,
    close,
    isClosed() {
      return closed;
    },
  });

  if (!existed) {
    await persist();
  }

  return store;
}

module.exports = {
  DEFAULT_DATABASE_RELATIVE_PATH,
  resolveDatabasePath,
  openSqliteStore,
};
