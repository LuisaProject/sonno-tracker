# Sonno Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire e pubblicare la PWA "Sonno Tracker" descritta in `docs/superpowers/specs/2026-09-02-sonno-tracker-design.md`: tracciamento del tempo a letto con un bottone, storico visivo con Chart.js, avviso Telegram automatico via GitHub Actions quando si supera la soglia raccomandata per età.

**Architecture:** Frontend PWA vanilla HTML/CSS/JS (nessun framework, nessun build step) ospitato su GitHub Pages, con logica pura (soglie, coda offline, aggregazione storico) isolata in moduli ES testabili con `node --test`, e logica DOM in un unico `app.js` di collegamento verificato manualmente in browser. Dati in Supabase (Postgres + Auth + RLS). Un job Node.js schedulato via GitHub Actions legge Supabase con la service role key e invia il messaggio Telegram.

**Tech Stack:** HTML/CSS/JS (ES modules, nessun bundler), Supabase JS SDK (UMD via CDN), Chart.js (UMD via CDN), Node.js 20 + `node --test` per i test, GitHub Actions, Telegram Bot API.

## Global Constraints

- Nessun framework frontend, nessun build step — solo file statici serviti da GitHub Pages (spec §9).
- Repository pubblico GitHub `sonno-tracker`, stesso nome del progetto Supabase già creato (spec §2).
- Login singolo utente via Supabase Auth (email+password); nessuna UI di registrazione o recupero password (spec §4, §12).
- RLS attiva su `profiles` e `sessioni_sonno`, filtrando per `auth.uid()` (spec §4).
- La service role key di Supabase e il token del bot Telegram vivono **solo** come GitHub Actions secrets, mai nel codice o lato client (spec §4, §8).
- Ogni tap su "Vado a letto" / "Mi sono alzato" scrive prima in `localStorage`, poi tenta la sincronizzazione con Supabase (spec §5.1).
- Grafico con Chart.js, vista di default "giorno", colorazione rossa sopra soglia (spec §6).
- Notifica Telegram inviata solo se la soglia è superata, controllo ogni 15 minuti, invio se l'ora locale di Roma è 18:00 (spec §8).
- Soglie per età da tabella CDC (spec §7).

---

## Task 1: Scaffolding del repository

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `README.md`

**Interfaces:**
- Produces: struttura cartelle `src/`, `scripts/`, `tests/`, `supabase/`, `.github/workflows/`, `icons/` pronte per i task successivi.

- [ ] **Step 1: Creare le cartelle e i file base**

```bash
cd /Users/David/Progetti/sonno-tracker
mkdir -p src scripts tests supabase .github/workflows icons
```

- [ ] **Step 2: Creare `package.json`**

```json
{
  "name": "sonno-tracker",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/",
    "dev": "python3 -m http.server 8000"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0"
  }
}
```

- [ ] **Step 3: Creare `.gitignore`**

```
node_modules/
.DS_Store
```

- [ ] **Step 4: Creare `README.md` iniziale**

```markdown
# Sonno Tracker

PWA per tracciare il tempo a letto nelle 24 ore, con avviso Telegram in caso di superamento della soglia raccomandata per età.

## Sviluppo locale

- `npm install` — installa le dipendenze (servono solo per lo script di notifica e i test).
- `npm test` — esegue i test dei moduli di logica pura.
- `npm run dev` — avvia un server statico locale su `http://localhost:8000` per provare la PWA nel browser.

## Configurazione

Vedi `src/config.js` per le chiavi Supabase (pubbliche, safe lato client) e la sezione "Deploy" più sotto per i secret di GitHub Actions.
```

- [ ] **Step 5: Inizializzare il repository git locale**

```bash
git init
git add package.json .gitignore README.md docs
git commit -m "chore: scaffold sonno-tracker project"
```

Nota per chi esegue: se `git commit` chiede nome/email, configurali con `git config user.name` / `git config user.email` prima di procedere (chiedi a David se non sono già impostati globalmente).

---

## Task 2: Modulo soglie (`soglia.js`)

**Files:**
- Create: `src/soglia.js`
- Test: `tests/soglia.test.js`

**Interfaces:**
- Produces: `getSogliaMassimaOre(etaAnni: number): number`, `calcolaSforamentoOre(oreALetto: number, sogliaOre: number): number`, `formattaOreMinuti(oreDecimali: number): string`. Usati da Task 3 (queue no), Task 9/11 (app.js) e Task 13 (script Telegram).

- [ ] **Step 1: Scrivere i test**

```js
// tests/soglia.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSogliaMassimaOre, calcolaSforamentoOre, formattaOreMinuti } from '../src/soglia.js';

test('getSogliaMassimaOre: adulto 30 anni -> 9 ore', () => {
  assert.equal(getSogliaMassimaOre(30), 9);
});

test('getSogliaMassimaOre: bambino 8 anni -> 12 ore', () => {
  assert.equal(getSogliaMassimaOre(8), 12);
});

test('getSogliaMassimaOre: adolescente 15 anni -> 10 ore', () => {
  assert.equal(getSogliaMassimaOre(15), 10);
});

test('getSogliaMassimaOre: anziano 70 anni -> 8 ore', () => {
  assert.equal(getSogliaMassimaOre(70), 8);
});

