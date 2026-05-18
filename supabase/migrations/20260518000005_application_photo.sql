-- Applicant profile photo, captured at /join time.
-- Used later (after approval) for generating the federation license number.

alter table public.applications
  add column if not exists photo_storage_path text;

-- Storage policy: allow anonymous applicants to upload a photo into the
-- media bucket, but only under the "applications/" prefix. Existing policies
-- on the bucket already restrict updates/deletes to editors.
drop policy if exists "media application photo insert" on storage.objects;
create policy "media application photo insert" on storage.objects
  for insert
  to anon, authenticated
  with check (
    bucket_id = 'media'
    and (name like 'applications/%')
  );
