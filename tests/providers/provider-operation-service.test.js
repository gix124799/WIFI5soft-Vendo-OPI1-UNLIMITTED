'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { openSqliteStore } = require('../../src/db/sqlite-store');
const { applyMigrations } = require('../../src/db/migrations');
const {
  createProviderOperationService,
} = require('../../src/providers/provider-operation-service');

async function rootFor(t) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'ethyl-provider-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  return root;
}

async function openReady(root) {
  const store = await openSqliteStore({ stateRoot: root });
  await applyMigrations(store);
  return store;
}

function serviceFor(store, adapters = {}, nowValue = 1000) {
  let n = 0;
  return createProviderOperationService({
    store,
    adapters,
    now: () => nowValue,
    createIdFn: (prefix) => `${prefix}_${++n}`,
  });
}

test('unconfigured provider records explicit unavailable operation', async (t) => {
  const root = await rootFor(t);
  const store = await openReady(root);
  t.after(() => store.close());
  const service = serviceFor(store);

  const result = await service.execute({
    provider: 'eload',
    operation: 'purchase',
    idempotencyKey: 'eload:1',
    request: { product: 'LOAD10' },
  });

  assert.equal(result.status, 'unavailable');
  assert.deepEqual(result.request, { product: 'LOAD10' });
  assert.equal(result.response, null);
});

test('request is persisted as pending before provider adapter is called', async (t) => {
  const root = await rootFor(t);
  const store = await openReady(root);
  t.after(() => store.close());
  let observed;
  const service = serviceFor(store, {
    eload: {
      async execute(input) {
        observed = store.all(
          'SELECT status, request_json FROM provider_operations WHERE idempotency_key = ?',
          [input.idempotencyKey]
        )[0];
        return { providerReference: 'P-1' };
      },
    },
  }, 2000);

  const result = await service.execute({
    provider: 'eload',
    operation: 'purchase',
    idempotencyKey: 'eload:pending:1',
    request: { number: '09170000000', amountMinor: 1000 },
  });

  assert.equal(observed.status, 'pending');
  assert.equal(JSON.parse(observed.request_json).amountMinor, 1000);
  assert.equal(result.status, 'succeeded');
  assert.deepEqual(result.response, { providerReference: 'P-1' });
});

test('provider failure is recorded as failed and does not fake success', async (t) => {
  const root = await rootFor(t);
  const store = await openReady(root);
  t.after(() => store.close());
  const service = serviceFor(store, {
    epay: {
      async execute() {
        throw new Error('provider offline');
      },
    },
  }, 3000);

  const result = await service.execute({
    provider: 'epay',
    operation: 'cashin',
    idempotencyKey: 'epay:fail:1',
    request: { amountMinor: 5000 },
  });

  assert.equal(result.status, 'failed');
  assert.match(result.response.error, /provider offline/i);
});

test('idempotency key returns prior terminal result without a second provider call', async (t) => {
  const root = await rootFor(t);
  const store = await openReady(root);
  t.after(() => store.close());
  let calls = 0;
  const service = serviceFor(store, {
    eload: {
      async execute() {
        calls += 1;
        return { providerReference: 'ONCE' };
      },
    },
  }, 4000);

  const input = {
    provider: 'eload',
    operation: 'purchase',
    idempotencyKey: 'eload:once:1',
    request: { product: 'LOAD20' },
  };
  const first = await service.execute(input);
  const second = await service.execute(input);
  assert.equal(first.status, 'succeeded');
  assert.equal(second.status, 'succeeded');
  assert.equal(calls, 1);
});

test('provider operations persist across restart', async (t) => {
  const root = await rootFor(t);
  const firstStore = await openReady(root);
  const first = serviceFor(firstStore);
  await first.execute({
    provider: 'eload',
    operation: 'status',
    idempotencyKey: 'eload:restart:1',
    request: {},
  });
  await firstStore.close();

  const secondStore = await openReady(root);
  t.after(() => secondStore.close());
  const second = serviceFor(secondStore);
  const row = second.getByIdempotencyKey('eload:restart:1');
  assert.equal(row.status, 'unavailable');
  assert.equal(row.provider, 'eload');
});
