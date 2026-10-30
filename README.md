# Poetek

Poetek è una piattaforma web per leggere, pubblicare, scoprire e condividere
poesia contemporanea. Il progetto è una single-page application statica:
Netlify distribuisce il frontend, mentre Supabase gestisce autenticazione,
database, media e aggiornamenti in tempo reale.

Sito operativo (contenuti live dal database): <https://poetek-beta.netlify.app/>

Repository dell'infrastruttura: <https://github.com/PietroBotarelli/poetek>.
Il catalogo, i profili e i file degli utenti sono conservati in Supabase:
non sono inclusi, ovviamente, nei file né nella cronologia di questo repository.
Il sito legge il backend e riceve gli aggiornamenti tramite Supabase Realtime.

## Fonte di verità

- `main` su GitHub contiene codice, schema, migrazioni e procedure operative.
- Netlify pubblica esclusivamente `web/`.
- Supabase conserva utenti e dati di produzione: un deploy del frontend ovviamente non li
  modifica.
- `web/beta-config.js` contiene soltanto URL e publishable key pubblici. Per ovvie ragioni, nessuna
  service-role key o credenziale SMTP entra nel repository.

## Struttura

```text
web/                         frontend distribuito
  index.html                 shell, accessibilità e Content Security Policy
  main.js                    entry point: cablaggio moduli ed event listener globali
  backend.js                 unico adattatore verso Supabase
  beta-config.js             configurazione pubblica dell'ambiente
  styles.css                 fondamenta visive
  editorial-direction.css    direzione editoriale e responsive
  assets/                    immagini e texture locali usate dal frontend
  state/store.js             stato centralizzato dell'applicazione
  config/constants.js        costanti e valori di default
  data/seed.js                dati seed del catalogo
  domain/                    logica applicativa pura (selectors.js, actions.js)
  router/router.js           routing e navigazione
  services/                  integrazione backend (backend-bridge.js) e media (media.js)
  utils/                     helper di basso livello (dom.js, parsers.js)
  views/                     template di rendering per ciascuna pagina
supabase/
  schema.sql                 bootstrap di un progetto nuovo
  migrations/                modifiche incrementali, in ordine cronologico
  email-templates/           template canonici per conferma e recupero
scripts/                     importazione, seed e validazione
docs/
  ARCHITECTURE.md            confini e flussi del sistema
  OPERATIONS.md              replica, rilascio, rollback e controlli
netlify.toml                 configurazione di pubblicazione e header
```

## Validazione e rilascio

```powershell
npm ci --ignore-scripts
npm run check
npm test
```

La stessa validazione viene eseguita da GitHub Actions su push e pull request.
Un push su `main` attiva il deploy di produzione Netlify; le pull request
generano soltanto deploy preview.

Le modifiche al database seguono una pipeline separata: aggiungere una nuova
migrazione, revisionarla, provarla in un progetto di sviluppo e solo dopo
applicarla alla produzione.

Per replicare o gestire il sistema, seguire
[`docs/OPERATIONS.md`](docs/OPERATIONS.md). Le decisioni architetturali e il
contratto dati consultabili in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Revisione per la pubblicazione — 30 ottobre 2026

Codice consultabile con tutti i diritti riservati: vedere LICENSE. Per i materiali
editoriali vedere CONTENT-RIGHTS.md. I dati degli utenti non sono ovviamente distribuiti
con il repository, il quale non distribuisce neppure dati dimostrativi o contenuti editoriali.

Si può accedere direttamente al sito funzionante, aggiornato in tempo reale tramite apposito link: <https://poetek-beta.netlify.app/>
