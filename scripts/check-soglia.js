import { createClient } from '@supabase/supabase-js';
import { getSogliaMassimaOre, calcolaSforamentoOre, formattaOreMinuti } from '../src/soglia.js';
import { sommaOreInRange } from '../src/history.js';

export function isOrarioInvio(now, timeZone = 'Europe/Rome') {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const ora = parts.find((p) => p.type === 'hour').value;
  const minuti = parts.find((p) => p.type === 'minute').value;
  return ora === '18' && minuti === '00';
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

async function main() {
  const now = new Date();
  if (!isOrarioInvio(now)) {
    console.log("Non è l'orario di invio, esco.");
    return;
  }

  const supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: profile, error: profileError } = await supabaseClient.from('profiles').select('*').single();
  if (profileError) throw profileError;

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

  const messaggio = `Hai superato di ${formattaOreMinuti(sforamento)} il limite consigliato per la tua età (${soglia}h).`;
  await inviaMessaggioTelegram(messaggio);
  console.log('Messaggio Telegram inviato.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
