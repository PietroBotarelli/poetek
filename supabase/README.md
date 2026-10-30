# Supabase

Questa cartella è la fonte di verità revisionabile del backend Poetek.

## Ordine di applicazione

Per un progetto nuovo:

1. `schema.sql`
2. tutti i file in `migrations/`, in ordine lessicografico
3. i template in `email-templates/`
4. le impostazioni Auth e SMTP descritte in `../docs/OPERATIONS.md`

Per un progetto esistente si eseguono soltanto le migrazioni mancanti. I file
già applicati restano immutabili anche quando nomi o commenti raccontano una
fase storica del prodotto: sono parte della cronologia tecnica.

## Confine di sicurezza

Le sette tabelle applicative usano Row Level Security. I visitatori anonimi
possono leggere esclusivamente profili attivi e contenuti pubblicati. Le
operazioni personali verificano `auth.uid()`.

La scrittura delle letture passa soltanto dalla funzione
`public.record_reading`; l'inserimento diretto in `reading_events` è revocato
dalla migrazione di hardening del 30 luglio 2026.

Il bucket `poetek-media` è privato. I riferimenti salvati nel database hanno la
forma `poetek-media:<percorso>` e il frontend genera URL firmati a durata
limitata.

## Segreti

La publishable key può stare in `web/beta-config.js`. Non versionare mai:

- service-role key;
- password del database;
- credenziali SMTP;
- token personali GitHub, Netlify o Supabase.

Il progetto non richiede più Edge Function: la funzione `invite-user`
apparteneva alla beta privata ed è stata ritirata.
