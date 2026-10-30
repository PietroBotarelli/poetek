# Script di manutenzione

Richiedono Node.js 22 o successivo. Eseguire `npm run check` e `npm test`.
`generate-seed-sql.mjs` produce SQL da un file esterno indicato con --input.
`seed-catalogue.mjs` mostra l'anteprima; `--apply` inserisce il file esterno autorizzato (--input).
`import-local-export.mjs` importa il formato storico poetek-local-export/v1;
senza `--apply` non scrive nulla. Richiede POETEK_EXPORT_FILE e POETEK_OWNER_ID.
Non serve eseguire il seed prima dell'importazione dei propri contenuti.

Gli script che scrivono dati richiedono POETEK_SUPABASE_URL (HTTPS) e
POETEK_SUPABASE_SERVICE_ROLE_KEY nel terminale. Non inserire queste variabili
nel frontend, nei file di configurazione pubblici o nella CI. Verificare sempre
ambiente e destinatario prima di applicare un'importazione.

Export e cancellazione account: vedere docs/PRIVACY-OPERATIONS.md. I file di
esportazione sono dati personali e vanno conservati fuori dal repository.
