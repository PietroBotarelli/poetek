# Operazioni

Questo documento descrive la procedura canonica per replicare, distribuire e
manutenere Poetek. I passaggi che modificano dati vanno prima provati in un
progetto Supabase di sviluppo.

## 1. Replica da zero

### Supabase

1. Crea un nuovo progetto nella regione desiderata.
2. Esegui `supabase/schema.sql` una sola volta.
3. Esegui tutti i file in `supabase/migrations/` in ordine lessicografico.
4. Verifica che le otto tabelle applicative abbiano RLS attiva.
5. In Authentication → Sign In / Providers → Email:
   - abilita la creazione di nuovi utenti;
   - richiedi la conferma dell'email;
   - imposta la lunghezza minima della password a 8 caratteri;
   - abilita la protezione dalle password note o compromesse;
   - imposta la scadenza dei collegamenti email a 3600 secondi;
   - lascia disabilitati accessi anonimi e collegamento manuale.
6. Imposta Site URL e Redirect URL sull'URL HTTPS esatto del sito.
7. Applica i template in `supabase/email-templates/`.
8. Configura un provider SMTP dedicato e conserva le credenziali solo in
   Supabase.
9. Controlla il bucket `poetek-media`: privato, limite 10 MB, MIME JPEG, PNG,
   WebP e AVIF.

`schema.sql` serve al bootstrap di un progetto vuoto. Su un ambiente esistente
si applicano soltanto le migrazioni non ancora eseguite. Non usare lo schema
completo come meccanismo di aggiornamento.

### Frontend e Netlify

1. Inserisci URL e publishable key del nuovo progetto in
   `web/beta-config.js`.
2. Crea un sito Netlify collegato al repository.
3. Imposta il ramo di produzione su `main`.
4. Lascia vuoto il comando di build.
5. Usa `web` come base e `.` come directory pubblicata.
6. Non aggiungere a Netlify chiavi Supabase segrete: non sono necessarie.

## 2. Cambiamento ordinario

1. Lavora su un ramo dedicato.
2. Modifica la fonte canonica, senza copie parallele.
3. Aggiorna la versione query-string dell'asset modificato in `web/index.html`.
4. Esegui `node scripts/validate-repository.mjs`.
5. Controlla il deploy preview su desktop e smartphone.
6. Unisci in `main` solo dopo la verifica.
7. Controlla il deploy di produzione e completa gli smoke test.

## 3. Migrazione database

1. Crea un nuovo file `YYYYMMDD_descrizione.sql`.
2. Preferisci istruzioni idempotenti (`if exists`, `if not exists`) quando
   semanticamente corretto.
3. Non modificare una migrazione già applicata.
4. Prova avanti e rollback logico in sviluppo.
5. Esegui un backup prima di modifiche distruttive.
6. Applica in produzione e registra data, file e risultato nel change log del
   rilascio.

Lo schema storico di produzione è stato configurato tramite SQL Editor.
Le due migrazioni del 30 ottobre 2026 sono state applicate e registrate tramite
l'integrazione Supabase. Prima di adottare la CLI o applicare altre migrazioni,
verificare lo schema effettivo e registrare una baseline dello storico manuale:
non rieseguire automaticamente tutte le vecchie migrazioni in produzione.

## 4. Smoke test dopo il deploy

- Home, “Leggi”, “Pubblica”, libreria, profilo e “Chi siamo” si aprono.
- Un visitatore anonimo legge catalogo e poesia ma non può scrivere.
- Registrazione: nome, email, password, conferma email e primo accesso.
- Logout e nuovo login usano la stessa password.
- Recupero password apre il flusso di scelta della nuova password.
- Pubblicazione e modifica sono limitate al proprietario.
- Salvataggio, follow e aggiornamento del profilo persistono.
- Avatar e immagini vengono caricati e restituiti con URL firmato.
- `record_reading` aggiorna la metrica senza duplicazioni ravvicinate.
- Realtime non genera violazioni CSP o errori in console.
- Su smartphone i versi lunghi restano integri e accessibili.

## 5. Monitoraggio

- Netlify: deploy riuscito, error rate e richieste anomale.
- Supabase: Advisor, Auth logs, API errors, Storage errors e backup recente.
- Email: tasso di consegna, bounce e limiti SMTP.
- Prima di eliminare una risorsa legacy, verificare riferimenti nel repository
  e invocazioni nelle ultime 24 ore.

Le funzioni privilegiate sono in `poetek_private`, fuori dallo schema Data API.
Le funzioni pubbliche necessarie sono wrapper SECURITY INVOKER e derivano
l'identità da `auth.uid()`. Nessun ruolo client scrive direttamente gli eventi
di lettura, registrati dalla RPC. Dopo il rilascio verificare l'Advisor.
Il controllo del 30 ottobre 2026 mantiene soltanto l'avviso sulla protezione
delle password compromesse: questa funzionalità Supabase richiede un piano
Pro o superiore e non è disponibile nel piano gratuito attuale. Non è stato
attivato alcun piano a pagamento.

## 6. Rollback

- Frontend: ripristina su `main` il commit precedente; Netlify ridistribuisce
  automaticamente. I dati Supabase non vengono toccati.
- Database: non modificare la vecchia migrazione e non usare un reset. Crea una
  nuova migrazione correttiva, dopo backup e prova in sviluppo.
- Configurazione Auth: annota i valori precedenti prima di modificarli e
  ripristinali dal dashboard se il flusso di conferma o recupero fallisce.

## 7. Controlli periodici

- Ogni rilascio: validazione automatica e smoke test.
- Ogni mese: dipendenza `@supabase/supabase-js`, header CSP, advisor e backup.
- Prima di crescita pubblica: SMTP dedicato, dominio definitivo, pagine legali
  approvate e monitoraggio degli abusi.

## Aggiornamento di sicurezza 2.3.0

Applicare la nuova migrazione del 30 ottobre 2026 dopo le precedenti e prima del
frontend. Il campo legacy last_author dei profili resta nullo: la lettura è
conservata soltanto in profile_preferences, con accesso del titolare.
Prima dell'applicazione verificare ID, riferimenti media e proprietà delle
raccolte. Le nuove constraint sugli ID sono NOT VALID per non bloccare righe
storiche: dopo il controllo validarle esplicitamente. Il frontend protegge
anche gli eventuali ID storici non conformi durante il rendering.

Gli URL firmati emessi dalla nuova versione scadono dopo cinque minuti e si
rinnovano durante la lettura. Quelli vecchi possono durare fino a 24 ore.
Non rieseguire script amministrativi vecchi o vecchi seed basati sui nomi.
Per privacy e richieste degli utenti seguire PRIVACY-OPERATIONS.md.
