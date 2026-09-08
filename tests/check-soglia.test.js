import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOrarioInvio, sceglifraseMotivazionale, deveInviareAvvisoSoglia, controllaSogliaSerale, controllaRientriDiurni, isOrarioPromemoria, devePromemoria21, controllaPromemoria21 } from '../scripts/check-soglia.js';
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

test('controllaRientriDiurni: invia e marca la sessione come notificata se è un rientro diurno non ancora notificato', async (t) => {
  const now = new Date('2026-01-15T09:05:00.000Z'); // 10:05 a Roma
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200 }));
  const profile = { id: 'p1', nome: 'Mario' };
  const sessioni = [
    { id: 's1', inizio: '2026-01-15T09:00:00.000Z', fine: null, rientro_diurno_notificato: false },
  ];
  const client = createFakeSupabaseClient({ sessioni_sonno: { data: sessioni, error: null } });

  await controllaRientriDiurni(client, profile, now);

  assert.equal(fetchMock.mock.callCount(), 1);
  const updateCall = client.calls.find((c) => c.tabella === 'sessioni_sonno' && c.metodo === 'update');
  assert.ok(updateCall, 'doveva aggiornare la sessione');
  assert.deepEqual(updateCall.args[0], { rientro_diurno_notificato: true });
  const eqCall = client.calls.find((c) => c.metodo === 'eq');
  assert.deepEqual(eqCall.args, ['id', 's1']);
});

test('controllaRientriDiurni: salta se la sessione è già stata notificata', async (t) => {
  const now = new Date('2026-01-15T09:05:00.000Z'); // 10:05 a Roma
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('fetch non doveva essere chiamato');
  });
  const profile = { id: 'p1', nome: 'Mario' };
  const sessioni = [
    { id: 's1', inizio: '2026-01-15T09:00:00.000Z', fine: null, rientro_diurno_notificato: true },
  ];
  const client = createFakeSupabaseClient({ sessioni_sonno: { data: sessioni, error: null } });

  await controllaRientriDiurni(client, profile, now);

  assert.equal(fetchMock.mock.callCount(), 0);
  assert.deepEqual(client.calls, []);
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

test('isOrarioPromemoria: vero alle 21:00 a Roma e fino alle 21:14', () => {
  assert.equal(isOrarioPromemoria(new Date('2026-01-15T20:00:00.000Z')), true); // 21:00 CET
  assert.equal(isOrarioPromemoria(new Date('2026-01-15T20:14:00.000Z')), true); // 21:14 CET
});

test('isOrarioPromemoria: falso dalle 21:15 in poi e in altri orari', () => {
  assert.equal(isOrarioPromemoria(new Date('2026-01-15T20:15:00.000Z')), false); // 21:15 CET
  assert.equal(isOrarioPromemoria(new Date('2026-01-15T12:00:00.000Z')), false);
});

test('devePromemoria21: falso se c\'è già una sessione aperta', () => {
  const profile = { ultimo_promemoria_data: null };
  assert.equal(devePromemoria21(profile, true, '2026-01-15'), false);
});

test('devePromemoria21: vero se nessuna sessione aperta e mai inviato prima', () => {
  const profile = { ultimo_promemoria_data: null };
  assert.equal(devePromemoria21(profile, false, '2026-01-15'), true);
});

test('devePromemoria21: falso se già inviato oggi', () => {
  const profile = { ultimo_promemoria_data: '2026-01-15' };
  assert.equal(devePromemoria21(profile, false, '2026-01-15'), false);
});

test('controllaPromemoria21: non fa nulla fuori dalla finestra 21:00-21:14 (no query, no invio)', async (t) => {
  const now = new Date('2026-01-15T12:00:00.000Z');
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('fetch non doveva essere chiamato');
  });
  const profile = { id: 'p1', nome: 'Mario', ultimo_promemoria_data: null };
  const client = createFakeSupabaseClient({});

  await controllaPromemoria21(client, profile, now);

  assert.equal(fetchMock.mock.callCount(), 0);
  assert.deepEqual(client.calls, []);
});

test('controllaPromemoria21: non invia se esiste già una sessione aperta', async (t) => {
  const now = new Date('2026-01-15T20:05:00.000Z'); // 21:05 a Roma
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('fetch non doveva essere chiamato');
  });
  const profile = { id: 'p1', nome: 'Mario', ultimo_promemoria_data: null };
  const sessioniAperte = [{ id: 's1', inizio: '2026-01-15T19:00:00.000Z', fine: null }];
  const client = createFakeSupabaseClient({ sessioni_sonno: { data: sessioniAperte, error: null } });

  await controllaPromemoria21(client, profile, now);

  assert.equal(fetchMock.mock.callCount(), 0);
  assert.deepEqual(client.calls, []);
});

