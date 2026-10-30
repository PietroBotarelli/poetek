# Importazione di dati esterni

Il repository distribuisce solo infrastruttura e non contiene un catalogo.
`node scripts/generate-seed-sql.mjs --input=PERCORSO_PRIVATO.json` genera SQL
da un array esterno di opere. `node scripts/seed-catalogue.mjs` mostra
l'anteprima vuota; usare `--input=PERCORSO_PRIVATO.json --apply` per inserire
un catalogo autorizzato senza sovrascrivere opere esistenti.
Non salvare qui il file di input o il catalogo reale degli utenti.
