# Gestione delle richieste privacy

Contatto: Pietro Botarelli, pietrobota@gmail.com. Controllare questo indirizzo
regolarmente; registrare data, tipo di richiesta e termine per il riscontro.
Verificare il controllo dell'indirizzo di registrazione prima di esportare o
eliminare dati. Non chiedere documenti d'identità se non necessari.

Rispondere di regola entro un mese, secondo i termini e le eccezioni del GDPR.
Per accesso e portabilità usare `scripts/export-account.mjs --user=UUID
--out=PERCORSO_PRIVATO.json`; completare con i media richiesti, fornendo link
temporanei solo alla persona verificata. Non includere dati di altri utenti,
credenziali o hash di password. Conservare il file solo per la consegna e la
gestione della richiesta, poi eliminarlo dalle copie di lavoro non necessarie.

Per cancellazione, verificare prima se esistono obblighi di conservazione o
controversie. Lo script `scripts/delete-account.mjs --user=UUID` mostra una
anteprima; con `--apply` rimuove attraverso le API i media, le opere, le raccolte
e l'account. La cancellazione dell'account elimina in cascata profilo, libreria,
preferenze, follow ed eventi personali. I conteggi settimanali aggregati non
identificano il singolo account. Lo script richiede una chiave amministrativa
solo nel terminale; non va eseguito nel browser o automaticamente in CI.

Annotare l'esito e comunicarlo al richiedente. Lo script non è una transazione
tra Storage, Auth e database: se si interrompe, controllare lo stato e completare
la rimozione senza presumere che sia già avvenuta. Le copie esterne fatte da
visitatori non sono sotto il controllo del servizio. Gli URL firmati già
emessi restano validi fino a scadenza; le versioni precedenti emettevano URL
di 24 ore, la nuova versione usa cinque minuti.

In un ripristino da backup, riapplicare le richieste di cancellazione ricevute
dopo la copia ripristinata. Non conservare un nuovo archivio permanente dei
testi cancellati per registrare l'adempimento.

Controllare almeno a ogni rilascio che privacy pubblicata, fornitori, regione,
SMTP configurato, log e procedure corrispondano al servizio. La regione
Supabase verificata il 30 ottobre 2026 è eu-west-1; il sito è su Netlify.
