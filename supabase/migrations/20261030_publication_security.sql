-- Apply after all earlier migrations. Keeps public profile data separate from
-- private reading preferences. Does not delete users, works or uploaded files.
begin;

create schema if not exists extensions;
-- Earlier migrations moved unaccent here and then lost its search_path.
create or replace function public.slugify(value text)
returns text language sql immutable set search_path = ''
as $$ select trim(both '-' from regexp_replace(lower(extensions.unaccent(coalesce(value, 'autore'))), '[^a-z0-9]+', '-', 'g')); $$;

create table if not exists public.profile_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_author text check (last_author is null or char_length(last_author) <= 80)
);
alter table public.profile_preferences enable row level security;
-- Preserve preferences privately. Keep the legacy public column NULL so the
-- previous frontend can keep selecting it during a rolling deployment.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'last_author') then
    execute 'insert into public.profile_preferences(user_id, last_author) select id, left(last_author, 80) from public.profiles where last_author is not null on conflict(user_id) do nothing';
    update public.profiles set last_author = null where last_author is not null;
  end if;
end $$;

-- Do not expose identifiers/counts of a private draft through public metrics.
drop policy if exists "Metrics follow subject visibility" on public.weekly_metrics;
create policy "Metrics follow subject visibility" on public.weekly_metrics as restrictive for select to anon, authenticated
using (
 (subject_type = 'poem' and exists(select 1 from public.works w where w.id = subject_id))
 or (subject_type = 'collection' and exists(select 1 from public.collections c where c.id = subject_id))
);
create or replace function public.redirect_legacy_reading_preference()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.last_author is not null then
    insert into public.profile_preferences(user_id,last_author) values(new.id,left(new.last_author,80))
      on conflict(user_id) do update set last_author = excluded.last_author;
  end if;
  new.last_author := null;
  return new;
end $$;
revoke all on function public.redirect_legacy_reading_preference() from public, anon, authenticated;
drop trigger if exists profiles_private_reading_preference on public.profiles;
create trigger profiles_private_reading_preference before insert or update on public.profiles
for each row execute function public.redirect_legacy_reading_preference();
revoke all on public.profile_preferences from public, anon, authenticated;
grant select, insert, update, delete on public.profile_preferences to authenticated;

create or replace function public.is_active_member()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles where id = auth.uid() and status = 'active'); $$;
revoke all on function public.is_active_member() from public;
grant execute on function public.is_active_member() to anon, authenticated;

drop policy if exists "Own private preferences" on public.profile_preferences;
create policy "Own private preferences" on public.profile_preferences for all to authenticated
  using (user_id = auth.uid() and public.is_active_member())
  with check (user_id = auth.uid() and public.is_active_member());

-- Restrictive policies compose with existing ownership policies (AND), so a
-- still-valid JWT belonging to a suspended account cannot keep writing.
do $$ declare t text; cmd text; begin
  foreach t in array array['profiles','collections','works','library_items','author_follows','reading_events','weekly_metrics'] loop
    foreach cmd in array array['insert','update','delete'] loop
      execute format('drop policy if exists %I on public.%I', 'Active account ' || cmd, t);
      if cmd = 'insert' then
        execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (public.is_active_member())', 'Active account ' || cmd, t);
      elsif cmd = 'update' then
        execute format('create policy %I on public.%I as restrictive for update to authenticated using (public.is_active_member()) with check (public.is_active_member())', 'Active account ' || cmd, t);
      else
        execute format('create policy %I on public.%I as restrictive for delete to authenticated using (public.is_active_member())', 'Active account ' || cmd, t);
      end if;
    end loop;
  end loop;
end $$;

-- Collection membership is an authorization boundary, not merely a FK.
create or replace function public.enforce_collection_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.collection_id is not null and not public.is_admin()
     and not exists (select 1 from public.collections c where c.id = new.collection_id and c.owner_id = new.owner_id) then
    raise exception 'Collection must belong to the work owner' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.enforce_collection_membership() from public, anon, authenticated;
drop trigger if exists works_check_collection on public.works;
create trigger works_check_collection before insert or update on public.works
for each row execute function public.enforce_collection_membership();
-- Prevent changing a collection owner while its works would be left attached
-- to a different account. Administrative transfers must move works explicitly.
create or replace function public.protect_collection_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.owner_id is distinct from old.owner_id and exists
    (select 1 from public.works w where w.collection_id = old.id and w.owner_id is distinct from new.owner_id) then
    raise exception 'Move the collection works before transferring ownership' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.protect_collection_owner() from public, anon, authenticated;
drop trigger if exists collections_check_owner on public.collections;
create trigger collections_check_owner before update of owner_id on public.collections
for each row execute function public.protect_collection_owner();

-- NOT VALID leaves legacy rows readable; it still checks new/updated rows.
-- Inspect legacy IDs using the preflight queries before VALIDATE CONSTRAINT.
alter table public.works drop constraint if exists works_safe_id;
alter table public.works add constraint works_safe_id check (id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,119}$') not valid;
alter table public.collections drop constraint if exists collections_safe_id;
alter table public.collections add constraint collections_safe_id check (id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,119}$') not valid;

