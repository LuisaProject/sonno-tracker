import { SUPABASE_URL, SUPABASE_ANON_KEY } from './src/config.js';
import { startSession, endSession, getActiveSession, removeSession } from './src/queue.js';
import { syncQueue } from './src/sync.js';
import { loadQueue } from './src/queue.js';
import { getSogliaMassimaOre, calcolaStatoAnello, formattaOreMinuti } from './src/soglia.js';
import {
  buildDayView,
  buildWeekView,
  buildMonthView,
  buildYearView,
  sommaOreInRange,
  contaGiorniSenzaRientri,
  raggruppaPerSettimanaCalendario,
  raggruppaPerMeseCalendario,
  trovaRecord,
  formattaIntervalloDate,
  calcolaRangeFetch,
  sessioneSovrapposta,
  formattaPerInputLocale,
} from './src/history.js';
import { formattaRigaSessione } from './src/sessioni-recenti.js';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentProfile = null;

const el = {
  loginScreen: document.getElementById('login-screen'),
  profiloScreen: document.getElementById('profilo-screen'),
  trackingScreen: document.getElementById('tracking-screen'),
  loginForm: document.getElementById('login-form'),
  loginError: document.getElementById('login-error'),
  profiloForm: document.getElementById('profilo-form'),
  btnToggle: document.getElementById('btn-toggle-sessione'),
  timerLive: document.getElementById('timer-live'),
  syncIndicator: document.getElementById('sync-indicator'),
  anelloSoglia: document.getElementById('anello-soglia'),
  anelloProgresso: document.getElementById('anello-progresso'),
  anelloNumero: document.getElementById('anello-numero'),
  anelloSottotitolo: document.getElementById('anello-sottotitolo'),
  periodoSelector: document.getElementById('periodo-selector'),
  graficoCanvas: document.getElementById('grafico-storico'),
  listaSessioniRecenti: document.getElementById('lista-sessioni-recenti'),
  streakRientri: document.getElementById('streak-rientri'),
  recordSettimana: document.getElementById('record-settimana'),
  recordSettimanaMedia: document.getElementById('record-settimana-media'),
  recordMese: document.getElementById('record-mese'),
  recordMeseMedia: document.getElementById('record-mese-media'),
  formSessioneManuale: document.getElementById('form-sessione-manuale'),
  manualeInizio: document.getElementById('manuale-inizio'),
  manualeFine: document.getElementById('manuale-fine'),
  btnSubmitManuale: document.getElementById('btn-submit-manuale'),
  btnAnnullaModifica: document.getElementById('btn-annulla-modifica'),
};

function mostraSchermata(nome) {
  el.loginScreen.hidden = nome !== 'login';
  el.profiloScreen.hidden = nome !== 'profilo';
  el.trackingScreen.hidden = nome !== 'tracking';
}

async function init() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    mostraSchermata('login');
    return;
  }
  currentUser = session.user;
  await dopoLogin();
}

async function dopoLogin() {
  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .maybeSingle();

  if (!profile) {
    mostraSchermata('profilo');
    return;
  }
  currentProfile = profile;
  mostraSchermata('tracking');
  aggiornaBottoneStato();
  await sincronizza();
}

el.loginForm.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    el.loginError.textContent = error.message;
    el.loginError.hidden = false;
    return;
  }
  currentUser = data.user;
  await dopoLogin();
});

el.profiloForm.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const nome = document.getElementById('profilo-nome').value;
  const eta = parseInt(document.getElementById('profilo-eta').value, 10);
  const { data, error } = await supabaseClient
    .from('profiles')
    .insert({ id: currentUser.id, nome, eta })
    .select()
    .single();
  if (error) {
    alert(error.message);
    return;
  }
  currentProfile = data;
  mostraSchermata('tracking');
  aggiornaBottoneStato();
  await sincronizza();
});

const storage = window.localStorage;
let timerInterval = null;

function aggiornaBottoneStato() {
  const attiva = getActiveSession(storage);
  if (attiva) {
    el.btnToggle.textContent = 'Mi sono alzato';
    el.timerLive.hidden = false;
    avviaTimer(attiva.inizio);
  } else {
    el.btnToggle.textContent = 'Vado a letto';
    el.timerLive.hidden = true;
    fermaTimer();
  }
}

function avviaTimer(inizioISO) {
  fermaTimer();
  const aggiorna = () => {
    const ms = Date.now() - new Date(inizioISO).getTime();
    const ore = Math.floor(ms / 3_600_000);
    const minuti = Math.floor((ms % 3_600_000) / 60_000);
    el.timerLive.textContent = `${ore}h ${minuti}m e in corso`;
  };
  aggiorna();
  timerInterval = setInterval(aggiorna, 30_000);
}

function fermaTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
}

function onToggleSessione() {
  const attiva = getActiveSession(storage);
  if (!attiva) {
    const id = crypto.randomUUID();
    startSession(storage, id, new Date().toISOString());
  } else {
    endSession(storage, attiva.id, new Date().toISOString());
  }
  aggiornaBottoneStato();
  sincronizza();
}

el.btnToggle.addEventListener('click', onToggleSessione);

// Storico completo, non filtrato: serve ai record settimana/mese, che devono
// guardare tutta la cronologia. Si ricarica solo quando i dati cambiano
// davvero (accesso alla schermata, sync, chiusura o eliminazione di una
// sessione), non a ogni cambio di scheda Giorno/Settimana/Mese/Anno.
let sessioniComplete = [];

async function caricaStoricoCompleto() {
  if (!currentProfile) return;
  const { data, error } = await supabaseClient
    .from('sessioni_sonno')
    .select('*')
    .order('inizio', { ascending: true });
  if (error) {
    console.error(error);
    return;
  }
  sessioniComplete = data ?? [];
  renderRecord();
  // Lo streak guarda indietro fino a un anno: va calcolato sullo storico
  // completo, non sulla finestra ridotta che scarica renderStorico.
  aggiornaStreakRientri(sessioniComplete, new Date());
}

function mostraRecord(periodo, elValore, elMedia, testoVuoto) {
  if (!periodo) {
    elValore.textContent = testoVuoto;
    elMedia.textContent = '';
    return;
  }
  const [inizio, fine] = periodo.inizioSettimana
    ? [periodo.inizioSettimana, periodo.fineSettimana]
    : [periodo.inizioMese, periodo.fineMese];
  elValore.textContent = formattaIntervalloDate(inizio, fine);
  elMedia.textContent = `media ${formattaOreMinuti(periodo.media)} al giorno`;
}

function renderRecord() {
  if (!currentProfile) return;
  const soglia = currentProfile.soglia_manuale_ore ?? getSogliaMassimaOre(currentProfile.eta);
  const now = new Date();
  mostraRecord(
    trovaRecord(raggruppaPerSettimanaCalendario(sessioniComplete, now), soglia),
    el.recordSettimana,
    el.recordSettimanaMedia,
    'Ancora nessuna settimana completa registrata'
  );
  mostraRecord(
    trovaRecord(raggruppaPerMeseCalendario(sessioniComplete, now), soglia),
    el.recordMese,
    el.recordMeseMedia,
    'Ancora nessun mese completo registrato'
  );
}

async function sincronizza() {
  if (loadQueue(storage).length > 0) {
    el.syncIndicator.hidden = false;
  }
  await syncQueue(storage, currentUser.id, async (row) => {
    const { error } = await supabaseClient.from('sessioni_sonno').upsert(row);
    if (error) throw error;
  });
  el.syncIndicator.hidden = loadQueue(storage).length === 0;
  await caricaStoricoCompleto();
  await renderStorico();
  await renderSessioniRecenti();
}

window.addEventListener('online', sincronizza);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
}

let chart = null;
let periodoAttivo = 'giorno';

el.periodoSelector.addEventListener('click', (ev) => {
  const periodo = ev.target.dataset.periodo;
  if (!periodo) return;
  periodoAttivo = periodo;
  document.querySelectorAll('#periodo-selector button').forEach((b) => b.classList.remove('periodo-attivo'));
  ev.target.classList.add('periodo-attivo');
  renderStorico();
});

async function renderStorico() {
  if (!currentProfile) return;
  const now = new Date();
  const { inizio } = calcolaRangeFetch(periodoAttivo, now);
  // Solo le sessioni che toccano l'intervallo della scheda attiva: quelle
  // ancora aperte (fine null) servono sempre, perché arrivano fino ad adesso.
  const { data: sessioni } = await supabaseClient
    .from('sessioni_sonno')
    .select('*')
    .or(`fine.is.null,fine.gte.${inizio.toISOString()}`)
    .order('inizio', { ascending: true });

  const soglia = currentProfile.soglia_manuale_ore ?? getSogliaMassimaOre(currentProfile.eta);
  const costruisciPunti = { giorno: buildDayView, settimana: buildWeekView, mese: buildMonthView, anno: buildYearView }[periodoAttivo];
  const punti = costruisciPunti(sessioni ?? [], now);

  disegnaGrafico(punti, soglia);
  aggiornaRiquadroSoglia(sessioni ?? [], soglia, now);
}