test('getSogliaMassimaOre: 62 anni -> 9 ore', () => {
  assert.equal(getSogliaMassimaOre(62), 9);
});

test('calcolaSforamentoOre: sotto soglia -> 0', () => {
  assert.equal(calcolaSforamentoOre(8, 9), 0);
});

test('calcolaSforamentoOre: sopra soglia -> differenza', () => {
  assert.equal(calcolaSforamentoOre(10.5, 9), 1.5);
});

test('formattaOreMinuti: converte decimali in "Xh Ym"', () => {
  assert.equal(formattaOreMinuti(1.5), '1h 30m');
  assert.equal(formattaOreMinuti(0.25), '0h 15m');
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `npm test`
Expected: FAIL con errore "Cannot find module '../src/soglia.js'"

- [ ] **Step 3: Implementare `src/soglia.js`**

```js
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
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `npm test`
Expected: PASS su tutti i test di `soglia.test.js`

- [ ] **Step 5: Commit**

```bash
git add src/soglia.js tests/soglia.test.js
git commit -m "feat: add soglia module for age-based sleep thresholds"
```

---

## Task 3: Modulo coda offline (`queue.js`)

**Files:**
- Create: `src/queue.js`
- Test: `tests/queue.test.js`

**Interfaces:**
- Consumes: nessuno.
- Produces: `loadQueue(storage)`, `saveQueue(storage, queue)`, `startSession(storage, id, inizioISO)`, `endSession(storage, id, fineISO)`, `getActiveSession(storage)`, `removeSession(storage, id)`. `storage` è un oggetto con `getItem`/`setItem` (interfaccia `localStorage`). Usati da Task 5 (`sync.js`) e Task 9 (`app.js`).

- [ ] **Step 1: Scrivere i test con uno storage in memoria**

```js
// tests/queue.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadQueue, startSession, endSession, getActiveSession, removeSession } from '../src/queue.js';

function creaStorageFinto() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, v),
  };
}

test('startSession aggiunge una sessione attiva alla coda', () => {
  const storage = creaStorageFinto();
  startSession(storage, 'id-1', '2026-09-02T22:00:00.000Z');
  const attiva = getActiveSession(storage);
  assert.equal(attiva.id, 'id-1');
  assert.equal(attiva.fine, null);
});

test('endSession chiude la sessione attiva', () => {
  const storage = creaStorageFinto();
  startSession(storage, 'id-1', '2026-09-02T22:00:00.000Z');
  endSession(storage, 'id-1', '2026-09-03T06:00:00.000Z');
  assert.equal(getActiveSession(storage), null);
  const queue = loadQueue(storage);
  assert.equal(queue[0].fine, '2026-09-03T06:00:00.000Z');
});

test('removeSession toglie la sessione dalla coda', () => {
  const storage = creaStorageFinto();
  startSession(storage, 'id-1', '2026-09-02T22:00:00.000Z');
  removeSession(storage, 'id-1');
  assert.equal(loadQueue(storage).length, 0);
});

