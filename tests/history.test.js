// tests/history.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sommaOreInRange, buildDayView, buildWeekView, buildYearView, buildMonthView, isRientroDiurno, contaGiorniSenzaRientri } from '../src/history.js';

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

test('contaGiorniSenzaRientri: nessuna sessione mai -> 0 (nessuno storico da mostrare come pulito)', () => {
  const oggi = new Date('2026-01-15T12:00:00.000Z');
  assert.doesNotThrow(() => contaGiorniSenzaRientri([], oggi));
  assert.equal(contaGiorniSenzaRientri([], oggi), 0);
});

test('contaGiorniSenzaRientri: un rientro diurno 3 giorni fa -> streak 2', () => {
  const oggi = new Date('2026-01-15T12:00:00.000Z');
  const sessioni = [{ inizio: '2026-01-12T09:00:00.000Z', fine: null }]; // 10:00 a Roma, 3 giorni fa
  assert.equal(contaGiorniSenzaRientri(sessioni, oggi), 2);
});

test('contaGiorniSenzaRientri: un rientro diurno ieri -> streak 0', () => {
  const oggi = new Date('2026-01-15T12:00:00.000Z');
  const sessioni = [{ inizio: '2026-01-14T09:00:00.000Z', fine: null }]; // 10:00 a Roma, ieri
  assert.equal(contaGiorniSenzaRientri(sessioni, oggi), 0);
});

// --- Raggruppamenti a taglio di calendario -----------------------------------

import {
  raggruppaPerSettimanaCalendario,
  raggruppaPerMeseCalendario,
  trovaRecord,
  calcolaRiepilogoSettimanale,
} from '../src/history.js';

// Sessione di 8h che ricade interamente nel giorno locale indicato (Roma).
function notte(dataLocaleISO, ore = 8) {
  const inizio = new Date(`${dataLocaleISO}T02:00:00.000Z`); // 03:00/04:00 a Roma: la sessione resta nello stesso giorno locale
  const fine = new Date(inizio.getTime() + ore * 3_600_000);
  return { id: `${dataLocaleISO}-${ore}`, inizio: inizio.toISOString(), fine: fine.toISOString() };
}

test('raggruppaPerSettimanaCalendario: storico vuoto -> nessuna settimana', () => {
  const now = new Date('2026-09-09T12:00:00.000Z'); // mercoledì
  assert.deepEqual(raggruppaPerSettimanaCalendario([], now), []);
});

test('raggruppaPerSettimanaCalendario: una sola settimana (quella in corso) -> completa=false', () => {
  const now = new Date('2026-09-09T12:00:00.000Z'); // mercoledì 9 settembre 2026
  const settimane = raggruppaPerSettimanaCalendario([notte('2026-09-08')], now);
  assert.equal(settimane.length, 1);
  assert.equal(settimane[0].inizioSettimana, '2026-09-07'); // lunedì
  assert.equal(settimane[0].fineSettimana, '2026-09-13'); // domenica
  assert.equal(settimane[0].giorni.length, 7);
  assert.equal(settimane[0].completa, false);
});

test('raggruppaPerSettimanaCalendario: copre tutte le settimane dalla più vecchia a quella di now', () => {
  const now = new Date('2026-09-09T12:00:00.000Z');
  const settimane = raggruppaPerSettimanaCalendario([notte('2026-08-25'), notte('2026-09-08')], now);
  assert.deepEqual(
    settimane.map((s) => s.inizioSettimana),
    ['2026-08-24', '2026-08-31', '2026-09-07']
  );
  assert.deepEqual(settimane.map((s) => s.completa), [true, true, false]);
});

