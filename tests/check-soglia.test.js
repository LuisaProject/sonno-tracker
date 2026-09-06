import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOrarioInvio, sceglifraseMotivazionale, deveInviareAvvisoSoglia, controllaSogliaSerale } from '../scripts/check-soglia.js';
import { sommaOreInRange } from '../src/history.js';
import { createFakeSupabaseClient } from './helpers/fake-supabase-client.js';

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

test('isOrarioInvio: vero fino alle 18:14 (tollera il ritardo del cron)', () => {
  // 2026-01-15 17:14 UTC = 18:14 CET
  const now = new Date('2026-01-15T17:14:00.000Z');
  assert.equal(isOrarioInvio(now), true);
});

test('isOrarioInvio: falso dalle 18:15 in poi', () => {
  // 2026-01-15 17:15 UTC = 18:15 CET
  const now = new Date('2026-01-15T17:15:00.000Z');
  assert.equal(isOrarioInvio(now), false);
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

test('sceglifraseMotivazionale: sceglie la frase in base a randomFn e sostituisce {nome}', () => {
  const frasiAttese = [
    "Mario, dai, impegnati un po' di più: ce la puoi fare! 💪",
    'Mario, un piccolo sforzo in più stasera e domani ti senti meglio. Forza!',
    'Coraggio Mario, un passo alla volta si migliora. Puoi farcela!',
    'Mario, oggi è andata così, ma domani puoi fare meglio. Non mollare!',
    'Piccoli aggiustamenti, grandi risultati: Mario, sei sulla buona strada. Spingi un po\' di più!',
  ];
  frasiAttese.forEach((atteso, indice) => {
    const randomFn = () => indice / frasiAttese.length;
    assert.equal(sceglifraseMotivazionale('Mario', randomFn), atteso);
  });
});

test('deveInviareAvvisoSoglia: vero se non è mai stato inviato (campo null)', () => {
  const profile = { ultimo_avviso_soglia_data: null };
  assert.equal(deveInviareAvvisoSoglia(profile, '2026-09-06'), true);
});

test('deveInviareAvvisoSoglia: vero se l\'ultimo invio è di un giorno diverso da oggi', () => {
  const profile = { ultimo_avviso_soglia_data: '2026-09-05' };
  assert.equal(deveInviareAvvisoSoglia(profile, '2026-09-06'), true);
});

test('deveInviareAvvisoSoglia: falso se l\'ultimo invio è già di oggi', () => {
  const profile = { ultimo_avviso_soglia_data: '2026-09-06' };
  assert.equal(deveInviareAvvisoSoglia(profile, '2026-09-06'), false);
});

test('controllaSogliaSerale: non fa nulla fuori dalla finestra di invio (no query, no invio)', async (t) => {
  const now = new Date('2026-01-15T12:00:00.000Z'); // non è la finestra 18:00-18:14 a Roma
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('fetch non doveva essere chiamato');
  });
  const profile = { id: 'p1', eta: 30, nome: 'Mario', ultimo_avviso_soglia_data: null };
  const client = createFakeSupabaseClient({});

  await controllaSogliaSerale(client, profile, now);

  assert.equal(fetchMock.mock.callCount(), 0);
  assert.deepEqual(client.calls, []);
});

test('controllaSogliaSerale: salta se l\'avviso è già stato inviato oggi', async (t) => {
  const now = new Date('2026-01-15T17:05:00.000Z'); // 18:05 a Roma
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('fetch non doveva essere chiamato');
  });
  const profile = { id: 'p1', eta: 30, nome: 'Mario', ultimo_avviso_soglia_data: '2026-01-15' };
  const client = createFakeSupabaseClient({ sessioni_sonno: { data: [], error: null } });

  await controllaSogliaSerale(client, profile, now);

  assert.equal(fetchMock.mock.callCount(), 0);
  assert.deepEqual(client.calls, []);
});

test('controllaSogliaSerale: invia il messaggio e aggiorna la data se sopra soglia e non ancora inviato oggi', async (t) => {
  const now = new Date('2026-01-15T17:05:00.000Z'); // 18:05 a Roma
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200 }));
  const profile = { id: 'p1', eta: 30, nome: 'Mario', ultimo_avviso_soglia_data: null };
  // eta 30 -> soglia 9h (verificato in soglia.test.js); sessione da 10h nelle ultime 24h -> sopra soglia
  const sessioni = [{ id: 's1', inizio: '2026-01-15T00:00:00.000Z', fine: '2026-01-15T10:00:00.000Z' }];
  const client = createFakeSupabaseClient({ sessioni_sonno: { data: sessioni, error: null } });

  await controllaSogliaSerale(client, profile, now);

  assert.equal(fetchMock.mock.callCount(), 1);
  const updateCall = client.calls.find((c) => c.tabella === 'profiles' && c.metodo === 'update');
  assert.ok(updateCall, 'doveva aggiornare la tabella profiles');
  assert.deepEqual(updateCall.args[0], { ultimo_avviso_soglia_data: '2026-01-15' });
});

test('controllaSogliaSerale: non invia né aggiorna se sotto soglia', async (t) => {
  const now = new Date('2026-01-15T17:05:00.000Z'); // 18:05 a Roma
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('fetch non doveva essere chiamato');
  });
  const profile = { id: 'p1', eta: 30, nome: 'Mario', ultimo_avviso_soglia_data: null };
  const client = createFakeSupabaseClient({ sessioni_sonno: { data: [], error: null } });

  await controllaSogliaSerale(client, profile, now);

  assert.equal(fetchMock.mock.callCount(), 0);
  assert.deepEqual(client.calls, []);
});
