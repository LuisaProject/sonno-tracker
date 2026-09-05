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

function dataLocale(iso, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

export function contaGiorniSenzaRientri(sessioni, oggi, timeZone = 'Europe/Rome', limite = 365) {
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
