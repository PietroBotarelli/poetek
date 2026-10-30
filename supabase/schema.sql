-- Poetek Beta · schema PostgreSQL/Supabase
-- Applicare questo file una volta in un progetto Supabase nuovo, con il SQL Editor.
-- Nessuna chiave segreta va inserita nel frontend.

create extension if not exists pgcrypto;
create extension if not exists unaccent;

do $$ begin
  create type public.beta_role as enum ('reader', 'author', 'admin');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.publication_status as enum ('draft', 'published', 'archived');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  handle text not null unique check (handle ~ '^[a-z0-9-]{3,80}$'),
  avatar_url text check (avatar_url is null or avatar_url ~ '^https://|^storage://poetek-media/'),
  last_author text,
  role public.beta_role not null default 'author',
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collections (
  id text primary key check (char_length(id) between 3 and 120),
  owner_id uuid references public.profiles(id) on delete set null,
  author_name text not null check (char_length(author_name) between 1 and 80),
  title text not null check (char_length(title) between 1 and 240),
  description text not null default '',
  note text not null default '',
  card jsonb not null default '{}'::jsonb,
  status public.publication_status not null default 'published',
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.works (
  id text primary key check (char_length(id) between 3 and 120),
  owner_id uuid references public.profiles(id) on delete set null,
  collection_id text references public.collections(id) on delete set null,
  author_name text not null check (char_length(author_name) between 1 and 80),
  title text,
  issue text not null default 'Pubblicazione Beta',
  tags text[] not null default '{}' check (cardinality(tags) <= 5),
  body text not null check (char_length(body) between 1 and 100000),
  note text not null default '',
  card jsonb not null default '{}'::jsonb,
  reading jsonb not null default '{}'::jsonb,
  position integer check (position is null or position > 0),
  status public.publication_status not null default 'published',
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Nuove preferenze della pagina di lettura: carattere e immagine interna.
-- L'ALTER rende lo schema applicabile anche a una Beta già avviata.
alter table public.works add column if not exists reading jsonb not null default '{}'::jsonb;

create table if not exists public.library_items (
  user_id uuid not null references public.profiles(id) on delete cascade,
  work_id text not null references public.works(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, work_id)
);

create table if not exists public.author_follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, author_id),
  check (follower_id <> author_id)
);

create table if not exists public.reading_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject_type text not null check (subject_type in ('poem', 'collection')),
  subject_id text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.weekly_metrics (
  week_start date not null,
  subject_type text not null check (subject_type in ('poem', 'collection')),
  subject_id text not null,
  reads bigint not null default 0 check (reads >= 0),
  primary key (week_start, subject_type, subject_id)
);

create index if not exists works_published_at_idx on public.works (published_at desc);
create index if not exists works_owner_id_idx on public.works (owner_id);
create index if not exists works_collection_id_idx on public.works (collection_id, position);
create index if not exists collections_owner_id_idx on public.collections (owner_id);
create index if not exists reading_events_dedup_idx on public.reading_events (user_id, subject_type, subject_id, created_at desc);
create index if not exists author_follows_author_id_idx on public.author_follows (author_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists collections_set_updated_at on public.collections;
create trigger collections_set_updated_at before update on public.collections for each row execute function public.set_updated_at();
drop trigger if exists works_set_updated_at on public.works;
create trigger works_set_updated_at before update on public.works for each row execute function public.set_updated_at();

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
  desired_handle text;
begin
  desired_handle := left(public.slugify(coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))), 68) || '-' || substr(new.id::text, 1, 8);
  insert into public.profiles (id, display_name, handle, role, status)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)),
    desired_handle,
    'author',
    'active'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists auth_user_profile on auth.users;
create trigger auth_user_profile after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

create or replace function public.enforce_owned_author_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is not null and not public.is_admin() then
    select display_name into new.author_name from public.profiles where id = new.owner_id;
  end if;
  return new;
end;
$$;

drop trigger if exists collections_enforce_author_name on public.collections;
create trigger collections_enforce_author_name before insert or update on public.collections for each row execute function public.enforce_owned_author_name();
drop trigger if exists works_enforce_author_name on public.works;
create trigger works_enforce_author_name before insert or update on public.works for each row execute function public.enforce_owned_author_name();

create or replace function public.protect_profile_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Nel browser auth.uid() e` sempre l'utente autenticato: qui si bloccano
  -- le modifiche ai campi di privilegio. Nel SQL Editor auth.uid() e` NULL,
  -- cosi` il proprietario del progetto puo` inizializzare il primo admin.
  if auth.uid() is not null and not public.is_admin() then
    new.id := old.id;
    new.role := old.role;
    new.status := old.status;
    new.handle := old.handle;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_roles on public.profiles;
create trigger profiles_protect_roles before update on public.profiles for each row execute function public.protect_profile_roles();

create or replace function public.sync_profile_author_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.display_name is distinct from old.display_name then
    update public.collections set author_name = new.display_name where owner_id = new.id;
    update public.works set author_name = new.display_name where owner_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_sync_author_name on public.profiles;
create trigger profiles_sync_author_name after update of display_name on public.profiles for each row execute function public.sync_profile_author_name();

alter table public.profiles enable row level security;
alter table public.collections enable row level security;
alter table public.works enable row level security;
alter table public.library_items enable row level security;
alter table public.author_follows enable row level security;
alter table public.reading_events enable row level security;
alter table public.weekly_metrics enable row level security;

