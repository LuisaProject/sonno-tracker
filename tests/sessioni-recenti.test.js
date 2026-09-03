import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formattaDataOra, formattaRigaSessione } from '../src/sessioni-recenti.js';

test('formattaDataOra: formatta data e ora locali con zero-padding', () => {
  const iso = new Date(2026, 8, 3, 8, 5).toISOString();
  assert.equal(formattaDataOra(iso), '03/09/2026 08:05');
});

test('formattaRigaSessione: sessione chiusa mostra inizio e fine', () => {
  const sessione = {
    id: '1',
    inizio: new Date(2026, 8, 2, 22, 0).toISOString(),
    fine: new Date(2026, 8, 3, 6, 30).toISOString(),
  };
  const riga = formattaRigaSessione(sessione);
  assert.equal(riga.inizioLabel, '02/09/2026 22:00');
  assert.equal(riga.fineLabel, '03/09/2026 06:30');
  assert.equal(riga.inCorso, false);
});

test('formattaRigaSessione: sessione aperta mostra "in corso"', () => {
  const sessione = {
    id: '2',
    inizio: new Date(2026, 8, 3, 23, 0).toISOString(),
    fine: null,
  };
  const riga = formattaRigaSessione(sessione);
  assert.equal(riga.fineLabel, 'in corso');
  assert.equal(riga.inCorso, true);
});
