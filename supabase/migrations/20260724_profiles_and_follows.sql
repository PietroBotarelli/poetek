-- Profilo autore: nome modificabile e relazioni di follow, applicabile a una
-- Beta Poetek già inizializzata.

create table if not exists public.author_follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, author_id),
  check (follower_id <> author_id)
);

create index if not exists author_follows_author_id_idx on public.author_follows (author_id);

create or replace function public.protect_profile_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.id := old.id;
    new.role := old.role;
    new.status := old.status;
    new.handle := old.handle;
  end if;
  return new;
end;
$$;

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
create trigger profiles_sync_author_name after update of display_name on public.profiles
for each row execute function public.sync_profile_author_name();

alter table public.author_follows enable row level security;

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

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'author_follows'
  ) then
    alter publication supabase_realtime add table public.author_follows;
  end if;
end;
$$;
