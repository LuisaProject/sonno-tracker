// tests/history.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sommaOreInRange, buildDayView, buildWeekView, buildYearView, buildMonthView, isRientroDiurno } from '../src/history.js';

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

test('buildWeekView usa etichette date locali, non UTC', () => {
  // Verifica che l'etichetta corrente non sia influenzata da conversione UTC
  // Se this era broken: toISOString() convertiva in UTC e poteva mostrare il giorno precedente
  const now = new Date('2026-09-03T08:00:00.000Z');
  const punti = buildWeekView(sessioneUnaNotte, now);
  assert.equal(punti.length, 7);
  // Il punto più recente (ultimo nella lista) dovrebbe essere del 3 settembre
  const puntoPiuRecente = punti[punti.length - 1];
  assert.equal(puntoPiuRecente.label, '2026-09-03');
});

test('sommaOreInRange con sessione aperta (fine: null) usa il parametro now iniettato, non Date.now()', () => {
  // Sessione aperta (fine: null) iniziata ieri, ancora in corso
  const sessioneAperta = [
    { id: '1', inizio: '2026-09-02T22:00:00.000Z', fine: null },
  ];

  // Imposta now a un tempo fisso (non correlato al tempo reale)
  const now = new Date('2026-09-03T08:00:00.000Z'); // 10 ore dopo l'inizio

  // Calcola le ore nel primo giorno (dal 22:00 del 2 settembre al 00:00 del 3 settembre = 2 ore)
  const rangeStart1 = new Date('2026-09-02T00:00:00.000Z');
  const rangeEnd1 = new Date('2026-09-03T00:00:00.000Z');
  const ore1 = sommaOreInRange(sessioneAperta, rangeStart1, rangeEnd1, now);
  assert.equal(ore1, 2); // dalle 22:00 alle 00:00 = 2 ore

  // Calcola le ore nel secondo giorno (dal 00:00 del 3 settembre alle 08:00 del 3 settembre = 8 ore)
  const rangeStart2 = new Date('2026-09-03T00:00:00.000Z');
  const rangeEnd2 = new Date('2026-09-03T08:00:00.000Z');
  const ore2 = sommaOreInRange(sessioneAperta, rangeStart2, rangeEnd2, now);
  assert.equal(ore2, 8);

  // Totale: 2 + 8 = 10 ore (esattamente quello che ci aspettiamo da now iniettato)
  assert.equal(ore1 + ore2, 10);
});

test('isRientroDiurno: vero per una sessione iniziata alle 10:00 pochi minuti fa', () => {
  const sessione = { inizio: '2026-01-15T09:00:00.000Z', fine: null }; // 10:00 a Roma (UTC+1)
  const now = new Date('2026-01-15T09:05:00.000Z'); // 5 minuti dopo
  assert.equal(isRientroDiurno(sessione, now), true);
});

test('isRientroDiurno: falso se la sessione notturna è ancora aperta al mattino (fuori dalla finestra dei 20 minuti)', () => {
  const sessione = { inizio: '2026-01-14T22:00:00.000Z', fine: null }; // 23:00 a Roma del giorno prima
  const now = new Date('2026-01-15T07:10:00.000Z'); // controllata ore dopo, il mattino successivo
  assert.equal(isRientroDiurno(sessione, now), false);
});

test('isRientroDiurno: falso per un inizio alle 21:30 (fuori dalla fascia diurna 08:00-19:59)', () => {
  const sessione = { inizio: '2026-01-15T20:30:00.000Z', fine: null }; // 21:30 a Roma
  const now = new Date('2026-01-15T20:35:00.000Z'); // 5 minuti dopo, entro la finestra
  assert.equal(isRientroDiurno(sessione, now), false);
});
