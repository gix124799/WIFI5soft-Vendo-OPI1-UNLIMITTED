'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { openSqliteStore } = require('../../src/db/sqlite-store');
const { applyMigrations } = require('../../src/db/migrations');
const { createSettingsService } = require('../../src/settings/settings-service');

async function makeRoot(t) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'ethyl-settings-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  return root;
}

async function openReady(root) {
  const store = await openSqliteStore({ stateRoot: root });
  await applyMigrations(store);
  return store;
}

test('settings survive close and reopen', async (t) => {
  const root = await makeRoot(t);
  const first = await openReady(root);
  const service = createSettingsService({ store: first, now: () => 1000 });

  await service.set('portal.businessName', 'ETHYLNET');
  await service.set('vendo.enabled', true);

  assert.equal(service.get('portal.businessName'), 'ETHYLNET');
  assert.equal(service.get('vendo.enabled'), true);

  await first.close();

  const second = await openReady(root);
  t.after(() => second.close());
  const reopened = createSettingsService({ store: second, now: () => 2000 });

  assert.equal(reopened.get('portal.businessName'), 'ETHYLNET');
  assert.deepEqual(
    reopened.list().map(({ key, value }) => ({ key, value })),
    [
      { key: 'portal.businessName', value: 'ETHYLNET' },
      { key: 'vendo.enabled', value: true },
    ]
  );
});

test('validates setting keys and JSON-serializable values', async (t) => {
  const root = await makeRoot(t);
  const store = await openReady(root);
  t.after(() => store.close());
  const service = createSettingsService({ store });

  await assert.rejects(service.set('', 1), /key/i);
  await assert.rejects(service.set('bad', undefined), /serializable|json/i);
});