test('getActiveSession restituisce null se non c\'è nessuna sessione aperta', () => {
  const storage = creaStorageFinto();
  assert.equal(getActiveSession(storage), null);
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `npm test`
Expected: FAIL con errore "Cannot find module '../src/queue.js'"

- [ ] **Step 3: Implementare `src/queue.js`**

```js
const STORAGE_KEY = 'sonno_queue';

export function loadQueue(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

export function saveQueue(storage, queue) {
  storage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export function startSession(storage, id, inizioISO) {
  const queue = loadQueue(storage);
  queue.push({ id, inizio: inizioISO, fine: null });
  saveQueue(storage, queue);
  return queue;
}

export function endSession(storage, id, fineISO) {
  const queue = loadQueue(storage);
  const sessione = queue.find((s) => s.id === id);
  if (sessione) sessione.fine = fineISO;
  saveQueue(storage, queue);
  return queue;
}

export function getActiveSession(storage) {
  const queue = loadQueue(storage);
  return queue.find((s) => s.fine === null) || null;
}

export function removeSession(storage, id) {
  const queue = loadQueue(storage).filter((s) => s.id !== id);
  saveQueue(storage, queue);
  return queue;
}
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `npm test`
Expected: PASS su tutti i test di `queue.test.js`

- [ ] **Step 5: Commit**

```bash
git add src/queue.js tests/queue.test.js
git commit -m "feat: add offline queue module for pending sleep sessions"
```

---

## Task 4: Modulo aggregazione storico (`history.js`)

**Files:**
- Create: `src/history.js`
- Test: `tests/history.test.js`

**Interfaces:**
- Consumes: nessuno (riceve array di sessioni `{id, inizio, fine}` da Supabase o dai test).
- Produces: `sommaOreInRange(sessions, rangeStart, rangeEnd): number`, `buildDayView(sessions, now?): {label, ore}[]`, `buildWeekView(sessions, now?): {label, ore}[]`, `buildMonthView(sessions, now?): {label, ore}[]`, `buildYearView(sessions, now?): {label, ore}[]`. Usati da Task 11 (`app.js`, grafico) e Task 13 (script Telegram).

- [ ] **Step 1: Scrivere i test**

```js
// tests/history.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sommaOreInRange, buildDayView, buildWeekView, buildYearView } from '../src/history.js';

const sessioneUnaNotte = [
  { id: '1', inizio: '2026-09-02T22:00:00.000Z', fine: '2026-09-03T06:00:00.000Z' },
];

test('sommaOreInRange calcola la sovrapposizione in ore', () => {
  const start = new Date('2026-09-02T00:00:00.000Z');
  const end = new Date('2026-09-03T23:59:59.000Z');
  assert.equal(sommaOreInRange(sessioneUnaNotte, start, end), 8);
});

test('sommaOreInRange ignora sessioni fuori range', () => {
  const start = new Date('2026-01-01T00:00:00.000Z');
  const end = new Date('2026-01-02T00:00:00.000Z');
  assert.equal(sommaOreInRange(sessioneUnaNotte, start, end), 0);
});

test('buildDayView produce 24 punti orari', () => {
  const now = new Date('2026-09-03T08:00:00.000Z');
  const punti = buildDayView(sessioneUnaNotte, now);
  assert.equal(punti.length, 24);
  const totale = punti.reduce((tot, p) => tot + p.ore, 0);
  assert.equal(totale, 8);
});

test('buildWeekView produce 7 punti giornalieri', () => {
  const now = new Date('2026-09-03T08:00:00.000Z');
  const punti = buildWeekView(sessioneUnaNotte, now);
  assert.equal(punti.length, 7);
});

test('buildYearView produce 12 punti mensili con media giornaliera', () => {
  const now = new Date('2026-09-03T08:00:00.000Z');
  const punti = buildYearView(sessioneUnaNotte, now);
  assert.equal(punti.length, 12);
  const puntoSettembre = punti.find((p) => p.label === '2026-09');
  assert.ok(puntoSettembre.ore > 0);
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `npm test`
Expected: FAIL con errore "Cannot find module '../src/history.js'"

- [ ] **Step 3: Implementare `src/history.js`**

```js
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
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `npm test`
Expected: PASS su tutti i test di `history.test.js`

- [ ] **Step 5: Commit**

```bash
git add src/history.js tests/history.test.js
git commit -m "feat: add history aggregation module for chart views"
```

---

## Task 5: Modulo sincronizzazione (`sync.js`)

**Files:**
- Create: `src/sync.js`
- Test: `tests/sync.test.js`

**Interfaces:**
- Consumes: `loadQueue`, `removeSession` da `src/queue.js` (Task 3).
- Produces: `syncQueue(storage, userId, upsertFn): Promise<queue>`, dove `upsertFn(row)` è una funzione async iniettata (in produzione avvolge la chiamata Supabase, nei test è un mock). Usato da Task 10 (`app.js`).

- [ ] **Step 1: Scrivere i test con un `upsertFn` finto**

```js
// tests/sync.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startSession, endSession, loadQueue } from '../src/queue.js';
import { syncQueue } from '../src/sync.js';

function creaStorageFinto() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, v),
  };
}

test('syncQueue rimuove dalla coda le sessioni chiuse sincronizzate con successo', async () => {
  const storage = creaStorageFinto();
  startSession(storage, 'id-1', '2026-09-02T22:00:00.000Z');
  endSession(storage, 'id-1', '2026-09-03T06:00:00.000Z');

  await syncQueue(storage, 'user-1', async () => {});

  assert.equal(loadQueue(storage).length, 0);
});

test('syncQueue mantiene in coda le sessioni ancora aperte', async () => {
  const storage = creaStorageFinto();
  startSession(storage, 'id-1', '2026-09-02T22:00:00.000Z');

  await syncQueue(storage, 'user-1', async () => {});

  assert.equal(loadQueue(storage).length, 1);
});

test('syncQueue mantiene in coda le sessioni che falliscono la sincronizzazione', async () => {
  const storage = creaStorageFinto();
  startSession(storage, 'id-1', '2026-09-02T22:00:00.000Z');
  endSession(storage, 'id-1', '2026-09-03T06:00:00.000Z');

  await syncQueue(storage, 'user-1', async () => {
    throw new Error('rete assente');
  });

  assert.equal(loadQueue(storage).length, 1);
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `npm test`
Expected: FAIL con errore "Cannot find module '../src/sync.js'"

- [ ] **Step 3: Implementare `src/sync.js`**

```js
import { loadQueue, removeSession } from './queue.js';

export async function syncQueue(storage, userId, upsertFn) {
  const queue = loadQueue(storage);
  for (const sessione of queue) {
    try {
      await upsertFn({ id: sessione.id, user_id: userId, inizio: sessione.inizio, fine: sessione.fine });
      if (sessione.fine !== null) {
        removeSession(storage, sessione.id);
      }
    } catch {
      // Resta in coda: verrà ritentata al prossimo tap, al ritorno online o alla riapertura app.
    }
  }
  return loadQueue(storage);
}
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `npm test`
Expected: PASS su tutti i test di `sync.test.js`

- [ ] **Step 5: Commit**

```bash
git add src/sync.js tests/sync.test.js
git commit -m "feat: add sync module to push queued sessions to Supabase"
```

---

## Task 6: Schema Supabase e utente

**Files:**
- Create: `supabase/schema.sql`
- Create: `src/config.js`

**Interfaces:**
- Produces: tabelle `profiles`, `sessioni_sonno` con RLS attiva su Supabase; costanti `SUPABASE_URL`, `SUPABASE_ANON_KEY` usate da Task 8 (`app.js`).

- [ ] **Step 1: Creare `supabase/schema.sql`**

```sql
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  eta int not null,
  soglia_manuale_ore numeric
);

alter table profiles enable row level security;

create policy "profiles_select_own" on profiles
  for select using (auth.uid() = id);

create policy "profiles_insert_own" on profiles
  for insert with check (auth.uid() = id);

create policy "profiles_update_own" on profiles
  for update using (auth.uid() = id);

create table if not exists sessioni_sonno (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  inizio timestamptz not null,
  fine timestamptz
);

alter table sessioni_sonno enable row level security;

create policy "sessioni_select_own" on sessioni_sonno
  for select using (auth.uid() = user_id);

create policy "sessioni_insert_own" on sessioni_sonno
  for insert with check (auth.uid() = user_id);

create policy "sessioni_update_own" on sessioni_sonno
  for update using (auth.uid() = user_id);

create index if not exists sessioni_sonno_user_inizio_idx on sessioni_sonno (user_id, inizio desc);
```

- [ ] **Step 2 (guidato, manuale): Eseguire lo schema su Supabase**

1. Apri il progetto Supabase "sonno-tracker" su supabase.com.
2. Vai su "SQL Editor" → "New query".
3. Incolla il contenuto di `supabase/schema.sql` ed esegui.
4. Verifica in "Table Editor" che compaiano le tabelle `profiles` e `sessioni_sonno` con l'icona dello scudo (RLS attiva) accanto al nome.

- [ ] **Step 3 (guidato, manuale): Creare l'utente di autenticazione**

1. Vai su "Authentication" → "Users" → "Add user" → "Create new user".
2. Inserisci l'email e una password che David sceglie (non generarla tu, chiedigliela).
3. Conferma l'utente (se richiesto, disabilita la verifica email o marca l'utente come confermato manualmente, essendo l'unico account previsto).

- [ ] **Step 4: Creare `src/config.js` con le chiavi reali**

1. Su Supabase vai su "Project Settings" → "API".
2. Copia "Project URL" e la chiave "anon public" (non la "service_role").

```js
export const SUPABASE_URL = 'INCOLLA_QUI_PROJECT_URL';
export const SUPABASE_ANON_KEY = 'INCOLLA_QUI_ANON_KEY';
```

Nota: questa chiave è pubblica per natura (spec §4) — è corretto che finisca nel repository pubblico.

- [ ] **Step 5: Commit**

```bash
git add supabase/schema.sql src/config.js
git commit -m "feat: add Supabase schema with RLS and client config"
```

---

## Task 7: Struttura HTML e stile

**Files:**
- Create: `index.html`
- Create: `style.css`

**Interfaces:**
- Produces: elementi DOM con gli id usati da `app.js` nei Task 8-11: `login-screen`, `profilo-screen`, `tracking-screen`, `login-form`, `login-email`, `login-password`, `login-error`, `profilo-form`, `profilo-nome`, `profilo-eta`, `btn-toggle-sessione`, `timer-live`, `sync-indicator`, `riquadro-soglia`, `periodo-selector`, `grafico-storico`.

- [ ] **Step 1: Creare `index.html`**

```html
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sonno Tracker</title>
  <link rel="manifest" href="manifest.json" />
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main id="app">
    <section id="login-screen" hidden>
      <h1>Accedi</h1>
      <form id="login-form">
        <input type="email" id="login-email" placeholder="Email" required />
        <input type="password" id="login-password" placeholder="Password" required />
        <button type="submit">Accedi</button>
      </form>
      <p id="login-error" class="errore" hidden></p>
    </section>

    <section id="profilo-screen" hidden>
      <h1>Il tuo profilo</h1>
      <form id="profilo-form">
        <input type="text" id="profilo-nome" placeholder="Nome" required />
        <input type="number" id="profilo-eta" placeholder="Età" required min="0" max="120" />
        <button type="submit">Salva</button>
      </form>
    </section>

    <section id="tracking-screen" hidden>
      <button id="btn-toggle-sessione" class="btn-principale">Vado a letto</button>
      <p id="timer-live" hidden></p>
      <p id="sync-indicator" class="sync-indicator" hidden>salvato, in sincronizzazione…</p>

      <div id="riquadro-soglia" class="riquadro-soglia" hidden></div>

      <section id="storico">
        <div id="periodo-selector">
          <button data-periodo="giorno" class="periodo-attivo">Giorno</button>
          <button data-periodo="settimana">Settimana</button>
          <button data-periodo="mese">Mese</button>
          <button data-periodo="anno">Anno</button>
        </div>
        <canvas id="grafico-storico"></canvas>
      </section>
    </section>
  </main>

  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Creare `style.css`**

```css
:root {
  color-scheme: light;
  --colore-neutro: #546e7a;
  --colore-allerta: #e53935;
}

body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: #fafafa;
}

#app {
  max-width: 480px;
  margin: 0 auto;
  padding: 24px 16px;
}

form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

input, button {
  padding: 12px;
  font-size: 1rem;
  border-radius: 8px;
  border: 1px solid #cfd8dc;
}

.btn-principale {
  width: 100%;
  padding: 24px;
  font-size: 1.4rem;
  border: none;
  border-radius: 12px;
  background: var(--colore-neutro);
  color: #fff;
}

#timer-live {
  text-align: center;
  font-size: 1.1rem;
  color: #37474f;
}

.riquadro-soglia {
  margin-top: 16px;
  padding: 16px;
  border-radius: 12px;
  background: #eceff1;
  text-align: center;
  font-size: 1.2rem;
}

.riquadro-soglia.sforamento {
  background: var(--colore-allerta);
  color: #fff;
}

.sync-indicator {
  font-size: 0.8rem;
  color: #90a4ae;
  margin-top: 8px;
  text-align: center;
}

#periodo-selector {
  display: flex;
  justify-content: space-around;
  margin: 16px 0 8px;
}

#periodo-selector button {
  border: none;
  background: none;
  color: #546e7a;
}

.periodo-attivo {
  font-weight: bold;
  text-decoration: underline;
}

.errore {
  color: var(--colore-allerta);
  text-align: center;
}
```

- [ ] **Step 3 (manuale): Verificare che la pagina si apra senza errori**

```bash
npm run dev
```

Apri `http://localhost:8000` nel browser: la pagina deve essere bianca (tutte le sezioni sono `hidden`, `app.js` non esiste ancora — è atteso un errore 404 in console per `app.js`, verrà creato nel Task 8).

- [ ] **Step 4: Commit**

```bash
git add index.html style.css
git commit -m "feat: add HTML structure and styles for login, profile, tracking screens"
```

---

## Task 8: Autenticazione e profilo

**Files:**
- Create: `app.js` (parte 1: init, login, profilo)

**Interfaces:**
- Consumes: elementi DOM del Task 7, `SUPABASE_URL`/`SUPABASE_ANON_KEY` da `src/config.js` (Task 6).
- Produces: variabili globali `currentUser`, `currentProfile`, funzione `mostraSchermata(nome)` usate dai Task 9-11 che estendono questo stesso file.

- [ ] **Step 1: Creare `app.js` con la logica di autenticazione e profilo**

```js
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './src/config.js';

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
});

init();
```

- [ ] **Step 2 (manuale): Verificare il flusso di login**

```bash
npm run dev
```

1. Apri `http://localhost:8000`.
2. Deve apparire lo schermo di login (non più pagina bianca).
3. Inserisci l'email/password creati nel Task 6, Step 3.
4. Dopo l'invio: se è il primo accesso, deve apparire lo schermo "Il tuo profilo"; inserisci nome ed età e salva.
5. Deve apparire lo schermo di tracking (il bottone "Vado a letto" per ora non fa nulla — arriva nel Task 9).
6. Ricarica la pagina: deve saltare direttamente allo schermo di tracking (sessione persistita).

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: wire Supabase auth and first-use profile flow"
```

---

## Task 9: Bottone di tracciamento e timer live

**Files:**
- Modify: `app.js` (aggiunta tracking button + timer)

**Interfaces:**
- Consumes: `startSession`, `endSession`, `getActiveSession` da `src/queue.js` (Task 3).
- Produces: funzioni `aggiornaBottoneStato()`, `onToggleSessione()` usate/estese nel Task 10.

- [ ] **Step 1: Estendere `app.js`**

Aggiungi in cima al file, dopo gli import esistenti:

```js
import { startSession, endSession, getActiveSession } from './src/queue.js';
```

Aggiungi agli elementi `el` (dentro l'oggetto esistente):

```js
  btnToggle: document.getElementById('btn-toggle-sessione'),
  timerLive: document.getElementById('timer-live'),
```

Aggiungi in fondo al file, prima della chiamata finale `init();`:

```js
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
}

el.btnToggle.addEventListener('click', onToggleSessione);
```

Modifica la funzione `dopoLogin` esistente per chiamare `aggiornaBottoneStato()` dopo aver mostrato lo schermo di tracking:

```js
  currentProfile = profile;
  mostraSchermata('tracking');
  aggiornaBottoneStato();
```

E lo stesso subito dopo `mostraSchermata('tracking');` nel listener di `el.profiloForm`.

- [ ] **Step 2 (manuale): Verificare il bottone e il timer**

```bash
npm run dev
```

1. Accedi (o ricarica se già loggato).
2. Premi "Vado a letto": il bottone deve diventare "Mi sono alzato" e sotto deve comparire un contatore tipo "0h 0m e in corso" che sale ogni 30 secondi.
3. Apri DevTools → Application → Local Storage: deve esserci una chiave `sonno_queue` con un oggetto `{id, inizio, fine: null}`.
4. Ricarica la pagina: il bottone deve restare "Mi sono alzato" con il timer che riparte dal tempo corretto (persistenza confermata).
5. Premi "Mi sono alzato": il bottone torna a "Vado a letto", il timer sparisce, e in `sonno_queue` l'oggetto ora ha `fine` valorizzato.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: add bed/wake toggle button with live timer and offline queue"
```

---

## Task 10: Sincronizzazione con Supabase

**Files:**
- Modify: `app.js` (aggiunta motore di sincronizzazione)

**Interfaces:**
- Consumes: `syncQueue` da `src/sync.js` (Task 5), `loadQueue` da `src/queue.js` (Task 3).
- Produces: funzione `sincronizza()` chiamata da Task 9 (`onToggleSessione`) e Task 11.

- [ ] **Step 1: Estendere `app.js`**

Aggiungi agli import:

```js
import { syncQueue } from './src/sync.js';
import { loadQueue } from './src/queue.js';
```

Aggiungi agli elementi `el`:

```js
  syncIndicator: document.getElementById('sync-indicator'),
```

Aggiungi in fondo al file:

```js
async function sincronizza() {
  if (loadQueue(storage).length > 0) {
    el.syncIndicator.hidden = false;
  }
  await syncQueue(storage, currentUser.id, async (row) => {
    const { error } = await supabaseClient.from('sessioni_sonno').upsert(row);
    if (error) throw error;
  });
  el.syncIndicator.hidden = loadQueue(storage).length === 0;
}

window.addEventListener('online', sincronizza);
```

Modifica `onToggleSessione` per chiamare la sincronizzazione dopo aver aggiornato lo stato:

```js
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
```

Aggiungi la chiamata a `sincronizza()` subito dopo `aggiornaBottoneStato();` sia in `dopoLogin` sia nel listener di `el.profiloForm` (stessi due punti del Task 9, Step 1).

- [ ] **Step 2 (manuale): Verificare la sincronizzazione online e offline**

```bash
npm run dev
```

1. Accedi, premi "Vado a letto".
2. Apri Supabase → Table Editor → `sessioni_sonno`: deve comparire la riga con `inizio` valorizzato e `fine` nullo entro pochi secondi.
3. In DevTools → Network, imposta "Offline". Premi "Mi sono alzato": il bottone cambia comunque, e sotto deve apparire "salvato, in sincronizzazione…".
4. Riporta la rete "Online": entro pochi secondi l'indicatore deve sparire e su Supabase la riga deve avere `fine` valorizzato.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: sync offline queue with Supabase on toggle, online event, and reload"
```

---

## Task 11: Grafico storico e riquadro soglia

**Files:**
- Modify: `app.js` (aggiunta rendering grafico)

**Interfaces:**
- Consumes: `getSogliaMassimaOre`, `calcolaSforamentoOre`, `formattaOreMinuti` da `src/soglia.js` (Task 2); `buildDayView`, `buildWeekView`, `buildMonthView`, `buildYearView`, `sommaOreInRange` da `src/history.js` (Task 4).

- [ ] **Step 1: Estendere `app.js`**

Aggiungi agli import:

```js
import { getSogliaMassimaOre, calcolaSforamentoOre, formattaOreMinuti } from './src/soglia.js';
import { buildDayView, buildWeekView, buildMonthView, buildYearView, sommaOreInRange } from './src/history.js';
```

Aggiungi agli elementi `el`:

```js
  riquadroSoglia: document.getElementById('riquadro-soglia'),
  periodoSelector: document.getElementById('periodo-selector'),
  graficoCanvas: document.getElementById('grafico-storico'),
```

Aggiungi in fondo al file:

```js
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
      },
      {
        label: 'Soglia',
        data: punti.map(() => soglia),
        borderColor: '#b0bec5',
        borderDash: [6, 6],
        pointRadius: 0,
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

function aggiornaRiquadroSoglia(sessioni, soglia, now) {
  if (periodoAttivo !== 'giorno') {
    el.riquadroSoglia.hidden = true;
    return;
  }
  const rangeStart = new Date(now.getTime() - 24 * 3_600_000);
  const oreALetto = sommaOreInRange(sessioni, rangeStart, now);
  const sforamento = calcolaSforamentoOre(oreALetto, soglia);
  el.riquadroSoglia.hidden = false;
  if (sforamento > 0) {
    el.riquadroSoglia.classList.add('sforamento');
    el.riquadroSoglia.textContent = `Hai superato di ${formattaOreMinuti(sforamento)}`;
  } else {
    el.riquadroSoglia.classList.remove('sforamento');
    el.riquadroSoglia.textContent = `${formattaOreMinuti(oreALetto)} nelle ultime 24 ore`;
  }
}
```

Aggiungi la chiamata a `renderStorico();` negli stessi due punti del Task 9/10 (dopo `sincronizza();` in `dopoLogin` e nel listener di `el.profiloForm`), e anche dentro `sincronizza()` alla fine, così il grafico si aggiorna dopo ogni sync:

```js
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
}
```

(rimuovi quindi la chiamata separata a `renderStorico()` in `dopoLogin`/`profiloForm` se `sincronizza()` viene già chiamata subito dopo — evita la doppia chiamata).

- [ ] **Step 2 (manuale): Verificare grafico e riquadro soglia**

```bash
npm run dev
```

1. Accedi con qualche sessione già presente su Supabase (usa il bottone per crearne un paio, anche brevi, o inserisci righe di test manualmente in Supabase con `inizio`/`fine` di ieri notte).
2. Vista "Giorno" (default): deve comparire il grafico a 24 punti e il riquadro con il totale ore o "Hai superato di...".
3. Clicca "Settimana", "Mese", "Anno": il grafico deve aggiornarsi con il numero di punti atteso (7, 30, 12) e il riquadro soglia deve nascondersi (visibile solo in vista "Giorno").
4. Per verificare il colore rosso: inserisci temporaneamente su Supabase una sessione con più ore della soglia (es. 10 ore per un profilo con soglia 9) e ricarica — il punto/tratto relativo deve apparire rosso e il riquadro deve diventare rosso con "Hai superato di...".

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: render sleep history chart with threshold coloring"
```

