export function millisecondiOverlap(sessione, rangeStart, rangeEnd) {
  const inizio = new Date(sessione.inizio).getTime();
  const fine = sessione.fine ? new Date(sessione.fine).getTime() : Date.now();
  const start = Math.max(inizio, rangeStart.getTime());
  const end = Math.min(fine, rangeEnd.getTime());
  return Math.max(0, end - start);
}

export function sommaOreInRange(sessions, rangeStart, rangeEnd) {
  const ms = sessions.reduce((tot, s) => tot + millisecondiOverlap(s, rangeStart, rangeEnd), 0);
  return ms / 3_600_000;
}

export function buildDayView(sessions, now = new Date()) {
  const punti = [];
  for (let i = 23; i >= 0; i--) {
    const fineOra = new Date(now.getTime() - i * 3_600_000);
    const inizioOra = new Date(fineOra.getTime() - 3_600_000);
    punti.push({
      label: `${fineOra.getHours()}:00`,
      ore: sommaOreInRange(sessions, inizioOra, fineOra),
    });
  }
  return punti;
}

function inizioGiorno(data) {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildTotaliGiornalieri(sessions, now, giorni) {
  const punti = [];
  for (let i = giorni - 1; i >= 0; i--) {
    const giornoInizio = inizioGiorno(new Date(now.getTime() - i * 86_400_000));
    const giornoFine = new Date(giornoInizio.getTime() + 86_400_000);
    punti.push({
      label: giornoInizio.toISOString().slice(0, 10),
      ore: sommaOreInRange(sessions, giornoInizio, giornoFine),
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
    const totale = sommaOreInRange(sessions, meseInizio, rangeFine);
    punti.push({
      label: `${meseInizio.getFullYear()}-${String(meseInizio.getMonth() + 1).padStart(2, '0')}`,
      ore: totale / giorniTrascorsi,
    });
  }
  return punti;
}
