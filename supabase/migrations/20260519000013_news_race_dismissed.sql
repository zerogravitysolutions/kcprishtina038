-- Support the admin "race suggestions" queue: a flag to remember posts an
-- editor has DECLINED (not a race), so they stop being suggested.
alter table public.news
  add column if not exists race_dismissed boolean not null default false;

create index if not exists news_race_suggest_idx
  on public.news (race_dismissed, race_event_id)
  where source = 'facebook';