---

## Task 12: PWA installabile

**Files:**
- Create: `manifest.json`
- Create: `icons/icon.svg`
- Create: `sw.js`
- Modify: `app.js` (registrazione service worker)

**Interfaces:**
- Nessuna nuova funzione condivisa con altri task.

- [ ] **Step 1: Creare `icons/icon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#546e7a"/>
  <text x="256" y="320" font-size="220" text-anchor="middle" fill="#ffffff" font-family="sans-serif">Z</text>
</svg>
```

- [ ] **Step 2: Creare `manifest.json`**

```json
{
  "name": "Sonno Tracker",
  "short_name": "Sonno",
  "start_url": ".",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#546e7a",
  "icons": [
    { "src": "icons/icon.svg", "sizes": "192x192 512x512", "type": "image/svg+xml", "purpose": "any" }
  ]
}
```

- [ ] **Step 3: Creare `sw.js`**

```js
const CACHE_NAME = 'sonno-tracker-v1';
const ASSETS = ['./', 'index.html', 'style.css', 'app.js', 'manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
```

- [ ] **Step 4: Registrare il service worker in `app.js`**

Aggiungi in fondo al file, subito prima di `init();`:

```js
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
}
```

- [ ] **Step 5 (manuale): Verificare installabilità**

```bash
npm run dev
```

