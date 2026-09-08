import { createClient } from '@supabase/supabase-js';
import { getSogliaMassimaOre, calcolaSforamentoOre, formattaOreMinuti } from '../src/soglia.js';
import {
  sommaOreInRange,
  isRientroDiurno,
  dataLocale,
  raggruppaPerSettimanaCalendario,
  calcolaRiepilogoSettimanale,
  trovaRecord,
  battePeriodo,
} from '../src/history.js';

// Finestra di 15 minuti a partire da oraTarget:minutoInizio, per tollerare il
// ritardo con cui GitHub Actions fa partire il cron ogni quarto d'ora.
function isOrario(now, oraTarget, timeZone, minutoInizio = 0) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const ora = parts.find((p) => p.type === 'hour').value;
  const minuti = Number(parts.find((p) => p.type === 'minute').value);
  return Number(ora) === oraTarget && minuti >= minutoInizio && minuti < minutoInizio + 15;
}

function giornoDellaSettimana(now, timeZone) {
  return new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short' }).format(now);
}

export function isOrarioInvio(now, timeZone = 'Europe/Rome') {
  return isOrario(now, 18, timeZone);
}

export function isOrarioPromemoria(now, timeZone = 'Europe/Rome') {
  return isOrario(now, 21, timeZone);
}

export function isOrarioRiepilogoSettimanale(now, timeZone = 'Europe/Rome') {
  return giornoDellaSettimana(now, timeZone) === 'Sun' && isOrario(now, 20, timeZone);
}

const FRASI_MOTIVAZIONALI = [
  '{nome}, dai, impegnati un po\' di più: ce la puoi fare! 💪',
  '{nome}, un piccolo sforzo in più stasera e domani ti senti meglio. Forza!',
  'Coraggio {nome}, un passo alla volta si migliora. Puoi farcela!',
  '{nome}, oggi è andata così, ma domani puoi fare meglio. Non mollare!',
  'Piccoli aggiustamenti, grandi risultati: {nome}, sei sulla buona strada. Spingi un po\' di più!',
];

export function sceglifraseMotivazionale(nome, randomFn = Math.random) {
  const indice = Math.floor(randomFn() * FRASI_MOTIVAZIONALI.length);
  return FRASI_MOTIVAZIONALI[indice].replaceAll('{nome}', nome);
}

export async function inviaMessaggioTelegram(testo) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: testo }),
  });
  if (!res.ok) {
    throw new Error(`Telegram API error: ${res.status} ${await res.text()}`);
  }
}

export async function controllaRientriDiurni(supabaseClient, profile, now) {
  const rangeStart20 = new Date(now.getTime() - 20 * 60_000);
  const { data: sessioniRecenti, error } = await supabaseClient
    .from('sessioni_sonno')
    .select('*')
    .gte('inizio', rangeStart20.toISOString());
  if (error) throw error;

  for (const sessione of sessioniRecenti ?? []) {
    if (sessione.rientro_diurno_notificato) continue;
    if (isRientroDiurno(sessione, now)) {
      const messaggio = `${profile.nome}, sei tornato a letto di giorno 🌤️\n${sceglifraseMotivazionale(profile.nome)}`;
      await inviaMessaggioTelegram(messaggio);
      await supabaseClient.from('sessioni_sonno').update({ rientro_diurno_notificato: true }).eq('id', sessione.id);
      console.log('Messaggio rientro diurno inviato.');
    }
  }
}

export function deveInviareAvvisoSoglia(profile, dataOggi) {
  return profile.ultimo_avviso_soglia_data !== dataOggi;
}

export async function controllaSogliaSerale(supabaseClient, profile, now) {
  if (!isOrarioInvio(now)) {
    console.log("Non è l'orario di invio, esco.");
    return;
  }

  const dataOggi = dataLocale(now.toISOString(), 'Europe/Rome');
  if (!deveInviareAvvisoSoglia(profile, dataOggi)) {
    console.log('Avviso soglia già inviato oggi, salto.');
    return;
  }

  const rangeStart = new Date(now.getTime() - 24 * 3_600_000);
  const { data: sessioni, error: sessioniError } = await supabaseClient
    .from('sessioni_sonno')
    .select('*')
    .or(`fine.is.null,fine.gte.${rangeStart.toISOString()}`);
  if (sessioniError) throw sessioniError;

  const soglia = profile.soglia_manuale_ore ?? getSogliaMassimaOre(profile.eta);
  const oreALetto = sommaOreInRange(sessioni ?? [], rangeStart, now);
  const sforamento = calcolaSforamentoOre(oreALetto, soglia);

  if (sforamento <= 0) {
    console.log('Sotto soglia, nessun messaggio inviato.');
    return;
  }

  const messaggio = `Hai superato di ${formattaOreMinuti(sforamento)} il limite consigliato per la tua età (${soglia}h).\n${sceglifraseMotivazionale(profile.nome)}`;
  await inviaMessaggioTelegram(messaggio);
  await supabaseClient.from('profiles').update({ ultimo_avviso_soglia_data: dataOggi }).eq('id', profile.id);
  console.log('Messaggio Telegram inviato.');
}

export function devePromemoria21(profile, haSessioneAperta, dataOggi) {
  if (haSessioneAperta) return false;
  return profile.ultimo_promemoria_data !== dataOggi;
}