test('controllaPromemoria21: invia e aggiorna la data se nessuna sessione aperta e non ancora inviato oggi', async (t) => {
  const now = new Date('2026-01-15T20:05:00.000Z'); // 21:05 a Roma
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200 }));
  const profile = { id: 'p1', nome: 'Mario', ultimo_promemoria_data: null };
  const client = createFakeSupabaseClient({ sessioni_sonno: { data: [], error: null } });

  await controllaPromemoria21(client, profile, now);

  assert.equal(fetchMock.mock.callCount(), 1);
  const updateCall = client.calls.find((c) => c.tabella === 'profiles' && c.metodo === 'update');
  assert.ok(updateCall, 'doveva aggiornare la tabella profiles');
  assert.deepEqual(updateCall.args[0], { ultimo_promemoria_data: '2026-01-15' });
});

test('controllaPromemoria21: salta se già inviato oggi', async (t) => {
  const now = new Date('2026-01-15T20:05:00.000Z'); // 21:05 a Roma
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('fetch non doveva essere chiamato');
  });
  const profile = { id: 'p1', nome: 'Mario', ultimo_promemoria_data: '2026-01-15' };
  const client = createFakeSupabaseClient({ sessioni_sonno: { data: [], error: null } });

  await controllaPromemoria21(client, profile, now);

  assert.equal(fetchMock.mock.callCount(), 0);
  assert.deepEqual(client.calls, []);
});

// --- Riepilogo settimanale ---------------------------------------------------

import {
  isOrarioRiepilogoSettimanale,
  deveInviareRiepilogoSettimanale,
  costruisciFraseConfronto,
  controllaRiepilogoSettimanale,
} from '../scripts/check-soglia.js';

// Sessione che resta interamente dentro il giorno locale indicato (Roma).
function sessioneDelGiorno(dataISO, ore) {
  const inizio = new Date(`${dataISO}T02:00:00.000Z`);
  return {
    id: `${dataISO}`,
    inizio: inizio.toISOString(),
    fine: new Date(inizio.getTime() + ore * 3_600_000).toISOString(),
  };
}

function settimanaDi(giorni, ore) {
  return giorni.map((g) => sessioneDelGiorno(g, ore));
}

const SETTIMANA_PRECEDENTE = ['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06'];
const SETTIMANA_CORRENTE = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'];
const DOMENICA_SERA = new Date('2026-09-13T18:05:00.000Z'); // domenica 13/09/2026, 20:05 a Roma

function corpoMessaggio(fetchMock) {
  return JSON.parse(fetchMock.mock.calls[0].arguments[1].body).text;
}

test('isOrarioRiepilogoSettimanale: vero la domenica dalle 20:00 alle 20:14 a Roma', () => {
  assert.equal(isOrarioRiepilogoSettimanale(new Date('2026-09-13T18:00:00.000Z')), true); // 20:00 CEST
  assert.equal(isOrarioRiepilogoSettimanale(new Date('2026-09-13T18:14:00.000Z')), true); // 20:14 CEST
});

test('isOrarioRiepilogoSettimanale: falso dalle 20:15, in altri orari e negli altri giorni', () => {
  assert.equal(isOrarioRiepilogoSettimanale(new Date('2026-09-13T18:15:00.000Z')), false); // domenica 20:15
  assert.equal(isOrarioRiepilogoSettimanale(new Date('2026-09-13T12:00:00.000Z')), false); // domenica 14:00
  assert.equal(isOrarioRiepilogoSettimanale(new Date('2026-09-12T18:05:00.000Z')), false); // sabato 20:05
});

test('deveInviareRiepilogoSettimanale: vero se mai inviato o inviato in un altro giorno, falso se già oggi', () => {
  assert.equal(deveInviareRiepilogoSettimanale({ ultimo_riepilogo_data: null }, '2026-09-13'), true);
  assert.equal(deveInviareRiepilogoSettimanale({ ultimo_riepilogo_data: '2026-09-06' }, '2026-09-13'), true);
  assert.equal(deveInviareRiepilogoSettimanale({ ultimo_riepilogo_data: '2026-09-13' }, '2026-09-13'), false);
});

test('costruisciFraseConfronto: sotto i 15 minuti di differenza è stabile', () => {
  const frase = costruisciFraseConfronto(8, 8 + 10 / 60); // 10 minuti in meno
  assert.match(frase, /stabile/);
  assert.match(frase, /10 minuti/);
  assert.doesNotMatch(frase, /meglio|peggio/);
});

test('costruisciFraseConfronto: fra 15 minuti e 1 ora in meno -> leggermente meglio, col valore reale', () => {
  const frase = costruisciFraseConfronto(8, 8 + 40 / 60); // 40 minuti in meno
  assert.match(frase, /leggermente meglio/);
  assert.match(frase, /40 minuti in meno/);
});

test('costruisciFraseConfronto: fra 15 minuti e 1 ora in più -> leggermente peggio', () => {
  const frase = costruisciFraseConfronto(8 + 30 / 60, 8);
  assert.match(frase, /leggermente peggio/);
  assert.match(frase, /30 minuti in più/);
});