1. Apri `http://localhost:8000` in Chrome.
2. DevTools → Application → Manifest: deve mostrare "Sonno Tracker" senza errori.
3. DevTools → Application → Service Workers: deve comparire `sw.js` come "activated and running".
4. Da smartphone (una volta pubblicata su GitHub Pages nel Task 15), verificare "Aggiungi a schermata Home".

- [ ] **Step 6: Commit**

```bash
git add manifest.json icons/icon.svg sw.js app.js
git commit -m "feat: add PWA manifest, icon, and service worker for installability"
```

---

## Task 13: Script di controllo soglia per Telegram

**Files:**
- Create: `scripts/check-soglia.js`
- Test: `tests/check-soglia.test.js`

**Interfaces:**
- Consumes: `getSogliaMassimaOre`, `calcolaSforamentoOre`, `formattaOreMinuti` da `src/soglia.js`; `sommaOreInRange` da `src/history.js`.
- Produces: `isOrarioInvio(now, timeZone?): boolean`, `inviaMessaggioTelegram(testo): Promise<void>` — usati dal workflow GitHub Actions nel Task 14.

- [ ] **Step 1: Scrivere i test per la parte pura dello script**

```js
// tests/check-soglia.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOrarioInvio } from '../scripts/check-soglia.js';

test('isOrarioInvio: vero quando sono le 18:00 a Roma', () => {
  // 2026-01-15 17:00 UTC = 18:00 CET (Roma, ora solare, UTC+1)
  const now = new Date('2026-01-15T17:00:00.000Z');
  assert.equal(isOrarioInvio(now), true);
});

test('isOrarioInvio: vero quando sono le 18:00 a Roma in ora legale', () => {
  // 2026-07-15 16:00 UTC = 18:00 CEST (Roma, ora legale, UTC+2)
  const now = new Date('2026-07-15T16:00:00.000Z');
  assert.equal(isOrarioInvio(now), true);
});

test('isOrarioInvio: falso in altri orari', () => {
  const now = new Date('2026-01-15T12:00:00.000Z');
  assert.equal(isOrarioInvio(now), false);
});
```

