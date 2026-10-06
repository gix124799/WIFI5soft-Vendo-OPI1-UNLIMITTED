'use strict';

const { promisify } = require('node:util');
const { execFile: execFileCallback } = require('node:child_process');
const defaultExecFile = promisify(execFileCallback);
const NFT = '/usr/sbin/nft';
const MAC_RE = /^[0-9a-f]{2}(?::[0-9a-f]{2}){5}$/i;

function validateEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new TypeError('access entry must be an object');
  if (typeof entry.mac !== 'string' || !MAC_RE.test(entry.mac)) throw new TypeError('access MAC is invalid');
  if (!Number.isSafeInteger(entry.remainingSeconds) || entry.remainingSeconds <= 0 || entry.remainingSeconds > 31536000) {
    throw new TypeError('access remaining seconds must be a positive bounded integer');
  }
  return Object.freeze({ mac: entry.mac.toLowerCase(), remainingSeconds: entry.remainingSeconds });
}

function createOpenWrtAccessAdapter(options = {}) {
  const execFile = options.execFile || defaultExecFile;
  if (typeof execFile !== 'function') throw new TypeError('execFile is required');
  async function sync(entries) {
    if (!Array.isArray(entries)) throw new TypeError('access entries must be an array');
    const valid = entries.map(validateEntry);
    await execFile(NFT, ['flush','set','inet','fw4','ethyl_authorized_macs']);
    for (const entry of valid) {
      await execFile(NFT, [
        'add','element','inet','fw4','ethyl_authorized_macs','{',entry.mac,'timeout',`${entry.remainingSeconds}s`,'}'
      ]);
    }
  }
  return Object.freeze({ sync });
}

module.exports = { NFT, createOpenWrtAccessAdapter };
