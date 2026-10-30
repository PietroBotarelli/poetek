-- Poetek Beta · immagine interna e carattere per ogni poesia
alter table public.works
  add column if not exists reading jsonb not null default '{}'::jsonb;