function aggiornaStreakRientri(sessioni, now) {
  const giorni = contaGiorniSenzaRientri(sessioni, now);
  el.streakRientri.hidden = false;
  el.streakRientri.textContent = `🔥 ${giorni} giorni senza rientri diurni`;
}

function disegnaGrafico(punti, soglia) {
  const colori = punti.map((p) => (p.ore > soglia ? '#e53935' : '#546e7a'));
  const dati = {
    labels: punti.map((p) => p.label),
    datasets: [
      {
        label: 'Ore a letto',
        data: punti.map((p) => p.ore),
        borderColor: '#546e7a',
        pointBackgroundColor: colori,
        pointBorderColor: colori,
        segment: { borderColor: (ctx) => (ctx.p1.parsed.y > soglia ? '#e53935' : '#546e7a') },
        fill: {
          target: 1,
          above: 'rgba(229, 57, 53, 0.15)',
          below: 'transparent',
        },
        order: 1,
      },
      {
        label: 'Soglia',
        data: punti.map(() => soglia),
        borderColor: '#b0bec5',
        borderDash: [6, 6],
        pointRadius: 0,
        fill: false,
        order: 2,
      },
    ],
  };
  if (chart) {
    chart.data = dati;
    chart.update();
  } else {
    chart = new Chart(el.graficoCanvas, { type: 'line', data: dati, options: { responsive: true } });
  }
}

const RAGGIO_ANELLO = 108;
const CIRCONFERENZA_ANELLO = 2 * Math.PI * RAGGIO_ANELLO;

function aggiornaRiquadroSoglia(sessioni, soglia, now) {
  if (periodoAttivo !== 'giorno') {
    el.anelloSoglia.hidden = true;
    return;
  }
  const rangeStart = new Date(now.getTime() - 24 * 3_600_000);
  const oreALetto = sommaOreInRange(sessioni, rangeStart, now);
  const stato = calcolaStatoAnello(oreALetto, soglia);

  el.anelloSoglia.hidden = false;
  const lunghezzaProgresso = CIRCONFERENZA_ANELLO * stato.percentuale;
  el.anelloProgresso.setAttribute('stroke-dasharray', `${lunghezzaProgresso} ${CIRCONFERENZA_ANELLO}`);
  el.anelloProgresso.setAttribute('stroke', stato.colore);
  el.anelloNumero.textContent = stato.testo;
  el.anelloSottotitolo.textContent = stato.sottotitolo;
}

async function renderSessioniRecenti() {
  const { data: sessioni, error } = await supabaseClient
    .from('sessioni_sonno')
    .select('*')
    .order('inizio', { ascending: false })
    .limit(10);
  if (error) {
    console.error(error);
    return;
  }

  el.listaSessioniRecenti.innerHTML = '';
  for (const sessione of sessioni ?? []) {
    const riga = formattaRigaSessione(sessione);
    const li = document.createElement('li');
    li.className = 'sessione-recente';

    const testo = document.createElement('span');
    testo.textContent = `${riga.inizioLabel} → ${riga.fineLabel}`;
    li.appendChild(testo);

    if (riga.inCorso) {
      const btnChiudi = document.createElement('button');
      btnChiudi.textContent = 'Chiudi ora';
      btnChiudi.addEventListener('click', () => chiudiSessioneOra(sessione.id));
      li.appendChild(btnChiudi);
    }

    const btnModifica = document.createElement('button');
    btnModifica.textContent = 'Modifica';
    btnModifica.addEventListener('click', () => avviaModificaSessione(sessione));
    li.appendChild(btnModifica);

    const btnElimina = document.createElement('button');
    btnElimina.textContent = 'Elimina';
    btnElimina.addEventListener('click', () => eliminaSessione(sessione.id));
    li.appendChild(btnElimina);

    el.listaSessioniRecenti.appendChild(li);
  }
}

function sincronizzaCodaLocale(id, fineISO) {
  const attiva = getActiveSession(storage);
  if (!attiva || attiva.id !== id) return;
  if (fineISO) endSession(storage, id, fineISO);
  removeSession(storage, id);
  aggiornaBottoneStato();
}

async function chiudiSessioneOra(id) {
  const fineISO = new Date().toISOString();
  const { error } = await supabaseClient.from('sessioni_sonno').update({ fine: fineISO }).eq('id', id);
  if (error) {
    alert(error.message);
    return;
  }
  sincronizzaCodaLocale(id, fineISO);
  await caricaStoricoCompleto();
  await renderSessioniRecenti();
  await renderStorico();
}

