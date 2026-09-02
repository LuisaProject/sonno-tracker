export function getSogliaMassimaOre(etaAnni) {
  if (etaAnni < 1) return 16;
  if (etaAnni <= 2) return 14;
  if (etaAnni <= 5) return 13;
  if (etaAnni <= 12) return 12;
  if (etaAnni <= 17) return 10;
  if (etaAnni <= 64) return 9;
  return 8;
}

export function calcolaSforamentoOre(oreALetto, sogliaOre) {
  const diff = oreALetto - sogliaOre;
  return diff > 0 ? diff : 0;
}

export function formattaOreMinuti(oreDecimali) {
  const totaleMinuti = Math.round(oreDecimali * 60);
  const ore = Math.floor(totaleMinuti / 60);
  const minuti = totaleMinuti % 60;
  return `${ore}h ${minuti}m`;
}
