-- Centralizza la registrazione delle letture nella RPC record_reading.
-- La funzione è SECURITY DEFINER e applica validazione, visibilità e deduplica.

begin;

drop policy if exists "Members insert reading events"
  on public.reading_events;

revoke insert on table public.reading_events from anon, authenticated;

commit;
