import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startSession, endSession, loadQueue } from '../src/queue.js';
import { syncQueue } from '../src/sync.js';

function creaStorageFinto() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, v),
  };
}

test('syncQueue rimuove dalla coda le sessioni chiuse sincronizzate con successo', async () => {
  const storage = creaStorageFinto();
  startSession(storage, 'id-1', '2026-09-02T22:00:00.000Z');
  endSession(storage, 'id-1', '2026-09-03T06:00:00.000Z');

  await syncQueue(storage, 'user-1', async () => {});

  assert.equal(loadQueue(storage).length, 0);
});

test('syncQueue mantiene in coda le sessioni ancora aperte', async () => {
  const storage = creaStorageFinto();
  startSession(storage, 'id-1', '2026-09-02T22:00:00.000Z');

  await syncQueue(storage, 'user-1', async () => {});

  assert.equal(loadQueue(storage).length, 1);
});

test('syncQueue mantiene in coda le sessioni che falliscono la sincronizzazione', async () => {
  const storage = creaStorageFinto();
  startSession(storage, 'id-1', '2026-09-02T22:00:00.000Z');
  endSession(storage, 'id-1', '2026-09-03T06:00:00.000Z');

  await syncQueue(storage, 'user-1', async () => {
    throw new Error('rete assente');
  });

  assert.equal(loadQueue(storage).length, 1);
});