- [ ] **Step 2: Eseguire i test e verificare che falliscano**

Run: `npm test`
Expected: FAIL con errore "Cannot find module '../scripts/check-soglia.js'"

- [ ] **Step 3: Implementare `scripts/check-soglia.js`**

```js
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
    .gte('inizio', rangeStart.toISOString());
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
```

- [ ] **Step 4: Eseguire i test e verificare che passino**

Run: `npm test`
Expected: PASS su tutti i test di `check-soglia.test.js`

- [ ] **Step 5: Commit**

```bash
git add scripts/check-soglia.js tests/check-soglia.test.js
git commit -m "feat: add Telegram threshold-check script"
```

---

## Task 14: Bot Telegram e workflow GitHub Actions

**Files:**
- Create: `.github/workflows/check-soglia.yml`

**Interfaces:**
- Consumes: `scripts/check-soglia.js` (Task 13), secrets GitHub Actions.

- [ ] **Step 1 (guidato, manuale): Creare il bot Telegram**

1. Apri Telegram, cerca "@BotFather" e avvia una chat.
2. Invia `/newbot`, segui le istruzioni (nome e username del bot).
3. BotFather restituisce un **token** — copialo, servirà come secret `TELEGRAM_BOT_TOKEN`.
4. Avvia una chat con il tuo nuovo bot (cercalo per username e premi "Avvia"/`/start`) — un bot non può scrivere per primo, serve questo passaggio.
5. Per ottenere il tuo `chat_id`: apri nel browser `https://api.telegram.org/bot<TOKEN>/getUpdates` (sostituendo `<TOKEN>`) dopo aver inviato un messaggio al bot; nel JSON di risposta cerca `"chat":{"id": ...}` — quel numero è `TELEGRAM_CHAT_ID`.

