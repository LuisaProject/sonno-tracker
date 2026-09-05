import { SUPABASE_URL, SUPABASE_ANON_KEY } from './src/config.js';
import { startSession, endSession, getActiveSession, removeSession } from './src/queue.js';
import { syncQueue } from './src/sync.js';
import { loadQueue } from './src/queue.js';
import { getSogliaMassimaOre, calcolaStatoAnello } from './src/soglia.js';
import { buildDayView, buildWeekView, buildMonthView, buildYearView, sommaOreInRange, contaGiorniSenzaRientri } from './src/history.js';
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

async function sincronizza() {
  if (loadQueue(storage).length > 0) {
    el.syncIndicator.hidden = false;
  }
  await syncQueue(storage, currentUser.id, async (row) => {
    const { error } = await supabaseClient.from('sessioni_sonno').upsert(row);
    if (error) throw error;
  });
  el.syncIndicator.hidden = loadQueue(storage).length === 0;
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
  const { data: sessioni } = await supabaseClient
    .from('sessioni_sonno')
    .select('*')
    .order('inizio', { ascending: true });

  const soglia = currentProfile.soglia_manuale_ore ?? getSogliaMassimaOre(currentProfile.eta);
  const now = new Date();
  const costruisciPunti = { giorno: buildDayView, settimana: buildWeekView, mese: buildMonthView, anno: buildYearView }[periodoAttivo];
  const punti = costruisciPunti(sessioni ?? [], now);

  disegnaGrafico(punti, soglia);
  aggiornaRiquadroSoglia(sessioni ?? [], soglia, now);
  aggiornaStreakRientri(sessioni ?? [], now);
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
  await renderSessioniRecenti();
  await renderStorico();
}

init();
