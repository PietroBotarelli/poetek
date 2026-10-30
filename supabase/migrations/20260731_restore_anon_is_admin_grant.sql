-- Ripristina la lettura pubblica del catalogo, interrotta il 30/07/2026.
--
-- Causa
-- -----
-- `20260728_public_beta_reading.sql` ha aperto works, collections, profiles e
-- weekly_metrics ai lettori anonimi. Le policy di works e collections valutano
-- `public.is_admin()`:
--
--   using (status = 'published' or owner_id = auth.uid() or public.is_admin())
--
-- Due giorni dopo `20260730_restrict_function_execution.sql` ha revocato
-- EXECUTE su `is_admin()` ai ruoli public e anon, per ridurre la superficie
-- RPC esposta. Le espressioni delle policy RLS però vengono valutate con i
-- privilegi del ruolo chiamante: da quel momento ogni SELECT anonima su works
-- o collections termina con
--
--   ERROR: permission denied for function is_admin
--
-- L'intera `loadSnapshot()` fallisce, il frontend ripiega sulla lettura
-- pubblica e mostra soltanto il catalogo dimostrativo incorporato: nessun
-- contenuto reale del database raggiunge i visitatori non autenticati.
-- Le tabelle le cui policy non chiamano is_admin() (profiles, weekly_metrics)
-- hanno continuato a funzionare, il che isola la causa senza ambiguità.
--
-- Correzione
-- ----------
-- Il ruolo anon deve poter eseguire la funzione usata dalle policy che lo
-- riguardano. `is_admin()` non accetta argomenti, è STABLE e SECURITY DEFINER
-- e riferisce unicamente se la sessione corrente è amministratrice: per anon
-- `auth.uid()` è NULL, quindi restituisce sempre false. Non espone dati né
-- offre superficie di sondaggio.
--
-- L'intento della migrazione di hardening resta valido per tutto il resto:
-- le funzioni trigger e `record_reading(text, text)` restano non eseguibili
-- da anon.

begin;

grant execute on function public.is_admin() to anon;

commit;
