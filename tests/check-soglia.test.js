import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOrarioInvio } from '../scripts/check-soglia.js';
import { sommaOreInRange } from '../src/history.js';

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

test('sommaOreInRange: sessione aperta iniziata prima di 24h rientra nella finestra', () => {
  // Sessione aperta iniziata 30 ore prima di now, ancora aperta (fine: null)
  // Caso limite: qualcuno rimasto a letto 30 ore, il calcolo deve considerare
  // solo le ultime 24 ore
  const now = new Date('2026-09-03T14:00:00.000Z');
  const rangeStart = new Date(now.getTime() - 24 * 3_600_000); // 24h prima = 2026-09-02T14:00:00.000Z
  const sessioneAperta = [
    { id: '1', inizio: '2026-09-02T08:00:00.000Z', fine: null }, // iniziata 30 ore prima
  ];
  // Sessione: 2026-09-02T08:00:00.000Z - (aperta)
  // Range: 2026-09-02T14:00:00.000Z - 2026-09-03T14:00:00.000Z
  // Overlap: dalle 14:00 del 2 set alle 14:00 del 3 set = 24 ore
  const ore = sommaOreInRange(sessioneAperta, rangeStart, now, now);
  assert.equal(ore, 24);
});
