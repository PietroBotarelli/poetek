-- Separa l'estensione tecnica unaccent dallo schema API pubblico.

begin;

create schema if not exists extensions;

alter extension unaccent
  set schema extensions;

alter function public.slugify(text)
  set search_path = public, extensions;

commit;
