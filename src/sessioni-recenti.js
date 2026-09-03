function pad(n) {
  return String(n).padStart(2, '0');
}

export function formattaDataOra(iso) {
  const d = new Date(iso);
  const giorno = pad(d.getDate());
  const mese = pad(d.getMonth() + 1);
  const anno = d.getFullYear();
  const ore = pad(d.getHours());
  const minuti = pad(d.getMinutes());
  return `${giorno}/${mese}/${anno} ${ore}:${minuti}`;
}

export function formattaRigaSessione(sessione) {
  return {
    id: sessione.id,
    inizioLabel: formattaDataOra(sessione.inizio),
    fineLabel: sessione.fine ? formattaDataOra(sessione.fine) : 'in corso',
    inCorso: sessione.fine === null,
  };
}
