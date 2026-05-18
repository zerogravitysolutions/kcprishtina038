-- Anonymous (no-login) event signups. The existing event_registrations
-- table requires a profiles row; this one accepts a name + email from any
-- visitor on the public /events/<slug> page. Admins fill in results once
-- the race runs.
create table public.event_signups (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  full_name     text not null,
  email         text not null,
  phone         text,
  dob           date,
  category      text,
  club          text,
  notes         text,
  status        text not null default 'pending'
                check (status in ('pending','confirmed','waitlisted','cancelled')),
  bib_number    int,
  result_place  int,
  result_time   text,
  result_notes  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index event_signups_event_idx on public.event_signups(event_id);
create unique index event_signups_event_email_uq on public.event_signups(event_id, lower(email));

create trigger event_signups_updated_at before update on public.event_signups
  for each row execute function public.set_updated_at();

alter table public.event_signups enable row level security;

-- Public visitors may insert their own signup (no select).
create policy event_signups_insert_public on public.event_signups
  for insert to anon, authenticated with check (true);

-- Staff (admin/editor) can read + manage every signup.
create policy event_signups_select_staff on public.event_signups
  for select to authenticated
  using (public.has_role(array['admin','editor']::public.user_role[]));

create policy event_signups_update_staff on public.event_signups
  for update to authenticated
  using       (public.has_role(array['admin','editor']::public.user_role[]))
  with check  (public.has_role(array['admin','editor']::public.user_role[]));

create policy event_signups_delete_staff on public.event_signups
  for delete to authenticated
  using (public.has_role(array['admin']::public.user_role[]));
