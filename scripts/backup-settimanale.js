import { createClient } from '@supabase/supabase-js';

function formattaDataLocale(data) {
  const anno = data.getUTCFullYear();
  const mese = String(data.getUTCMonth() + 1).padStart(2, '0');
  const giorno = String(data.getUTCDate()).padStart(2, '0');
  return `${anno}-${mese}-${giorno}`;
}

export function buildBackupPayload(profiles, sessioni, now = new Date()) {
  const dati = {
    generato_il: now.toISOString(),
    profiles: profiles ?? [],
    sessioni_sonno: sessioni ?? [],
  };
  const jsonString = JSON.stringify(dati, null, 2);
  const filename = `backup-sonno-tracker-${formattaDataLocale(now)}.json`;
  return { filename, jsonString };
}

export async function inviaDocumentoTelegram(filename, jsonString) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const url = `https://api.telegram.org/bot${token}/sendDocument`;

  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('caption', 'Backup settimanale sonno-tracker');
  form.append('document', new Blob([jsonString], { type: 'application/json' }), filename);

  const res = await fetch(url, { method: 'POST', body: form });
  if (!res.ok) {
    throw new Error(`Telegram API error: ${res.status} ${await res.text()}`);
  }
}

async function main() {
  const supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: profiles, error: profilesError } = await supabaseClient.from('profiles').select('*');
  if (profilesError) throw profilesError;

  const { data: sessioni, error: sessioniError } = await supabaseClient.from('sessioni_sonno').select('*');
  if (sessioniError) throw sessioniError;

  const { filename, jsonString } = buildBackupPayload(profiles, sessioni);
  await inviaDocumentoTelegram(filename, jsonString);
  console.log(`Backup inviato: ${filename}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
