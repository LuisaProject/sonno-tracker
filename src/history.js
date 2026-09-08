import { calcolaSforamentoOre } from './soglia.js';

export function isOraDiurna(iso, timeZone = 'Europe/Rome') {
  const ora = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hour12: false }).format(new Date(iso))
  );
  return ora >= 8 && ora < 20;
}

export function isRientroDiurno(sessione, now, timeZone = 'Europe/Rome') {
  const inizio = new Date(sessione.inizio);
  const diffMs = now.getTime() - inizio.getTime();
  const entroFinestra = diffMs >= 0 && diffMs <= 20 * 60_000;
  return entroFinestra && isOraDiurna(sessione.inizio, timeZone);
}

export function dataLocale(iso, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

export function contaGiorniSenzaRientri(sessioni, oggi, timeZone = 'Europe/Rome', limite = 365) {
  if (sessioni.length === 0) return 0;

  const giorniConRientro = new Set(
    sessioni.filter((s) => isOraDiurna(s.inizio, timeZone)).map((s) => dataLocale(s.inizio, timeZone))
  );

  let streak = 0;
  for (let i = 1; i <= limite; i++) {
    const giorno = new Date(oggi.getTime() - i * 86_400_000);
    if (giorniConRientro.has(dataLocale(giorno.toISOString(), timeZone))) break;
    streak++;
  }
  return streak;
}

export function millisecondiOverlap(sessione, rangeStart, rangeEnd, now = new Date()) {
  const inizio = new Date(sessione.inizio).getTime();
  const fine = sessione.fine ? new Date(sessione.fine).getTime() : now.getTime();
  const start = Math.max(inizio, rangeStart.getTime());
  const end = Math.min(fine, rangeEnd.getTime());
  return Math.max(0, end - start);
}

export function sommaOreInRange(sessions, rangeStart, rangeEnd, now = new Date()) {
  const ms = sessions.reduce((tot, s) => tot + millisecondiOverlap(s, rangeStart, rangeEnd, now), 0);
  return ms / 3_600_000;
}

export function buildDayView(sessions, now = new Date()) {
  const punti = [];
  for (let i = 23; i >= 0; i--) {
    const fineOra = new Date(now.getTime() - i * 3_600_000);
    const inizioOra = new Date(fineOra.getTime() - 3_600_000);
    punti.push({
      label: `${fineOra.getHours()}:00`,
      ore: sommaOreInRange(sessions, inizioOra, fineOra, now),
    });
  }
  return punti;
}

function inizioGiorno(data) {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formattaDataLocale(data) {
  const anno = data.getFullYear();
  const mese = String(data.getMonth() + 1).padStart(2, '0');
  const giorno = String(data.getDate()).padStart(2, '0');
  return `${anno}-${mese}-${giorno}`;
}

function buildTotaliGiornalieri(sessions, now, giorni) {
  const punti = [];
  for (let i = giorni - 1; i >= 0; i--) {
    const giornoInizio = inizioGiorno(new Date(now.getTime() - i * 86_400_000));
    const giornoFine = new Date(giornoInizio.getTime() + 86_400_000);
    punti.push({
      label: formattaDataLocale(giornoInizio),
      ore: sommaOreInRange(sessions, giornoInizio, giornoFine, now),
    });
  }
  return punti;
}

export function buildWeekView(sessions, now = new Date()) {
  return buildTotaliGiornalieri(sessions, now, 7);
}

export function buildMonthView(sessions, now = new Date()) {
  return buildTotaliGiornalieri(sessions, now, 30);
}

export function buildYearView(sessions, now = new Date()) {
  const punti = [];
  for (let i = 11; i >= 0; i--) {
    const meseData = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const meseInizio = new Date(meseData.getFullYear(), meseData.getMonth(), 1);
    const meseFineCompleto = new Date(meseData.getFullYear(), meseData.getMonth() + 1, 1);
    const rangeFine = meseFineCompleto.getTime() > now.getTime() ? now : meseFineCompleto;
    const giorniTrascorsi = Math.max(1, Math.round((rangeFine.getTime() - meseInizio.getTime()) / 86_400_000));
    const totale = sommaOreInRange(sessions, meseInizio, rangeFine, now);
    punti.push({
      label: `${meseInizio.getFullYear()}-${String(meseInizio.getMonth() + 1).padStart(2, '0')}`,
      ore: totale / giorniTrascorsi,
    });
  }
  return punti;
}

// --- Raggruppamenti a taglio di calendario -----------------------------------
// Le viste del grafico storico (buildDayView/WeekView/MonthView/YearView) usano
// finestre mobili che finiscono "adesso". Le funzioni qui sotto ragionano invece
// per settimane di calendario (lunedì-domenica) e mesi di calendario
// (1° - ultimo giorno), e servono ai riepiloghi Telegram e ai record in app.
//
// Una "data civile" è rappresentata come timestamp UTC a mezzanotte
// (Date.UTC(anno, mese-1, giorno)): è solo un contenitore per anno/mese/giorno,
// non un istante reale, e permette di sommare giorni senza incappare nel DST.

function partiLocali(istante, timeZone) {
  const parti = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(istante);
  const mappa = {};
  for (const p of parti) mappa[p.type] = p.value;
  return mappa;
}

function offsetLocaleMs(istante, timeZone) {
  const p = partiLocali(istante, timeZone);
  const comeUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return comeUtc - istante.getTime();
}

// Istante reale (UTC) della mezzanotte locale di una data civile.
// Doppio passaggio per essere corretti anche a cavallo dei cambi di ora legale.
function istanteMezzanotteLocale(dataCivile, timeZone) {
  const d = new Date(dataCivile);
  const target = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0);
  let ts = target - offsetLocaleMs(new Date(target), timeZone);
  ts = target - offsetLocaleMs(new Date(ts), timeZone);
  return new Date(ts);
}

function dataCivileDaIstante(istante, timeZone) {
  const [anno, mese, giorno] = dataLocale(istante.toISOString(), timeZone).split('-').map(Number);
  return Date.UTC(anno, mese - 1, giorno);
}

function formattaDataCivile(dataCivile) {
  const d = new Date(dataCivile);
  const mese = String(d.getUTCMonth() + 1).padStart(2, '0');
  const giorno = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mese}-${giorno}`;
}

function lunediDellaSettimana(dataCivile) {
  const scarto = (new Date(dataCivile).getUTCDay() + 6) % 7; // 0 = lunedì
  return dataCivile - scarto * 86_400_000;
}

function primoDelMese(dataCivile) {
  const d = new Date(dataCivile);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

function meseSuccessivo(dataCivile) {
  const d = new Date(dataCivile);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

function puntiGiornalieri(sessioni, dataCivileInizio, numeroGiorni, now, timeZone) {
  const punti = [];
  for (let i = 0; i < numeroGiorni; i++) {
    const giornoCivile = dataCivileInizio + i * 86_400_000;
    const inizio = istanteMezzanotteLocale(giornoCivile, timeZone);
    const fine = istanteMezzanotteLocale(giornoCivile + 86_400_000, timeZone);
    punti.push({
      label: formattaDataCivile(giornoCivile),
      ore: sommaOreInRange(sessioni, inizio, fine, now),
    });
  }
  return punti;
}

function mediaGiorni(giorni) {
  if (giorni.length === 0) return 0;
  return giorni.reduce((tot, g) => tot + g.ore, 0) / giorni.length;
}

function dataCivilePiuVecchia(sessioni, timeZone) {
  return sessioni.reduce((minimo, s) => {
    const civile = dataCivileDaIstante(new Date(s.inizio), timeZone);
    return minimo === null || civile < minimo ? civile : minimo;
  }, null);
}

export function raggruppaPerSettimanaCalendario(sessioni, now, timeZone = 'Europe/Rome') {
  const elenco = sessioni ?? [];
  if (elenco.length === 0) return [];

  const primoLunedi = lunediDellaSettimana(dataCivilePiuVecchia(elenco, timeZone));
  const lunediCorrente = lunediDellaSettimana(dataCivileDaIstante(now, timeZone));

  const settimane = [];
  for (let lunedi = primoLunedi; lunedi <= lunediCorrente; lunedi += 7 * 86_400_000) {
    const giorni = puntiGiornalieri(elenco, lunedi, 7, now, timeZone);
    settimane.push({
      inizioSettimana: formattaDataCivile(lunedi),
      fineSettimana: formattaDataCivile(lunedi + 6 * 86_400_000),
      giorni,
      media: mediaGiorni(giorni),
      completa: lunedi < lunediCorrente,
    });
  }
  return settimane;
}

export function raggruppaPerMeseCalendario(sessioni, now, timeZone = 'Europe/Rome') {
  const elenco = sessioni ?? [];
  if (elenco.length === 0) return [];

  const primoMese = primoDelMese(dataCivilePiuVecchia(elenco, timeZone));
  const meseCorrente = primoDelMese(dataCivileDaIstante(now, timeZone));

  const mesi = [];
  for (let mese = primoMese; mese <= meseCorrente; mese = meseSuccessivo(mese)) {
    const inizioProssimo = meseSuccessivo(mese);
    const numeroGiorni = Math.round((inizioProssimo - mese) / 86_400_000);
    const giorni = puntiGiornalieri(elenco, mese, numeroGiorni, now, timeZone);
    mesi.push({
      inizioMese: formattaDataCivile(mese),
      fineMese: formattaDataCivile(inizioProssimo - 86_400_000),
      giorni,
      media: mediaGiorni(giorni),
      completa: mese < meseCorrente,
    });
  }
  return mesi;
}

// Un periodo batte l'altro se sfora meno la soglia. A parità di sforamento
// (tipicamente zero: entrambi sotto soglia) vince la media più bassa, altrimenti
// con tutti i periodi sotto soglia il "record" sarebbe sempre il più vecchio.
export function battePeriodo(candidato, riferimento, soglia) {
  if (!riferimento) return true;
  const sforamentoCandidato = calcolaSforamentoOre(candidato.media, soglia);
  const sforamentoRiferimento = calcolaSforamentoOre(riferimento.media, soglia);
  if (sforamentoCandidato !== sforamentoRiferimento) return sforamentoCandidato < sforamentoRiferimento;
  return candidato.media < riferimento.media;
}

export function trovaRecord(periodi, soglia) {
  const completi = (periodi ?? []).filter((p) => p.completa);
  if (completi.length === 0) return null;
  return completi.reduce((migliore, periodo) => (battePeriodo(periodo, migliore, soglia) ? periodo : migliore), null);
}

export function calcolaRiepilogoSettimanale(giorni, soglia) {
  const elenco = giorni ?? [];
  if (elenco.length === 0) {
    return { media: 0, giornoMigliore: null, giornoPeggiore: null, giorniSopraSoglia: 0 };
  }
  return {
    media: mediaGiorni(elenco),
    giornoMigliore: elenco.reduce((min, g) => (g.ore < min.ore ? g : min)),
    giornoPeggiore: elenco.reduce((max, g) => (g.ore > max.ore ? g : max)),
    giorniSopraSoglia: elenco.filter((g) => g.ore > soglia).length,
  };
}

// '2026-09-07', '2026-09-13' -> '07/09/2026 → 13/09/2026'
export function formattaIntervalloDate(inizioISO, fineISO) {
  const perEsteso = (dataISO) => {
    const [anno, mese, giorno] = dataISO.split('-');
    return `${giorno}/${mese}/${anno}`;
  };
  return `${perEsteso(inizioISO)} → ${perEsteso(fineISO)}`;
}
