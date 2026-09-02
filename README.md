# Sonno Tracker

PWA per tracciare il tempo a letto nelle 24 ore, con avviso Telegram in caso di superamento della soglia raccomandata per età.

## Sviluppo locale

- `npm install` — installa le dipendenze (servono solo per lo script di notifica e i test).
- `npm test` — esegue i test dei moduli di logica pura.
- `npm run dev` — avvia un server statico locale su `http://localhost:8000` per provare la PWA nel browser.

## Configurazione

Vedi `src/config.js` per le chiavi Supabase (pubbliche, safe lato client) e la sezione "Deploy" più sotto per i secret di GitHub Actions.
