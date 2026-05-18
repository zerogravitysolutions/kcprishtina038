-- Strava integration + per-event sponsor list.

-- Strava route/activity link. We store the full URL and parse the route id
-- client-side to build an iframe embed src.
alter table public.events
  add column if not exists strava_url text;

-- Many-to-many: each event can pin one or more sponsors (separate from the
-- club-wide sponsor list rendered on the homepage). The display_order lets
-- editors arrange them on the event detail page.
create table if not exists public.event_sponsors (
  event_id      uuid not null references public.events(id) on delete cascade,
  sponsor_id    uuid not null references public.sponsors(id) on delete cascade,
  display_order int  not null default 100,
  created_at    timestamptz not null default now(),
  primary key (event_id, sponsor_id)
);
create index if not exists event_sponsors_event_idx on public.event_sponsors(event_id);
create index if not exists event_sponsors_sponsor_idx on public.event_sponsors(sponsor_id);

alter table public.event_sponsors enable row level security;

create policy event_sponsors_select_all on public.event_sponsors
  for select using (true);

create policy event_sponsors_write_staff on public.event_sponsors
  for all to authenticated
  using       (public.has_role(array['admin','editor']::public.user_role[]))
  with check  (public.has_role(array['admin','editor']::public.user_role[]));