async function eliminaSessione(id) {
  if (!confirm('Eliminare definitivamente questa sessione? Non è possibile annullare.')) return;
  const { error } = await supabaseClient.from('sessioni_sonno').delete().eq('id', id);
  if (error) {
    alert(error.message);
    return;
  }
  sincronizzaCodaLocale(id, null);
  await caricaStoricoCompleto();
  await renderSessioniRecenti();
  await renderStorico();
}

// id della sessione che il form sta modificando, null quando il form è in
// modalità "aggiungi". Decide se il submit fa un UPDATE o un INSERT.
let sessioneInModifica = null;

function avviaModificaSessione(sessione) {
  sessioneInModifica = sessione.id;
  el.manualeInizio.value = formattaPerInputLocale(sessione.inizio);
  // Sessione ancora aperta: il campo resta vuoto, l'orario di fine reale lo
  // conosce solo l'utente ed è obbligatorio inserirlo.
  el.manualeFine.value = formattaPerInputLocale(sessione.fine);
  el.btnSubmitManuale.textContent = 'Salva modifica';
  el.btnAnnullaModifica.hidden = false;
  el.formSessioneManuale.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function annullaModifica() {
  sessioneInModifica = null;
  el.formSessioneManuale.reset();
  el.btnSubmitManuale.textContent = 'Aggiungi';
  el.btnAnnullaModifica.hidden = true;
}

el.btnAnnullaModifica.addEventListener('click', annullaModifica);
el.formSessioneManuale.addEventListener('submit', onAggiungiSessioneManuale);

async function onAggiungiSessioneManuale(ev) {
  ev.preventDefault();
  try {
    const inizioValore = el.manualeInizio.value;
    const fineValore = el.manualeFine.value;
    if (!inizioValore || !fineValore) {
      alert('Inserisci sia l\'inizio che la fine della sessione.');
      return;
    }

    // new Date(stringaNonValida) non lancia: produce un Invalid Date silenzioso.
    // È .toISOString() a lanciare RangeError su un Invalid Date: può succedere
    // se <input type="datetime-local"> non è supportato (es. Safari/iOS datati)
    // e il campo diventa un testo libero che l'utente può scrivere in un
    // formato che il browser non riconosce.
    const inizioISO = new Date(inizioValore).toISOString();
    const fineISO = new Date(fineValore).toISOString();
    if (new Date(fineISO) <= new Date(inizioISO)) {
      alert('La fine deve essere dopo l\'inizio.');
      return;
    }

    // La sessione in modifica va esclusa dal confronto: altrimenti risulterebbe
    // sempre sovrapposta a sé stessa e il salvataggio sarebbe sempre bloccato.
    const altreSessioni = sessioniComplete.filter((s) => s.id !== sessioneInModifica);
    const conflitto = sessioneSovrapposta({ inizio: inizioISO, fine: fineISO }, altreSessioni);
    if (conflitto) {
      const inizioConflitto = new Date(conflitto.inizio).toLocaleString('it-IT');
      const fineConflitto = conflitto.fine ? new Date(conflitto.fine).toLocaleString('it-IT') : 'in corso';
      alert(`Questo intervallo si sovrappone a una sessione già registrata (${inizioConflitto} → ${fineConflitto}).`);
      return;
    }

    if (sessioneInModifica) {
      const { error } = await supabaseClient
        .from('sessioni_sonno')
        .update({ inizio: inizioISO, fine: fineISO })
        .eq('id', sessioneInModifica);
      if (error) {
        alert(error.message);
        return;
      }
      // Se la sessione modificata era ancora aperta nella coda locale va chiusa
      // anche lì, come fa "Chiudi ora": altrimenti il pulsante resterebbe su
      // "Mi sono alzato" e un successivo stop la riscriverebbe.
      sincronizzaCodaLocale(sessioneInModifica, fineISO);
    } else {
      const { error } = await supabaseClient.from('sessioni_sonno').insert({
        id: crypto.randomUUID(),
        user_id: currentUser.id,
        inizio: inizioISO,
        fine: fineISO,
      });
      if (error) {
        alert(error.message);
        return;
      }
    }

    annullaModifica();
    await caricaStoricoCompleto();
    await renderSessioniRecenti();
    await renderStorico();
  } catch (error) {
    console.error(error);
    alert('Errore nell\'inserimento: ' + error.message + ' — controlla il formato di data/ora inserito.');
  }
}

init();