export async function controllaPromemoria21(supabaseClient, profile, now) {
  if (!isOrarioPromemoria(now)) {
    return;
  }

  const { data: sessioniAperte, error } = await supabaseClient
    .from('sessioni_sonno')
    .select('*')
    .is('fine', null);
  if (error) throw error;

  const dataOggi = dataLocale(now.toISOString(), 'Europe/Rome');
  const haSessioneAperta = (sessioniAperte ?? []).length > 0;
  if (!devePromemoria21(profile, haSessioneAperta, dataOggi)) {
    return;
  }

  const messaggio = 'Sei già a letto? 🌙 Se non l\'hai ancora fatto, apri l\'app e premi "Vado a letto".';
  await inviaMessaggioTelegram(messaggio);
  await supabaseClient.from('profiles').update({ ultimo_promemoria_data: dataOggi }).eq('id', profile.id);
  console.log('Promemoria 21:00 inviato.');
}

export function deveInviareRiepilogoSettimanale(profile, dataOggi) {
  return profile.ultimo_riepilogo_data !== dataOggi;
}

// "45 minuti" sotto l'ora, "1h 20m" sopra: nel messaggio la differenza si legge
// meglio in minuti finché resta piccola.
export function formattaDurataBreve(oreDecimali) {
  const minuti = Math.round(Math.abs(oreDecimali) * 60);
  if (minuti < 60) return minuti === 1 ? '1 minuto' : `${minuti} minuti`;
  return formattaOreMinuti(minuti / 60);
}

export function costruisciFraseConfronto(mediaCorrente, mediaPrecedente) {
  const differenza = mediaCorrente - mediaPrecedente;
  const minuti = Math.round(Math.abs(differenza) * 60);
  const quantita = formattaDurataBreve(differenza);

  if (minuti < 15) {
    return `Rispetto alla settimana scorsa sei stabile: solo ${quantita} di differenza al giorno.`;
  }
  const meglio = differenza < 0;
  const verso = meglio ? 'in meno' : 'in più';
  if (minuti <= 60) {
    const direzione = meglio ? 'leggermente meglio' : 'leggermente peggio';
    return `Rispetto alla settimana scorsa vai ${direzione}: ${quantita} ${verso} a letto al giorno.`;
  }
  return meglio
    ? `Rispetto alla settimana scorsa vai molto meglio: ${quantita} ${verso} a letto al giorno! 🎉`
    : `Rispetto alla settimana scorsa vai molto peggio: ${quantita} ${verso} a letto al giorno.`;
}

// '2026-09-07' -> '07/09'
function giornoMese(dataISO) {
  const [, mese, giorno] = dataISO.split('-');
  return `${giorno}/${mese}`;
}

export function costruisciMessaggioRiepilogoSettimanale({ settimana, riepilogo, soglia, fraseConfronto, nuovoRecord }) {
  const righe = [
    `📊 Riepilogo della settimana ${giornoMese(settimana.inizioSettimana)} → ${giornoMese(settimana.fineSettimana)}`,
    '',
    `Media giornaliera: ${formattaOreMinuti(riepilogo.media)} (soglia ${soglia}h)`,
    `Giorno migliore: ${giornoMese(riepilogo.giornoMigliore.label)} — ${formattaOreMinuti(riepilogo.giornoMigliore.ore)}`,
    `Giorno peggiore: ${giornoMese(riepilogo.giornoPeggiore.label)} — ${formattaOreMinuti(riepilogo.giornoPeggiore.ore)}`,
    `Giorni sopra soglia: ${riepilogo.giorniSopraSoglia} su ${settimana.giorni.length}`,
  ];
  if (fraseConfronto) righe.push('', fraseConfronto);
  if (nuovoRecord) righe.push('', '🏆 Nuovo record personale!');
  return righe.join('\n');
}

export async function controllaRiepilogoSettimanale(supabaseClient, profile, now) {
  if (!isOrarioRiepilogoSettimanale(now)) {
    return;
  }

  const dataOggi = dataLocale(now.toISOString(), 'Europe/Rome');
  if (!deveInviareRiepilogoSettimanale(profile, dataOggi)) {
    console.log('Riepilogo settimanale già inviato oggi, salto.');
    return;
  }

  // Nessun filtro temporale: lo storico di un singolo utente è piccolo e serve
  // tutto per capire se la settimana appena chiusa è un record personale.
  const { data: sessioni, error } = await supabaseClient.from('sessioni_sonno').select('*');
  if (error) throw error;

  const settimane = raggruppaPerSettimanaCalendario(sessioni ?? [], now);
  if (settimane.length === 0) {
    console.log('Nessuno storico, riepilogo settimanale non inviato.');
    return;
  }

  const soglia = profile.soglia_manuale_ore ?? getSogliaMassimaOre(profile.eta);
  const settimanaCorrente = settimane[settimane.length - 1];
  const settimanaPrecedente = settimane[settimane.length - 2] ?? null;
  const recordPrecedente = trovaRecord(settimane, soglia);

  const messaggio = costruisciMessaggioRiepilogoSettimanale({
    settimana: settimanaCorrente,
    riepilogo: calcolaRiepilogoSettimanale(settimanaCorrente.giorni, soglia),
    soglia,
    fraseConfronto: settimanaPrecedente
      ? costruisciFraseConfronto(settimanaCorrente.media, settimanaPrecedente.media)
      : null,
    nuovoRecord: recordPrecedente !== null && battePeriodo(settimanaCorrente, recordPrecedente, soglia),
  });

  await inviaMessaggioTelegram(messaggio);
  await supabaseClient.from('profiles').update({ ultimo_riepilogo_data: dataOggi }).eq('id', profile.id);
  console.log('Riepilogo settimanale inviato.');
}

async function main() {
  const now = new Date();
  const supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: profile, error: profileError } = await supabaseClient.from('profiles').select('*').single();
  if (profileError) throw profileError;

  await controllaRientriDiurni(supabaseClient, profile, now);
  await controllaSogliaSerale(supabaseClient, profile, now);
  await controllaPromemoria21(supabaseClient, profile, now);
  await controllaRiepilogoSettimanale(supabaseClient, profile, now);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
