import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSogliaMassimaOre, calcolaSforamentoOre, formattaOreMinuti } from '../src/soglia.js';

test('getSogliaMassimaOre: adulto 30 anni -> 9 ore', () => {
  assert.equal(getSogliaMassimaOre(30), 9);
});

test('getSogliaMassimaOre: bambino 8 anni -> 12 ore', () => {
  assert.equal(getSogliaMassimaOre(8), 12);
});

test('getSogliaMassimaOre: adolescente 15 anni -> 10 ore', () => {
  assert.equal(getSogliaMassimaOre(15), 10);
});

test('getSogliaMassimaOre: anziano 70 anni -> 8 ore', () => {
  assert.equal(getSogliaMassimaOre(70), 8);
});

test('getSogliaMassimaOre: 62 anni -> 9 ore', () => {
  assert.equal(getSogliaMassimaOre(62), 9);
});

test('calcolaSforamentoOre: sotto soglia -> 0', () => {
  assert.equal(calcolaSforamentoOre(8, 9), 0);
});

test('calcolaSforamentoOre: sopra soglia -> differenza', () => {
  assert.equal(calcolaSforamentoOre(10.5, 9), 1.5);
});

test('formattaOreMinuti: converte decimali in "Xh Ym"', () => {
  assert.equal(formattaOreMinuti(1.5), '1h 30m');
  assert.equal(formattaOreMinuti(0.25), '0h 15m');
});
