-- Poetek Beta aperta: un codice email può creare o riaprire un profilo.
-- Da eseguire dopo schema.sql e 20260728_public_beta_reading.sql.
--
-- Questo trigger opera soltanto alla creazione di un utente Auth. Ogni
-- profilo nasce attivo e autore, mentre tutte le policy RLS continuano a
-- richiedere auth.uid() per pubblicazioni, libreria, follow e media.

create extension if not exists unaccent;

create or replace function public.slugify(value text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(unaccent(coalesce(value, 'autore'))), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_name text;
  desired_handle text;
begin
  base_name := coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1), 'Autore');
  desired_handle := left(public.slugify(base_name), 68) || '-' || substr(new.id::text, 1, 8);

  insert into public.profiles (id, display_name, handle, role, status)
  values (new.id, left(base_name, 80), desired_handle, 'author', 'active')
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists auth_user_profile on auth.users;
create trigger auth_user_profile
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

comment on function public.handle_new_user() is
  'Creates an active Poetek author profile whenever a user completes email sign-up.';
