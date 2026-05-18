-- Store date of birth on applications so the /join form can ask for DOB
-- directly instead of computed age. `age` stays as a derived column for the
-- federation paperwork that still expects a number.
alter table public.applications
  add column if not exists dob date;
