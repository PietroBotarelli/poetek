# Architettura

## Vista d'insieme

```text
Browser
  ├─ HTML/CSS/JavaScript statici ← Netlify ← GitHub main
  └─ supabase-js
       ├─ Auth: email + password, conferma e recupero
       ├─ Postgres: contenuti e relazioni protetti da RLS
       ├─ Storage: immagini private servite tramite URL firmati
       └─ Realtime: invalidazione e ricaricamento dello snapshot
```

Non esiste un server applicativo separato. `web/backend.js` è l'unico confine
del frontend verso Supabase; i moduli in `web/domain/`, `web/views/` e
`web/router/` non devono costruire query Supabase dirette. Questa separazione
mantiene l'interfaccia sostituibile e concentra autenticazione, mapping dei
dati e media in un solo modulo.

## Responsabilità

### GitHub

Conserva la fonte di verità revisionabile: frontend, SQL, template email,
utility e documentazione. Il ramo `main` rappresenta ciò che può andare in
produzione.

### Netlify

Distribuisce solo `web/`, senza build e senza variabili d'ambiente. Gli header
di sicurezza sono dichiarati in `netlify.toml`. I parametri presenti nel
browser sono deliberatamente pubblici.

### Supabase

- Auth crea sessioni persistenti e rinnovabili.
- Postgres applica Row Level Security a ogni tabella applicativa.
- Storage limita tipo e dimensione delle immagini e applica policy sul percorso
  dell'utente.
- Realtime notifica il frontend; il database resta comunque la fonte di verità.

## Contratto dati

| Oggetto | Responsabilità |
| --- | --- |
| `profiles` | identità pubblica, ruolo e stato |
| `collections` | raccolte possedute da un profilo |
| `works` | poesie, pubblicazione e metadati |
| `library_items` | salvataggi personali |
| `author_follows` | relazioni tra lettore e autore |
| `reading_events` | eventi grezzi di lettura autenticata |
| `weekly_metrics` | aggregati settimanali usati dalle classifiche |
| `record_reading` | unico ingresso autorizzato per registrare una lettura |
| `poetek-media` | avatar, copertine e immagini interne |

La lettura dei profili attivi e delle opere pubblicate è disponibile anche
senza account. Pubblicazione, modifica, libreria, follow, upload e metriche
personali richiedono una sessione.

## Autenticazione

1. L'utente si registra con nome pubblico, email e password.
2. Supabase invia il collegamento di conferma.
3. Il callback torna alla radice del sito e attiva la sessione.
4. La sessione viene salvata in `localStorage`, rinnovata automaticamente e
   rimossa solo al logout o se non è più valida.
5. Il recupero password usa un collegamento distinto e consente di impostare
   una nuova password.

La chiave di storage `poetek-beta-auth-session-v2` separa deliberatamente le
sessioni attuali da quelle della vecchia beta privata.

## Sicurezza

- Le publishable key non sono segreti; la protezione reale è RLS.
- Le service-role key non entrano mai nel browser, GitHub o Netlify.
- Tutte le tabelle applicative hanno RLS attiva.
- I client non inseriscono direttamente in `reading_events`; usano la RPC
  `record_reading`, che valida visibilità e frequenza.
- I file sono caricati nella directory dell'utente e letti tramite URL firmati.
- La Content Security Policy consente HTTPS e WebSocket soltanto verso
  Supabase, oltre alle fonti statiche dichiarate.

## Decisioni intenzionali

- Nessun framework o bundler: il progetto resta ispezionabile e distribuibile
  come file statici.
- Nessuna duplicazione della configurazione tra Netlify e JavaScript.
- Nessuna modifica retroattiva alle migrazioni applicate.
- Nessuna Edge Function per gli inviti: l'iscrizione è pubblica e autonoma.
- I versi lunghi non vengono spezzati; su schermi stretti la lettura conserva
  l'integrità tipografica del verso tramite scorrimento controllato.

## Confini aggiornati (2.3.0)

profile_preferences contiene l'ultimo autore letto e ha accesso esclusivo del
titolare attivo. Il campo pubblico legacy è sempre NULL. La proprietà delle
raccolte e dei riferimenti media viene verificata lato database; un JWT di un
account sospeso non basta a scrivere. La lettura delle immagini dipende dalla
pubblicazione o dalla proprietà. Le viste autore usano l'ID del proprietario,
così nomi uguali non mescolano i cataloghi. Gli script di test riproducono
questi confini con PostgreSQL isolato.
