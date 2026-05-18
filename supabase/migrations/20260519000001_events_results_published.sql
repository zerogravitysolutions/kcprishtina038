-- Explicit "results are ready to be public" flag. We don't auto-publish off
-- of result_place being populated because timing rows often arrive in
-- partial waves (manual data entry, photo-finish reviews). The editor
-- flips this on /admin/events/<id>/results when the startlist is final.
alter table public.events
  add column if not exists results_published boolean not null default false,
  add column if not exists results_published_at timestamptz;

create index if not exists events_results_pub_idx
  on public.events(results_published)
  where results_published = true;