drop policy if exists "Active beta members can read profiles" on public.profiles;
create policy "Active beta members can read profiles" on public.profiles for select to authenticated using (status = 'active');
drop policy if exists "Members update only their profile" on public.profiles;
create policy "Members update only their profile" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists "Beta members read visible collections" on public.collections;
create policy "Beta members read visible collections" on public.collections for select to authenticated
  using (status = 'published' or owner_id = auth.uid() or public.is_admin());
drop policy if exists "Authors create own collections" on public.collections;
create policy "Authors create own collections" on public.collections for insert to authenticated
  with check (owner_id = auth.uid() or public.is_admin());
drop policy if exists "Authors update owned collections" on public.collections;
create policy "Authors update owned collections" on public.collections for update to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());
drop policy if exists "Authors delete owned collections" on public.collections;
create policy "Authors delete owned collections" on public.collections for delete to authenticated
  using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "Beta members read visible works" on public.works;
create policy "Beta members read visible works" on public.works for select to authenticated
  using (status = 'published' or owner_id = auth.uid() or public.is_admin());
drop policy if exists "Authors create own works" on public.works;
create policy "Authors create own works" on public.works for insert to authenticated
  with check (owner_id = auth.uid() or public.is_admin());
drop policy if exists "Authors update owned works" on public.works;
create policy "Authors update owned works" on public.works for update to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());
drop policy if exists "Authors delete owned works" on public.works;
create policy "Authors delete owned works" on public.works for delete to authenticated
  using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "Members manage their library" on public.library_items;
create policy "Members manage their library" on public.library_items for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Beta members read author follows" on public.author_follows;
create policy "Beta members read author follows" on public.author_follows for select to authenticated using (true);
drop policy if exists "Members follow authors" on public.author_follows;
create policy "Members follow authors" on public.author_follows for insert to authenticated
  with check (
    follower_id = auth.uid()
    and author_id <> auth.uid()
    and exists (select 1 from public.profiles where id = author_id and status = 'active')
  );
drop policy if exists "Members stop following authors" on public.author_follows;
create policy "Members stop following authors" on public.author_follows for delete to authenticated
  using (follower_id = auth.uid());

drop policy if exists "Members insert reading events" on public.reading_events;
create policy "Members insert reading events" on public.reading_events for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Beta members read weekly metrics" on public.weekly_metrics;
create policy "Beta members read weekly metrics" on public.weekly_metrics for select to authenticated using (true);

create or replace function public.record_reading(p_subject_type text, p_subject_id text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  current_week date := date_trunc('week', now())::date;
  result_reads bigint;
  subject_visible boolean := false;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_subject_type not in ('poem', 'collection') or coalesce(trim(p_subject_id), '') = '' then
    raise exception 'Invalid reading subject';
  end if;

  if p_subject_type = 'poem' then
    select exists(select 1 from public.works where id = p_subject_id and (status = 'published' or owner_id = auth.uid() or public.is_admin())) into subject_visible;
  else
    select exists(select 1 from public.collections where id = p_subject_id and (status = 'published' or owner_id = auth.uid() or public.is_admin())) into subject_visible;
  end if;
  if not subject_visible then raise exception 'Subject unavailable'; end if;

  if exists (
    select 1 from public.reading_events
    where user_id = auth.uid() and subject_type = p_subject_type and subject_id = p_subject_id and created_at > now() - interval '60 seconds'
  ) then
    select reads into result_reads from public.weekly_metrics where week_start = current_week and subject_type = p_subject_type and subject_id = p_subject_id;
    return coalesce(result_reads, 0);
  end if;

  insert into public.reading_events (user_id, subject_type, subject_id) values (auth.uid(), p_subject_type, p_subject_id);
  insert into public.weekly_metrics (week_start, subject_type, subject_id, reads)
  values (current_week, p_subject_type, p_subject_id, 1)
  on conflict (week_start, subject_type, subject_id)
  do update set reads = public.weekly_metrics.reads + 1
  returning reads into result_reads;
  return result_reads;
end;
$$;

revoke all on function public.record_reading(text, text) from public;
grant execute on function public.record_reading(text, text) to authenticated;

-- La Beta ricarica il catalogo quando un altro autore pubblica, modifica una
-- scheda o genera nuove letture. Il blocco e` idempotente: ogni tabella viene
-- aggiunta alla publication di Supabase una sola volta.
do $$
declare
  realtime_table text;
begin
  foreach realtime_table in array array['profiles', 'collections', 'works', 'weekly_metrics', 'author_follows']
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = realtime_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', realtime_table);
    end if;
  end loop;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('poetek-media', 'poetek-media', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Beta members read Poetek media" on storage.objects;
create policy "Beta members read Poetek media" on storage.objects for select to authenticated using (bucket_id = 'poetek-media');
drop policy if exists "Authors upload own Poetek media" on storage.objects;
create policy "Authors upload own Poetek media" on storage.objects for insert to authenticated
  with check (bucket_id = 'poetek-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Authors update own Poetek media" on storage.objects;
create policy "Authors update own Poetek media" on storage.objects for update to authenticated
  using (bucket_id = 'poetek-media' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'poetek-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Authors delete own Poetek media" on storage.objects;
create policy "Authors delete own Poetek media" on storage.objects for delete to authenticated
  using (bucket_id = 'poetek-media' and (storage.foldername(name))[1] = auth.uid()::text);