-- Users cannot publish a reference to someone else's unpublished upload.
create or replace function public.valid_media_reference(reference text, owner uuid)
returns boolean language sql immutable set search_path = '' as $$
 select reference is null or reference = '' or
   (owner is not null and starts_with(reference, 'storage://poetek-media/' || owner::text || '/'));
$$;
revoke all on function public.valid_media_reference(text, uuid) from public, anon, authenticated;
create or replace function public.enforce_media_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.is_admin() or auth.uid() is null then return new; end if;
  if tg_table_name = 'profiles' then
    if starts_with(coalesce(new.avatar_url, ''), 'storage://') and not public.valid_media_reference(new.avatar_url, new.id) then
      raise exception 'Media must belong to the profile owner' using errcode = '42501';
    end if;
  else
    if not public.valid_media_reference(new.card ->> 'imageId', new.owner_id) then
      raise exception 'Media must belong to the content owner' using errcode = '42501';
    end if;
    if tg_table_name = 'works' then
      if not public.valid_media_reference(new.reading ->> 'imageId', new.owner_id) then
        raise exception 'Media must belong to the content owner' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.enforce_media_owner() from public, anon, authenticated;
drop trigger if exists profiles_check_media on public.profiles;
create trigger profiles_check_media before insert or update on public.profiles for each row execute function public.enforce_media_owner();
drop trigger if exists works_check_media on public.works;
create trigger works_check_media before insert or update on public.works for each row execute function public.enforce_media_owner();
drop trigger if exists collections_check_media on public.collections;
create trigger collections_check_media before insert or update on public.collections for each row execute function public.enforce_media_owner();

create or replace function public.can_read_poetek_media(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
 select
   (public.is_active_member() and (split_part(object_name, '/', 1) = auth.uid()::text or public.is_admin()))
   or exists (select 1 from public.profiles p where p.status = 'active' and p.avatar_url = 'storage://poetek-media/' || object_name)
   or exists (select 1 from public.collections c where c.status = 'published' and c.card ->> 'imageId' = 'storage://poetek-media/' || object_name)
   or exists (select 1 from public.works w where w.status = 'published' and
     (w.card ->> 'imageId' = 'storage://poetek-media/' || object_name or w.reading ->> 'imageId' = 'storage://poetek-media/' || object_name));
$$;
revoke all on function public.can_read_poetek_media(text) from public;
grant execute on function public.can_read_poetek_media(text) to anon, authenticated;
drop policy if exists "Beta members read Poetek media" on storage.objects;
drop policy if exists "Public beta readers read Poetek media" on storage.objects;
drop policy if exists "Visible Poetek media" on storage.objects;
create policy "Visible Poetek media" on storage.objects for select to anon, authenticated
using (bucket_id = 'poetek-media' and public.can_read_poetek_media(name));
drop policy if exists "Active Poetek media writers" on storage.objects;
create policy "Active Poetek media writers" on storage.objects as restrictive for all to authenticated
using (bucket_id <> 'poetek-media' or public.is_active_member())
with check (bucket_id <> 'poetek-media' or public.is_active_member());

create or replace function public.record_reading(p_subject_type text, p_subject_id text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare current_week date := date_trunc('week', now())::date;
 result_reads bigint; subject_visible boolean := false;
begin
 if not public.is_active_member() then raise exception 'Active account required' using errcode = '42501'; end if;
 if p_subject_type is null or p_subject_type not in ('poem', 'collection') or coalesce(trim(p_subject_id), '') = '' then
   raise exception 'Invalid reading subject';
 end if;
 -- Serialize the deduplication check for this user/subject until commit.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_subject_type || ':' || p_subject_id, 0));
 if p_subject_type = 'poem' then
   select exists(select 1 from public.works where id = p_subject_id and (status = 'published' or owner_id = auth.uid() or public.is_admin())) into subject_visible;
 else
   select exists(select 1 from public.collections where id = p_subject_id and (status = 'published' or owner_id = auth.uid() or public.is_admin())) into subject_visible;
 end if;
 if not subject_visible then raise exception 'Subject unavailable'; end if;
 if exists (select 1 from public.reading_events where user_id = auth.uid() and subject_type = p_subject_type and subject_id = p_subject_id and created_at > now() - interval '60 seconds') then
   select reads into result_reads from public.weekly_metrics where week_start = current_week and subject_type = p_subject_type and subject_id = p_subject_id;
   return coalesce(result_reads, 0);
 end if;
 insert into public.reading_events(user_id, subject_type, subject_id) values(auth.uid(), p_subject_type, p_subject_id);
 insert into public.weekly_metrics(week_start, subject_type, subject_id, reads) values(current_week, p_subject_type, p_subject_id, 1)
 on conflict(week_start, subject_type, subject_id) do update set reads = public.weekly_metrics.reads + 1 returning reads into result_reads;
 return result_reads;
end $$;
revoke all on function public.record_reading(text,text) from public, anon;
grant execute on function public.record_reading(text,text) to authenticated;
commit;
