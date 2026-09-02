import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOrarioInvio } from '../scripts/check-soglia.js';

test('isOrarioInvio: vero quando sono le 18:00 a Roma', () => {
  // 2026-01-15 17:00 UTC = 18:00 CET (Roma, ora solare, UTC+1)
  const now = new Date('2026-01-15T17:00:00.000Z');
  assert.equal(isOrarioInvio(now), true);
});

test('isOrarioInvio: vero quando sono le 18:00 a Roma in ora legale', () => {
  // 2026-07-15 16:00 UTC = 18:00 CEST (Roma, ora legale, UTC+2)
  const now = new Date('2026-07-15T16:00:00.000Z');
  assert.equal(isOrarioInvio(now), true);
});

test('isOrarioInvio: falso in altri orari', () => {
  const now = new Date('2026-01-15T12:00:00.000Z');
  assert.equal(isOrarioInvio(now), false);
});
