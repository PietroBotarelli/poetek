-- Poetek Beta: accesso pubblico in sola lettura.
-- Le operazioni personali e di pubblicazione restano vincolate a auth.uid().

drop policy if exists "Active beta members can read profiles" on public.profiles;
create policy "Public beta readers can read active profiles" on public.profiles
for select to anon, authenticated using (status = 'active');

drop policy if exists "Beta members read visible collections" on public.collections;
create policy "Public beta readers can read published collections" on public.collections
for select to anon, authenticated
using (status = 'published' or owner_id = auth.uid() or public.is_admin());

drop policy if exists "Beta members read visible works" on public.works;
create policy "Public beta readers can read published works" on public.works
for select to anon, authenticated
using (status = 'published' or owner_id = auth.uid() or public.is_admin());

drop policy if exists "Beta members read weekly metrics" on public.weekly_metrics;
create policy "Public beta readers can read weekly metrics" on public.weekly_metrics
for select to anon, authenticated using (true);

drop policy if exists "Beta members read Poetek media" on storage.objects;
create policy "Public beta readers read Poetek media" on storage.objects
for select to anon, authenticated using (bucket_id = 'poetek-media');
