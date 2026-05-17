-- 0009 — Storage bucket policies.
-- Buckets themselves are created in the Supabase Dashboard (Storage → New bucket).
-- These policies attach RLS rules to storage.objects for the named buckets.
-- Run this AFTER creating the buckets:
--   media    (public)
--   avatars  (public)
--   documents (private)

-- ============================================================
-- media bucket — public read; editor+ write.
-- ============================================================
drop policy if exists "media public read"   on storage.objects;
drop policy if exists "media editor write"  on storage.objects;
drop policy if exists "media editor update" on storage.objects;
drop policy if exists "media editor delete" on storage.objects;

create policy "media public read" on storage.objects
  for select using (bucket_id = 'media');

create policy "media editor write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and public.has_role(array['admin','editor']::public.user_role[])
  );

create policy "media editor update" on storage.objects
  for update to authenticated
  using       (bucket_id = 'media' and public.has_role(array['admin','editor']::public.user_role[]))
  with check  (bucket_id = 'media' and public.has_role(array['admin','editor']::public.user_role[]));

create policy "media editor delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and public.has_role(array['admin','editor']::public.user_role[]));

-- ============================================================
-- avatars bucket — public read; users write their own avatar.
-- Convention: file path = "<auth.uid()>/avatar.<ext>"
-- ============================================================
drop policy if exists "avatars public read"  on storage.objects;
drop policy if exists "avatars self write"   on storage.objects;
drop policy if exists "avatars self update"  on storage.objects;
drop policy if exists "avatars self delete"  on storage.objects;

create policy "avatars public read" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "avatars self write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars self update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars self delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- documents bucket — private; owner + admin read; owner write.
-- Convention: file path = "<auth.uid()>/<filename>"
-- ============================================================
drop policy if exists "documents owner read"  on storage.objects;
drop policy if exists "documents admin read"  on storage.objects;
drop policy if exists "documents owner write" on storage.objects;
drop policy if exists "documents owner delete" on storage.objects;

create policy "documents owner read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "documents admin read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and public.has_role(array['admin','staff']::public.user_role[])
  );

create policy "documents owner write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "documents owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