test('raggruppaPerSettimanaCalendario: la media è la somma delle ore diviso 7 e i giorni sono etichettati per data', () => {
  const now = new Date('2026-09-09T12:00:00.000Z');
  const settimane = raggruppaPerSettimanaCalendario([notte('2026-09-08', 14)], now);
  const settimana = settimane[0];
  assert.equal(settimana.media, 14 / 7);
  const martedi = settimana.giorni.find((g) => g.label === '2026-09-08');
  assert.equal(martedi.ore, 14);
  assert.equal(settimana.giorni.filter((g) => g.ore === 0).length, 6);
});

test('raggruppaPerMeseCalendario: storico vuoto -> nessun mese', () => {
  const now = new Date('2026-09-09T12:00:00.000Z');
  assert.deepEqual(raggruppaPerMeseCalendario([], now), []);
});

test('raggruppaPerMeseCalendario: un elemento per mese di calendario, solo l\'ultimo incompleto', () => {
  const now = new Date('2026-09-09T12:00:00.000Z');
  const mesi = raggruppaPerMeseCalendario([notte('2026-07-15'), notte('2026-09-08')], now);
  assert.deepEqual(mesi.map((m) => m.inizioMese), ['2026-07-01', '2026-08-01', '2026-09-01']);
  assert.deepEqual(mesi.map((m) => m.fineMese), ['2026-07-31', '2026-08-31', '2026-09-30']);
  assert.deepEqual(mesi.map((m) => m.giorni.length), [31, 31, 30]);
  assert.deepEqual(mesi.map((m) => m.completa), [true, true, false]);
});

test('raggruppaPerMeseCalendario: febbraio non bisestile ha 28 giorni', () => {
  const now = new Date('2026-03-10T12:00:00.000Z');
  const mesi = raggruppaPerMeseCalendario([notte('2026-02-10')], now);
  const febbraio = mesi.find((m) => m.inizioMese === '2026-02-01');
  assert.equal(febbraio.giorni.length, 28);
  assert.equal(febbraio.fineMese, '2026-02-28');
});

test('trovaRecord: nessun periodo completo -> null', () => {
  const now = new Date('2026-09-09T12:00:00.000Z');
  const settimane = raggruppaPerSettimanaCalendario([notte('2026-09-08')], now);
  assert.equal(trovaRecord(settimane, 9), null);
});

test('trovaRecord: elenco vuoto -> null', () => {
  assert.equal(trovaRecord([], 9), null);
});

test('trovaRecord: sceglie il periodo completo con lo sforamento medio più basso', () => {
  const periodi = [
    { inizioSettimana: '2026-08-24', media: 12, completa: true },
    { inizioSettimana: '2026-08-31', media: 9.5, completa: true },
    { inizioSettimana: '2026-09-07', media: 11, completa: false },
  ];
  assert.equal(trovaRecord(periodi, 9).inizioSettimana, '2026-08-31');
});

test('trovaRecord: a parità di sforamento (tutti sotto soglia) vince la media più bassa', () => {
  const periodi = [
    { inizioSettimana: '2026-08-24', media: 8.5, completa: true },
    { inizioSettimana: '2026-08-31', media: 7.2, completa: true },
  ];
  assert.equal(trovaRecord(periodi, 9).inizioSettimana, '2026-08-31');
});

test('trovaRecord: il periodo in corso è escluso anche se avrebbe il valore migliore', () => {
  const periodi = [
    { inizioSettimana: '2026-08-24', media: 12, completa: true },
    { inizioSettimana: '2026-08-31', media: 10, completa: true },
    { inizioSettimana: '2026-09-07', media: 2, completa: false }, // di gran lunga il migliore
  ];
  const record = trovaRecord(periodi, 9);
  assert.equal(record.inizioSettimana, '2026-08-31');
  assert.equal(record.completa, true);
});

