# Sonno Tracker — Design

Data: 2026-09-02
Fonte: `Sonno-Tracker-design.pdf` (progetto "Casa", bozza del 2 settembre 2026), integrato con decisioni tecniche prese in fase di brainstorming con Claude Code.

## 1. Obiettivo

PWA per smartphone che misura il tempo trascorso a letto nelle 24 ore (finestra mobile), lo confronta con le ore di sonno raccomandate per età, mostra uno storico visivo a colpo d'occhio e invia un avviso su Telegram in caso di superamento della soglia consigliata.

## 2. Assunzioni

- Finestra di calcolo: mobile (ultime 24 ore da adesso), non giorno di calendario.
- Utente singolo: nessuna gestione multi-profilo.
- La soglia di riferimento dipende solo dall'età (fonte CDC, vedi §7); il sesso non la influenza e non viene raccolto.
- L'app misura "tempo a letto", non sonno effettivo: se si resta svegli a letto viene comunque conteggiato. Semplificazione accettata.
- Hosting frontend: GitHub Pages, sullo stesso repo pubblico del codice.
- Autenticazione: login singolo utente via Supabase Auth (aggiunta rispetto al documento originale — vedi §4, motivazione nei Rischi §11).
- Grafico: Chart.js.
- Repository GitHub: `sonno-tracker` (stesso nome del progetto Supabase già creato), pubblico, sull'account GitHub dell'utente.

## 3. Profilo utente

Campi raccolti al primo utilizzo (dopo il login): **nome**, **età**.
La soglia massima raccomandata viene calcolata automaticamente dall'età (tabella CDC, §7), con possibilità di sovrascrittura manuale (es. indicazione del medico).

## 4. Autenticazione e sicurezza dati

