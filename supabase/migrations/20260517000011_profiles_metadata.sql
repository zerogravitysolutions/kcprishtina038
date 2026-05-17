-- 0011 — Add `profiles.metadata jsonb` for unmodeled fields the design exposes
-- but the v1 schema didn't include: address, city, postal, ID/passport,
-- equipment specs (bike, shoe size, height, weight), social handles, gender,
-- nationality, emergency contact, medical info, etc.
--
-- We keep these as a JSONB blob rather than 20+ new columns so:
-- 1. Schema doesn't bloat every time the design adds another optional field.
-- 2. Clients can read/write keys without per-field migrations.
-- 3. Existing strongly-typed columns (full_name, email, phone, dob, bio,
--    emergency_contact_name, emergency_contact_phone) stay as columns.

alter table public.profiles
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Members updating their own row can also write metadata (the existing
-- profiles_update_own policy already allows the row update; CHECK clause
-- only restricts role + status).

comment on column public.profiles.metadata is
  'Free-form per-user data not modelled as columns: address, city, postal_code, id_number, equipment, social handles, gender, nationality, medical notes. Schema-on-read.';
