# Poetek

Poetek è una piattaforma web per leggere, pubblicare, scoprire e condividere
poesia contemporanea. Il progetto è una single-page application statica:
Netlify distribuisce il frontend, mentre Supabase gestisce autenticazione,
database, media e aggiornamenti in tempo reale.

Visita il sito: <https://poetek-beta.netlify.app/>

Questo repository raccoglie il codice e la documentazione dell’applicazione. Le opere, i profili e i contenuti caricati dagli utenti sono gestiti separatamente e non sono inclusi nel repository.

## Organizzazione del progetto

- Codice e documentazione — GitHub. 'main' contiene il codice dell’applicazione, lo schema del database, le migrazioni SQL e le procedure per installare il progetto.

- Pubblicazione del sito — Netlify. Netlify distribuisce la cartella `web/`, che contiene il frontend: pagine, stili e codice. Le modifiche caricate su `main` attivano l’aggiornamento automatico del sito.

- Dati e utenti — Supabase. Supabase gestisce gli account e conserva opere, raccolte e immagini. Un aggiornamento del frontend non sovrascrive questi dati. Le modifiche alla struttura del database vengono applicate separatamente attraverso le migrazioni SQL.

- Configurazione pubblica. Il file `web/beta-config.js` contiene l’URL del progetto Supabase e la chiave pubblica necessaria al funzionamento del sito. Le chiavi amministrative sono escluse dal repository.

## Struttura dei file

```text
web/                         frontend distribuito
  index.html                 pagina principale e struttura dell'interfaccia
  main.js                    avvio dell'applicazione e collegamento dei moduli
  backend.js                 unico adattatore verso Supabase
  beta-config.js             configurazione pubblica dell'ambiente
  styles.css                 fondamenta visive
  editorial-direction.css    direzione editoriale e responsive
  assets/                    immagini e texture locali usate dal frontend
  state/store.js             stato centralizzato dell'applicazione
  config/constants.js        costanti e valori di default
  data/seed.js               catalogo iniziale vuoto
  domain/                    logica applicativa: azioni e selezione dei dati
  router/router.js           routing e navigazione
  services/                  integrazione backend, gestione media e condivisione
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

## Documentazione
ARCHITECTURE.md: architettura dell’applicazione, componenti e flussi dei dati.
OPERATIONS.md: installazione, configurazione, rilascio e manutenzione.

## Licenza e contenuti
Il codice è consultabile con tutti i diritti riservati, come indicato in LICENSE. La pubblicazione del repository non concede automaticamente il permesso di riutilizzarlo o distribuirlo.

Per i diritti relativi ai testi, alle immagini e agli altri contenuti, consultare CONTENT-RIGHTS.md.