- Login email + password via Supabase Auth, un solo account (quello dell'utente). Sessione persistita nel browser: dopo il primo accesso, l'uso quotidiano resta un tap immediato, senza login ripetuti.
- **Perché il login**: il documento originale richiedeva "nessuna chiave con permessi di scrittura esposta lato client", ma l'app scrive le sessioni direttamente dal browser. La chiave pubblica ("anon") di Supabase è per natura visibile in una PWA pubblica. Senza login, chiunque trovi quella chiave potrebbe leggere/scrivere lo storico del sonno anche con RLS attive. Con l'autenticazione, le policy RLS filtrano per `auth.uid()`: i dati restano protetti anche se la chiave anon è pubblica.
- Tabelle Supabase:
  - `profiles`: `id` (uuid, = `auth.users.id`), `nome` (text), `eta` (int), `soglia_manuale_ore` (numeric, nullable).
  - `sessioni_sonno`: `id` (uuid), `user_id` (uuid, FK), `inizio` (timestamptz), `fine` (timestamptz, nullable mentre la sessione è in corso).
- Row Level Security su entrambe le tabelle: ogni riga leggibile/scrivibile solo se `auth.uid() = user_id` (o `= id` per `profiles`).
- La chiave con permessi più ampi (service role), usata solo dallo script di notifica Telegram lato server (GitHub Actions), è salvata come **secret** di GitHub Actions — mai nel codice del repo, mai lato client.

## 5. Funzionamento — inserimento immediato

- Un solo bottone, grande, a piena larghezza: **"Vado a letto"**. Un tap registra il timestamp automatico dal dispositivo (nessuna selezione manuale di data/ora).
- Il bottone diventa **"Mi sono alzato"**: un tap ferma il conteggio e salva la sessione.
- Mentre il conteggio è attivo, un contatore live a schermo mostra il tempo trascorso (es. "5h 32m e in corso").
- Nessun altro campo obbligatorio in fase di inserimento.

### 5.1 Fallback offline

- Ogni tap scrive **subito** l'orario in `localStorage` del telefono, prima di provare a contattare Supabase — bottone e contatore live funzionano sempre, anche senza rete.
- Il dato locale è una piccola coda di sessioni "da sincronizzare" (normalmente 0 o 1 elemento; robusta anche al raro caso di più sessioni chiuse offline in sequenza).
- Tentativo di sincronizzazione: subito dopo il tap, poi automaticamente al ritorno della connessione (evento `online` del browser) e ad ogni riapertura dell'app.
- Appena una sessione è confermata su Supabase, viene **cancellata subito dalla coda locale** — nessun accumulo nel tempo.
- Se l'inizio sessione non è ancora sincronizzato al momento di "Mi sono alzato", l'intera sessione (inizio+fine) viene inviata in un solo colpo alla prima connessione utile.
- **Indicatore visivo**: quando c'è almeno un elemento in coda (offline o sync in corso), appare una scritta discreta tipo "salvato, in sincronizzazione…" — stile sobrio (testo piccolo, colore neutro, nessuna icona invadente), posizionata in modo da non competere visivamente con l'avviso rosso di superamento soglia (§6). Sparisce automaticamente non appena la coda si svuota.

## 6. Storico e grafico

Stile: linea con pallini, sviluppo orizzontale, selettore di periodo integrato nel grafico stesso (Chart.js). Vista di default: **giorno**.

| Periodo | Granularità dei punti |
|---|---|
| Giorno (default) | Un punto per ora, andamento delle ultime 24h |
| Settimana | Un punto per ciascuno degli ultimi 7 giorni (totale ore/giorno) |
| Mese | Un punto per ciascuno degli ultimi 30 giorni |
| Anno | Un punto per ciascuno dei 12 mesi (media mensile) |

**Colorazione "d'impatto"**
- Tratto di linea e area sotto la curva sopra la soglia consigliata → rosso acceso, con etichetta diretta sul punto (es. "+1h20m"); sotto soglia → colore neutro.
- Linea orizzontale di riferimento = soglia massima consigliata.
- Vista "giorno": riquadro numerico prominente che diventa interamente rosso in caso di sforamento, con testo esplicito (es. "Hai superato di 1h20m").

## 7. Soglie di riferimento per età

Fonte primaria: CDC, incrociata con Sleep Foundation e National Sleep Foundation (nessuna contraddizione sostanziale).

| Età | Ore consigliate |
|---|---|
| 0–3 mesi | 14–17 ore |
| 4–12 mesi | 12–16 ore (inclusi pisolini) |
| 1–2 anni | 11–14 ore (inclusi pisolini) |
| 3–5 anni | 10–13 ore (inclusi pisolini) |
| 6–12 anni | 9–12 ore |
| 13–17 anni | 8–10 ore |
| 18–60 anni | 7 ore o più (max consigliato di riferimento: 9 ore) |
| 61–64 anni | 7–9 ore |
| 65+ anni | 7–8 ore |

Fonti: CDC (cdc.gov/sleep) · Sleep Foundation (sleepfoundation.org) · National Sleep Foundation (thensf.org).

## 8. Notifica Telegram

- Bot Telegram dedicato, creato via @BotFather (guidato passo passo durante l'implementazione).
- GitHub Actions esegue lo script ogni 15 minuti (cron UTC, tutto l'anno). Lo script (Node.js, stesso linguaggio del frontend) calcola l'ora locale di Roma da sé (gestisce automaticamente il cambio ora legale/solare) e, quando corrisponde alle 18:00 locali, calcola le ore trascorse a letto nelle ultime 24h.
- Messaggio inviato **solo se** la soglia massima è superata, con l'entità esatta del superamento — es. "Hai superato di 1h20m il limite consigliato per la tua età (9h)". Nessun messaggio nei giorni nella norma.
- Lo script usa la chiave service role di Supabase (secret di GitHub Actions) per leggere le sessioni, e il token del bot (altro secret) per inviare il messaggio via Telegram Bot API.

## 9. Architettura tecnica

- **Frontend**: PWA vanilla HTML/CSS/JS (nessun framework, nessun build step), installabile sulla schermata Home. Librerie via CDN: `@supabase/supabase-js`, `Chart.js`. `manifest.json` + service worker per installabilità e cache dello shell statico.
- **Dati**: Supabase (piano free, progetto "sonno-tracker" già creato) — l'app legge/scrive le sessioni via API Supabase (con fallback offline, §5.1). Nessun commit Git ad ogni tap.
- **Automazione avviso**: script Node.js schedulato con GitHub Actions (repo pubblico) che interroga Supabase e invia il messaggio via Telegram Bot API.
- **Repository**: `sonno-tracker`, pubblico su GitHub (codice open source, riutilizzabile). Dati personali (età, storico sonno) privati su Supabase, protetti da Row Level Security + autenticazione (§4).
- **Hosting**: GitHub Pages, dallo stesso repo.

### Struttura repository (indicativa)

```
sonno-tracker/
├── index.html
├── app.js
├── style.css
├── manifest.json
├── sw.js
├── icons/
├── .github/
│   └── workflows/
│       └── check-soglia.yml
└── README.md
```

## 10. Account e servizi necessari

| Servizio | Stato | Costo |
|---|---|---|
| GitHub | Da verificare/usare account esistente | Gratuito |
| Supabase | Creato — progetto "sonno-tracker" | Gratuito (piano free) |
| Telegram Bot (@BotFather) | Da creare, guidato da Claude Code in fase di sviluppo | Gratuito |

Costo totale del progetto: zero.

## 11. Rischi e limiti

- **Precisione della misura**: l'app registra "tempo a letto", non sonno effettivo. Accettato come semplificazione.
- **Affidabilità dell'orario**: GitHub Actions non garantisce la precisione al minuto; mitigato controllando ogni 15 minuti invece di un singolo cron alle 18:00 esatte.
- **Sicurezza dei dati**: la chiave anon è pubblica per natura in una PWA; la protezione reale viene dall'autenticazione + RLS (§4), non dalla segretezza della chiave. La chiave service role non è mai esposta lato client.
- **Fallback offline**: se il telefono resta offline per un periodo prolungato, la coda locale in `localStorage` può contenere più di una sessione non sincronizzata; viene svuotata automaticamente e progressivamente ad ogni sync riuscita, quindi non c'è rischio di perdita dati ma solo un ritardo nella disponibilità dello storico completo su Supabase (e quindi nel calcolo dell'avviso Telegram, che si basa sui dati già sincronizzati al momento del controllo).

## 12. Fuori scope (per ora)

- Nessun recupero password via UI (unico utente: reset da dashboard Supabase se necessario).
- Nessuna gestione multi-dispositivo avanzata oltre al comportamento di default di Supabase (ultima scrittura vince).
- Nessun tema chiaro/scuro dedicato in questa prima versione.

## 13. Prossimi passi

1. Creare il bot Telegram via @BotFather (guidato da Claude Code).
2. Recuperare URL e chiave anon di Supabase da Project Settings, e generare/recuperare la chiave service role (da fare al momento della configurazione, chiavi mai condivise fuori dall'ambiente di sviluppo).
3. Creare l'utente Supabase Auth (login) per l'accesso all'app.
4. Creare il repository pubblico `sonno-tracker` su GitHub.
5. Passare a `writing-plans` per il piano di implementazione dettagliato.
