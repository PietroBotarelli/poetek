-- Keep privileged policy helpers outside the exposed Data API schema.
begin;
create schema if not exists poetek_private;
revoke all on schema poetek_private from public;
grant usage on schema poetek_private to anon, authenticated;
do $$ declare signature text; begin
  foreach signature in array array['is_admin()','is_active_member()','can_read_poetek_media(text)','record_reading(text,text)'] loop
    if exists(select 1 from pg_proc where oid = to_regprocedure('public.' || signature) and prosecdef) then
      execute 'alter function public.' || signature || ' set schema poetek_private';
    end if;
  end loop;
end $$;
-- Existing policy dependencies follow the function OID into the private
-- schema; these invoker wrappers preserve old client and SQL body references.
create or replace function public.is_admin() returns boolean language sql stable security invoker set search_path = ''
as $$ select poetek_private.is_admin(); $$;
create or replace function public.is_active_member() returns boolean language sql stable security invoker set search_path = ''
as $$ select poetek_private.is_active_member(); $$;
create or replace function public.can_read_poetek_media(object_name text) returns boolean language sql stable security invoker set search_path = ''
as $$ select poetek_private.can_read_poetek_media(object_name); $$;
create or replace function public.record_reading(p_subject_type text,p_subject_id text) returns bigint language sql volatile security invoker set search_path = ''
as $$ select poetek_private.record_reading(p_subject_type,p_subject_id); $$;
revoke all on function public.is_admin(),public.is_active_member(),public.can_read_poetek_media(text),public.record_reading(text,text) from public;
grant execute on function public.is_admin(),public.is_active_member(),public.can_read_poetek_media(text) to anon,authenticated;
grant execute on function public.record_reading(text,text) to authenticated;
revoke all on function public.record_reading(text,text) from anon;

-- Preflight found zero nonconforming IDs in production.
alter table public.works validate constraint works_safe_id;
alter table public.collections validate constraint collections_safe_id;
commit;