test('costruisciFraseConfronto: oltre 1 ora -> molto meglio / molto peggio', () => {
  assert.match(costruisciFraseConfronto(8, 10), /molto meglio.*2h 0m in meno/);
  assert.match(costruisciFraseConfronto(10, 8), /molto peggio.*2h 0m in più/);
});

test('costruisciFraseConfronto: esattamente 1 ora resta nella fascia "leggermente"', () => {
  assert.match(costruisciFraseConfronto(8, 9), /leggermente meglio/);
});

test('controllaRiepilogoSettimanale: non fa nulla fuori dalla finestra (no query, no invio)', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('fetch non doveva essere chiamato');
  });
  const profile = { id: 'p1', eta: 30, nome: 'Mario', ultimo_riepilogo_data: null };
  const client = createFakeSupabaseClient({});

  await controllaRiepilogoSettimanale(client, profile, new Date('2026-09-13T12:00:00.000Z'));

  assert.equal(fetchMock.mock.callCount(), 0);
  assert.deepEqual(client.calls, []);
});

test('controllaRiepilogoSettimanale: salta se già inviato oggi', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('fetch non doveva essere chiamato');
  });
  const profile = { id: 'p1', eta: 30, nome: 'Mario', ultimo_riepilogo_data: '2026-09-13' };
  const client = createFakeSupabaseClient({ sessioni_sonno: { data: [], error: null } });

  await controllaRiepilogoSettimanale(client, profile, DOMENICA_SERA);

  assert.equal(fetchMock.mock.callCount(), 0);
  assert.deepEqual(client.calls, []);
});

test('controllaRiepilogoSettimanale: senza storico non invia nulla', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('fetch non doveva essere chiamato');
  });
  const profile = { id: 'p1', eta: 30, nome: 'Mario', ultimo_riepilogo_data: null };
  const client = createFakeSupabaseClient({ sessioni_sonno: { data: [], error: null } });

  await controllaRiepilogoSettimanale(client, profile, DOMENICA_SERA);

  assert.equal(fetchMock.mock.callCount(), 0);
  const updateCall = client.calls.find((c) => c.metodo === 'update');
  assert.equal(updateCall, undefined);
});

test('controllaRiepilogoSettimanale: invia statistiche, confronto e record, poi aggiorna ultimo_riepilogo_data', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200 }));
  const profile = { id: 'p1', eta: 30, nome: 'Mario', ultimo_riepilogo_data: null }; // soglia 9h
  const sessioni = [
    ...settimanaDi(SETTIMANA_PRECEDENTE, 10), // media 10h -> sfora di 1h
    ...settimanaDi(SETTIMANA_CORRENTE, 8), // media 8h -> sotto soglia
  ];
  const client = createFakeSupabaseClient({ sessioni_sonno: { data: sessioni, error: null } });

  await controllaRiepilogoSettimanale(client, profile, DOMENICA_SERA);

  assert.equal(fetchMock.mock.callCount(), 1);
  const testo = corpoMessaggio(fetchMock);
  assert.match(testo, /07\/09 → 13\/09/);
  assert.match(testo, /Media giornaliera: 8h 0m \(soglia 9h\)/);
  assert.match(testo, /Giorni sopra soglia: 0 su 7/);
  assert.match(testo, /molto meglio: 2h 0m in meno/);
  assert.match(testo, /🏆 Nuovo record personale!/);

  const updateCall = client.calls.find((c) => c.tabella === 'profiles' && c.metodo === 'update');
  assert.deepEqual(updateCall.args[0], { ultimo_riepilogo_data: '2026-09-13' });
});

test('controllaRiepilogoSettimanale: nessun record se una settimana passata è migliore', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200 }));
  const profile = { id: 'p1', eta: 30, nome: 'Mario', ultimo_riepilogo_data: null };
  const sessioni = [
    ...settimanaDi(SETTIMANA_PRECEDENTE, 10), // media 10h
    ...settimanaDi(SETTIMANA_CORRENTE, 11), // media 11h, peggiore
  ];
  const client = createFakeSupabaseClient({ sessioni_sonno: { data: sessioni, error: null } });

  await controllaRiepilogoSettimanale(client, profile, DOMENICA_SERA);

  const testo = corpoMessaggio(fetchMock);
  assert.doesNotMatch(testo, /record/);
  assert.match(testo, /leggermente peggio: 1h 0m in più/);
  assert.match(testo, /Giorni sopra soglia: 7 su 7/);
});

test('controllaRiepilogoSettimanale: senza settimana precedente niente frase di confronto né record', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200 }));
  const profile = { id: 'p1', eta: 30, nome: 'Mario', ultimo_riepilogo_data: null };
  const client = createFakeSupabaseClient({
    sessioni_sonno: { data: settimanaDi(SETTIMANA_CORRENTE, 8), error: null },
  });

  await controllaRiepilogoSettimanale(client, profile, DOMENICA_SERA);

  const testo = corpoMessaggio(fetchMock);
  assert.match(testo, /Media giornaliera: 8h 0m/);
  assert.doesNotMatch(testo, /Rispetto alla settimana scorsa/);
  assert.doesNotMatch(testo, /record/);
});
