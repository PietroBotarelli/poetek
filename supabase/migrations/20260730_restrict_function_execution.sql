-- Riduce la superficie RPC alle sole funzioni chiamate intenzionalmente
-- dall'applicazione o dalle policy. Le funzioni trigger non richiedono il
-- privilegio EXECUTE dei ruoli client.

begin;

alter function public.slugify(text)
  set search_path = public;

revoke execute on function public.enforce_owned_author_name()
  from public, anon, authenticated;
revoke execute on function public.handle_new_user()
  from public, anon, authenticated;
revoke execute on function public.protect_profile_roles()
  from public, anon, authenticated;
revoke execute on function public.sync_profile_author_name()
  from public, anon, authenticated;

revoke execute on function public.is_admin()
  from public, anon;
grant execute on function public.is_admin()
  to authenticated;

revoke execute on function public.record_reading(text, text)
  from public, anon;
grant execute on function public.record_reading(text, text)
  to authenticated;

commit;
