-- Per-event sponsors. A sponsor row now optionally belongs to one event;
-- when event_id is null the sponsor is club-wide (homepage strip). When set,
-- it shows on /events/<slug> for that one event. Editors can still pin
-- existing global sponsors to events via the event_sponsors m2m introduced
-- in 0013, but the simplest path — "add a new sponsor from this event" —
-- now lives directly on this column.
alter table public.sponsors
  add column if not exists event_id uuid
    references public.events(id) on delete cascade;

create index if not exists sponsors_event_idx on public.sponsors(event_id);