test('calcolaRiepilogoSettimanale: media, giorno migliore/peggiore e giorni sopra soglia', () => {
  const giorni = [
    { label: '2026-09-07', ore: 6 },
    { label: '2026-09-08', ore: 12 },
    { label: '2026-09-09', ore: 9 },
    { label: '2026-09-10', ore: 10 },
  ];
  const riepilogo = calcolaRiepilogoSettimanale(giorni, 9);
  assert.equal(riepilogo.media, 37 / 4);
  assert.equal(riepilogo.giornoMigliore.label, '2026-09-07');
  assert.equal(riepilogo.giornoPeggiore.label, '2026-09-08');
  assert.equal(riepilogo.giorniSopraSoglia, 2); // 12 e 10; 9 è pari alla soglia, non sopra
});

test('calcolaRiepilogoSettimanale: elenco vuoto non esplode', () => {
  const riepilogo = calcolaRiepilogoSettimanale([], 9);
  assert.deepEqual(riepilogo, { media: 0, giornoMigliore: null, giornoPeggiore: null, giorniSopraSoglia: 0 });
});

import { formattaIntervalloDate } from '../src/history.js';

test('formattaIntervalloDate: mostra le due date in formato italiano', () => {
  assert.equal(formattaIntervalloDate('2026-09-07', '2026-09-13'), '07/09/2026 → 13/09/2026');
  assert.equal(formattaIntervalloDate('2026-02-01', '2026-02-28'), '01/02/2026 → 28/02/2026');
});

import { calcolaRangeFetch } from '../src/history.js';

test('calcolaRangeFetch: la vista Giorno chiede le ultime 24 ore', () => {
  const now = new Date('2026-09-09T15:30:00.000Z');
  const { inizio, fine } = calcolaRangeFetch('giorno', now);
  assert.equal(fine, now);
  assert.equal(now.getTime() - inizio.getTime(), 24 * 3_600_000);
});

test('calcolaRangeFetch: ogni vista copre almeno l\'intervallo che il grafico disegna', () => {
  const now = new Date('2026-09-09T15:30:00.000Z');
  const viste = {
    giorno: buildDayView,
    settimana: buildWeekView,
    mese: buildMonthView,
    anno: buildYearView,
  };
  for (const [periodo, costruisci] of Object.entries(viste)) {
    const { inizio } = calcolaRangeFetch(periodo, now);
    // Una sessione che finisce appena dopo l'inizio dell'intervallo deve
    // comparire nel grafico: se così non fosse, il fetch scarterebbe dati usati.
    const sessione = [{ id: 's1', inizio: new Date(inizio.getTime() + 60_000).toISOString(), fine: new Date(inizio.getTime() + 3_660_000).toISOString() }];
    const totale = costruisci(sessione, now).reduce((tot, p) => tot + p.ore, 0);
    assert.ok(totale > 0, `la vista ${periodo} non vede una sessione all'inizio del proprio intervallo`);
  }
});

test('calcolaRangeFetch: la vista Settimana parte dalla mezzanotte di 6 giorni fa', () => {
  const now = new Date('2026-09-09T15:30:00.000Z');
  const { inizio } = calcolaRangeFetch('settimana', now);
  const atteso = new Date(now.getTime() - 6 * 86_400_000);
  atteso.setHours(0, 0, 0, 0);
  assert.equal(inizio.getTime(), atteso.getTime());
});

test('calcolaRangeFetch: la vista Anno parte dal primo giorno di 11 mesi fa', () => {
  const now = new Date('2026-09-09T15:30:00.000Z');
  const { inizio } = calcolaRangeFetch('anno', now);
  assert.equal(inizio.getTime(), new Date(now.getFullYear(), now.getMonth() - 11, 1).getTime());
});

test('calcolaRangeFetch: periodo sconosciuto -> errore esplicito', () => {
  assert.throws(() => calcolaRangeFetch('decennio', new Date()), /Periodo sconosciuto/);
});

import { sessioneSovrapposta } from '../src/history.js';

test('sessioneSovrapposta: sovrapposizione piena -> restituisce la sessione in conflitto', () => {
  const esistenti = [{ id: 's1', inizio: '2026-09-08T22:00:00.000Z', fine: '2026-09-09T06:00:00.000Z' }];
  const nuova = { inizio: '2026-09-08T23:00:00.000Z', fine: '2026-09-09T05:00:00.000Z' }; // interamente dentro
  const conflitto = sessioneSovrapposta(nuova, esistenti);
  assert.equal(conflitto?.id, 's1');
});