- [ ] **Step 2 (guidato, manuale): Configurare i secret su GitHub**

Nel repository GitHub (creato nel Task 15) vai su "Settings" → "Secrets and variables" → "Actions" → "New repository secret", e aggiungi quattro secret:
- `SUPABASE_URL` (da Task 6, Step 4)
- `SUPABASE_SERVICE_ROLE_KEY` (da Supabase → "Project Settings" → "API" → "service_role" — **mai** copiarla altrove)
- `TELEGRAM_BOT_TOKEN` (da Step 1)
- `TELEGRAM_CHAT_ID` (da Step 1)

- [ ] **Step 3: Creare `.github/workflows/check-soglia.yml`**

```yaml
name: Controllo soglia sonno

on:
  schedule:
    - cron: '*/15 * * * *'
  workflow_dispatch: {}

jobs:
  controllo:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: node scripts/check-soglia.js
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/check-soglia.yml
git commit -m "feat: add scheduled GitHub Actions workflow for Telegram threshold check"
```

Nota: il workflow non è verificabile end-to-end finché il repository non è su GitHub con i secret configurati — la verifica reale avviene nel Task 16 tramite "Run workflow" manuale (`workflow_dispatch`).

---

## Task 15: Pubblicazione su GitHub

**Files:** nessuno (solo comandi git/gh e configurazione GitHub)

