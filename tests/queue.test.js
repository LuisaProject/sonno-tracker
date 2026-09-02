import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadQueue, startSession, endSession, getActiveSession, removeSession } from '../src/queue.js';

function creaStorageFinto() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, v),
  };
}

test('startSession aggiunge una sessione attiva alla coda', () => {
  const storage = creaStorageFinto();
  startSession(storage, 'id-1', '2026-09-02T22:00:00.000Z');
  const attiva = getActiveSession(storage);
  assert.equal(attiva.id, 'id-1');
  assert.equal(attiva.fine, null);
});

test('endSession chiude la sessione attiva', () => {
  const storage = creaStorageFinto();
  startSession(storage, 'id-1', '2026-09-02T22:00:00.000Z');
  endSession(storage, 'id-1', '2026-09-03T06:00:00.000Z');
  assert.equal(getActiveSession(storage), null);
  const queue = loadQueue(storage);
  assert.equal(queue[0].fine, '2026-09-03T06:00:00.000Z');
});

test('removeSession toglie la sessione dalla coda', () => {
  const storage = creaStorageFinto();
  startSession(storage, 'id-1', '2026-09-02T22:00:00.000Z');
  removeSession(storage, 'id-1');
  assert.equal(loadQueue(storage).length, 0);
});

test('getActiveSession restituisce null se non c\'è nessuna sessione aperta', () => {
  const storage = creaStorageFinto();
  assert.equal(getActiveSession(storage), null);
});