test('sessioneSovrapposta: sovrapposizione parziale -> conflitto', () => {
  const esistenti = [{ id: 's1', inizio: '2026-09-08T22:00:00.000Z', fine: '2026-09-09T06:00:00.000Z' }];
  const nuova = { inizio: '2026-09-09T05:00:00.000Z', fine: '2026-09-09T09:00:00.000Z' }; // sconfina dopo
  assert.equal(sessioneSovrapposta(nuova, esistenti)?.id, 's1');
});

test('sessioneSovrapposta: intervalli adiacenti che si toccano ma non si sovrappongono -> nessun conflitto', () => {
  const esistenti = [{ id: 's1', inizio: '2026-09-08T22:00:00.000Z', fine: '2026-09-09T06:00:00.000Z' }];
  const primaAdiacente = { inizio: '2026-09-08T14:00:00.000Z', fine: '2026-09-08T22:00:00.000Z' }; // finisce quando inizia s1
  const dopoAdiacente = { inizio: '2026-09-09T06:00:00.000Z', fine: '2026-09-09T10:00:00.000Z' }; // inizia quando finisce s1
  assert.equal(sessioneSovrapposta(primaAdiacente, esistenti), null);
  assert.equal(sessioneSovrapposta(dopoAdiacente, esistenti), null);
});

test('sessioneSovrapposta: sessione esistente ancora aperta (fine null) che si sovrappone -> conflitto', () => {
  const now = new Date('2026-09-09T12:00:00.000Z');
  const esistenti = [{ id: 's1', inizio: '2026-09-09T08:00:00.000Z', fine: null }]; // aperta dalle 08:00, quindi "fino ad ora"
  const nuova = { inizio: '2026-09-09T10:00:00.000Z', fine: '2026-09-09T11:00:00.000Z' }; // dentro la finestra aperta
  assert.equal(sessioneSovrapposta(nuova, esistenti, now)?.id, 's1');
});

test('sessioneSovrapposta: sessione esistente aperta ma il nuovo intervallo è dopo now -> nessun conflitto', () => {
  const now = new Date('2026-09-09T12:00:00.000Z');
  const esistenti = [{ id: 's1', inizio: '2026-09-09T08:00:00.000Z', fine: null }];
  const nuova = { inizio: '2026-09-09T13:00:00.000Z', fine: '2026-09-09T14:00:00.000Z' }; // dopo now, la sessione aperta non arriva fin lì
  assert.equal(sessioneSovrapposta(nuova, esistenti, now), null);
});

test('sessioneSovrapposta: nessuna sovrapposizione tra intervalli distanti', () => {
  const esistenti = [{ id: 's1', inizio: '2026-09-08T22:00:00.000Z', fine: '2026-09-09T06:00:00.000Z' }];
  const nuova = { inizio: '2026-09-10T22:00:00.000Z', fine: '2026-09-11T06:00:00.000Z' };
  assert.equal(sessioneSovrapposta(nuova, esistenti), null);
});

test('sessioneSovrapposta: elenco vuoto -> nessun conflitto', () => {
  const nuova = { inizio: '2026-09-08T22:00:00.000Z', fine: '2026-09-09T06:00:00.000Z' };
  assert.equal(sessioneSovrapposta(nuova, []), null);
});

import { formattaPerInputLocale } from '../src/history.js';

