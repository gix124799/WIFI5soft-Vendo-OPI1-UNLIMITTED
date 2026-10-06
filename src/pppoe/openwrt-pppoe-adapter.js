'use strict';

const fs = require('node:fs/promises');
const { writeAtomicDatabaseFile } = require('../db/atomic-db-file');

const DEFAULT_CHAP_SECRETS = '/etc/ppp/chap-secrets';
const HEADER = '#USERNAME  PROVIDER  PASSWORD  IPADDRESS';
const MARKER = '# ETHYLNET managed: ';

function credential(value, name) {
  if (typeof value !== 'string' || value.length === 0 || /[\0\r\n]/.test(value)) {
    throw new TypeError(`${name} credential is invalid`);
  }
  return value;
}
function quoted(value) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
function stripManaged(text, usernames) {
  const wanted = new Set(usernames.filter(Boolean));
  const lines = text.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith(MARKER) && wanted.has(line.slice(MARKER.length))) {
      i += 1;
      continue;
    }
    out.push(line);
  }
  return out.join('\n').replace(/\n+$/, '') + '\n';
}

function createOpenWrtPppoeAdapter(options = {}) {
  const chapSecretsPath = options.chapSecretsPath || DEFAULT_CHAP_SECRETS;
  const fsImpl = options.fsImpl || fs;
  const now = options.now || Date.now;
  async function readCurrent() {
    try { return await fsImpl.readFile(chapSecretsPath, 'utf8'); }
    catch (error) {
      if (error && error.code === 'ENOENT') return `${HEADER}\n`;
      throw error;
    }
  }
  async function write(text) {
    await writeAtomicDatabaseFile(chapSecretsPath, Buffer.from(text, 'utf8'), { fsImpl });
  }
  async function upsertAccount(account, previous = null) {
    if (!account || typeof account !== 'object') throw new TypeError('PPPoE account is required');
    const username = credential(account.username, 'username');
    const secret = credential(account.secret, 'secret');
    const previousUsername = previous && previous.username ? credential(previous.username, 'previous username') : null;
    let text = stripManaged(await readCurrent(), [username, previousUsername]);
    const expired = account.expiresAt !== null && account.expiresAt !== undefined && account.expiresAt <= now();
    if (account.enabled !== false && !expired) {
      text += `${MARKER}${username}\n${quoted(username)} * ${quoted(secret)} *\n`;
    }
    await write(text);
  }
  async function removeAccount(account) {
    if (!account || typeof account !== 'object') throw new TypeError('PPPoE account is required');
    const username = credential(account.username, 'username');
    await write(stripManaged(await readCurrent(), [username]));
  }
  return Object.freeze({ upsertAccount, removeAccount });
}

module.exports = { DEFAULT_CHAP_SECRETS, createOpenWrtPppoeAdapter };
