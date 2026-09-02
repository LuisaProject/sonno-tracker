// tests/history.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sommaOreInRange, buildDayView, buildWeekView, buildYearView } from '../src/history.js';

const sessioneUnaNotte = [
  { id: '1', inizio: '2026-09-02T22:00:00.000Z', fine: '2026-09-03T06:00:00.000Z' },
];

test('sommaOreInRange calcola la sovrapposizione in ore', () => {
  const start = new Date('2026-09-02T00:00:00.000Z');
  const end = new Date('2026-09-03T23:59:59.000Z');
  assert.equal(sommaOreInRange(sessioneUnaNotte, start, end), 8);
});

test('sommaOreInRange ignora sessioni fuori range', () => {
  const start = new Date('2026-01-01T00:00:00.000Z');
  const end = new Date('2026-01-02T00:00:00.000Z');
  assert.equal(sommaOreInRange(sessioneUnaNotte, start, end), 0);
});

test('buildDayView produce 24 punti orari', () => {
  const now = new Date('2026-09-03T08:00:00.000Z');
  const punti = buildDayView(sessioneUnaNotte, now);
  assert.equal(punti.length, 24);
  const totale = punti.reduce((tot, p) => tot + p.ore, 0);
  assert.equal(totale, 8);
});

test('buildWeekView produce 7 punti giornalieri', () => {
  const now = new Date('2026-09-03T08:00:00.000Z');
  const punti = buildWeekView(sessioneUnaNotte, now);
  assert.equal(punti.length, 7);
});

test('buildYearView produce 12 punti mensili con media giornaliera', () => {
  const now = new Date('2026-09-03T08:00:00.000Z');
  const punti = buildYearView(sessioneUnaNotte, now);
  assert.equal(punti.length, 12);
  const puntoSettembre = punti.find((p) => p.label === '2026-09');
  assert.ok(puntoSettembre.ore > 0);
});