test('formattaPerInputLocale: produce il formato che <input type="datetime-local"> si aspetta', () => {
  assert.match(formattaPerInputLocale('2026-09-08T22:05:00.000Z'), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
});

test('formattaPerInputLocale: rispetta il fuso locale (andata e ritorno sullo stesso istante)', () => {
  // new Date('YYYY-MM-DDTHH:mm') senza suffisso Z è interpretata come ora locale:
  // se la conversione fosse fatta con toISOString() (ora UTC) questo test fallirebbe
  // in ogni fuso diverso da UTC.
  for (const iso of ['2026-09-08T22:05:00.000Z', '2026-01-15T03:40:00.000Z', '2026-06-30T23:59:00.000Z']) {
    const atteso = new Date(iso).getTime() - new Date(iso).getSeconds() * 1000 - new Date(iso).getMilliseconds();
    assert.equal(new Date(formattaPerInputLocale(iso)).getTime(), atteso);
  }
});

test('formattaPerInputLocale: mese, giorno, ora e minuti sono sempre a due cifre', () => {
  // Istante scelto in modo che l'ora locale resti a una cifra in tutta Europa.
  assert.match(formattaPerInputLocale('2026-01-05T06:07:00.000Z'), /^2026-01-0\dT0\d:\d{2}$/);
});

test('formattaPerInputLocale: valore assente -> stringa vuota (campo lasciato vuoto)', () => {
  assert.equal(formattaPerInputLocale(null), '');
  assert.equal(formattaPerInputLocale(undefined), '');
  assert.equal(formattaPerInputLocale(''), '');
});

import { buildProgressiSettimanali } from '../src/history.js';

test('buildProgressiSettimanali: una barra per settimana con i giorni sopra soglia', () => {
  const now = new Date('2026-09-09T12:00:00.000Z'); // mercoledì, settimana del 07/09
  const sessioni = [
    // settimana del 31/08: due giorni sopra soglia (9h il 02/09, 9h il 04/09)
    { id: 'a', inizio: '2026-09-01T21:00:00.000Z', fine: '2026-09-02T07:00:00.000Z' },
    { id: 'b', inizio: '2026-09-03T21:00:00.000Z', fine: '2026-09-04T07:00:00.000Z' },
    // settimana del 07/09: un giorno sopra soglia
    { id: 'c', inizio: '2026-09-07T20:00:00.000Z', fine: '2026-09-08T07:00:00.000Z' },
  ];
  const progressi = buildProgressiSettimanali(sessioni, now, 8);
  assert.equal(progressi.length, 2);
  assert.deepEqual(progressi.map((p) => p.label), ['31/08', '07/09']);
  assert.deepEqual(progressi.map((p) => p.giorniSopraSoglia), [2, 1]);
});

test('buildProgressiSettimanali: tiene solo le ultime N settimane', () => {
  const now = new Date('2026-09-09T12:00:00.000Z');
  const sessioni = [
    { id: 'vecchia', inizio: '2026-05-04T22:00:00.000Z', fine: '2026-05-05T06:00:00.000Z' },
    { id: 'recente', inizio: '2026-09-07T22:00:00.000Z', fine: '2026-09-08T06:00:00.000Z' },
  ];
  const tutte = buildProgressiSettimanali(sessioni, now, 8, 100);
  assert.ok(tutte.length > 3);
  const ultime = buildProgressiSettimanali(sessioni, now, 8, 3);
  assert.equal(ultime.length, 3);
  assert.equal(ultime.at(-1).label, '07/09'); // l'ultima è sempre la settimana corrente
  assert.deepEqual(ultime.map((p) => p.label), tutte.slice(-3).map((p) => p.label));
});

test('buildProgressiSettimanali: default a 10 settimane', () => {
  const now = new Date('2026-09-09T12:00:00.000Z');
  const sessioni = [{ id: 'vecchia', inizio: '2026-01-05T22:00:00.000Z', fine: '2026-01-06T06:00:00.000Z' }];
  assert.equal(buildProgressiSettimanali(sessioni, now, 8).length, 10);
});

test('buildProgressiSettimanali: nessuna sessione -> nessuna barra', () => {
  assert.deepEqual(buildProgressiSettimanali([], new Date('2026-09-09T12:00:00.000Z'), 8), []);
});