- [ ] **Step 1 (guidato, manuale): Creare il repository pubblico**

Con `gh` CLI autenticato (`gh auth status` per verificare):

```bash
cd /Users/David/Progetti/sonno-tracker
gh repo create sonno-tracker --public --source=. --remote=origin
```

Se `gh` non è autenticato, guida David con `gh auth login` prima di procedere (comando interattivo, va eseguito da lui).

- [ ] **Step 2: Push del codice**

```bash
git push -u origin main
```

- [ ] **Step 3 (guidato, manuale): Abilitare GitHub Pages**

1. Sul repository GitHub → "Settings" → "Pages".
2. In "Build and deployment" → "Source" seleziona "Deploy from a branch".
3. Branch: `main`, cartella: `/ (root)`.
4. Salva e attendi la pubblicazione (di solito 1-2 minuti); l'URL compare in cima alla stessa pagina.

- [ ] **Step 4 (manuale): Verificare i secret e rilanciare manualmente il workflow**

1. Verifica che i 4 secret del Task 14 Step 2 siano presenti su questo repository.
2. Vai su "Actions" → "Controllo soglia sonno" → "Run workflow" per un test manuale immediato (non serve aspettare le 18:00).
3. Controlla i log del job: deve concludersi senza errori (probabilmente con "Non è l'orario di invio, esco." se non sono le 18:00 di Roma).

---

## Task 16: Verifica end-to-end

**Files:** nessuno

- [ ] **Step 1: Eseguire tutta la suite di test**

Run: `npm test`
Expected: PASS su tutti i test (`soglia`, `queue`, `history`, `sync`, `check-soglia`)

- [ ] **Step 2 (manuale, sull'URL pubblico GitHub Pages): Percorso completo utente**

1. Apri l'URL di GitHub Pages sullo smartphone.
2. Accedi con le credenziali create nel Task 6.
3. Premi "Vado a letto", attendi qualche minuto, premi "Mi sono alzato".
4. Verifica che la sessione compaia nel grafico "Giorno" e su Supabase → `sessioni_sonno`.
5. Metti il telefono in modalità aereo, premi "Vado a letto" e poi "Mi sono alzato": verifica l'indicatore "salvato, in sincronizzazione…", poi disattiva la modalità aereo e verifica che la sessione si sincronizzi e l'indicatore sparisca.
6. "Aggiungi a schermata Home" dal browser del telefono: verifica che l'app si apra a schermo intero come PWA.
7. Su Supabase, inserisci temporaneamente una sessione che superi la soglia per il profilo di David e verifica che il riquadro "Giorno" diventi rosso con "Hai superato di...".
8. Lancia manualmente il workflow GitHub Actions ("Run workflow") con quella sessione sopra soglia ancora presente, forzando temporaneamente l'orario se serve (o attendendo le 18:00 reali) — verifica che arrivi il messaggio Telegram con il testo corretto, poi rimuovi la sessione di test da Supabase.

- [ ] **Step 3: Aggiornare `README.md` con le note finali di deploy**

Aggiungi in fondo a `README.md`:

```markdown
## Deploy

- Hosting: GitHub Pages, branch `main`, root.
- Secrets richiesti in "Settings → Secrets and variables → Actions": `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
- Il workflow `.github/workflows/check-soglia.yml` gira ogni 15 minuti e invia un messaggio Telegram solo se, alle 18:00 ora di Roma, le ore a letto nelle ultime 24h superano la soglia raccomandata per età.
```

```bash
git add README.md
git commit -m "docs: add deployment notes to README"
git push
```

---

## Riepilogo copertura spec

- §2-3 Profilo utente e soglia per età → Task 6, 8, 13.
- §4 Autenticazione e RLS → Task 6, 8.
- §5 Inserimento immediato e §5.1 fallback offline → Task 9, 10.
- §6 Storico e grafico → Task 11.
- §7 Soglie per età → Task 2.
- §8 Notifica Telegram → Task 13, 14.
- §9 Architettura (PWA, hosting, repo) → Task 1, 7, 12, 15.
- §10 Account e servizi → Task 6, 14, 15 (guidati).
- §13 Prossimi passi → coperti da Task 6, 14, 15.
