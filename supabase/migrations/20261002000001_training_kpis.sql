-- 20261002000001 — Training KPIs: one team-wide weekly target.
--
-- The club sets ONE target for the whole team (training hours per week, climbing
-- metres per week) and every cyclist is measured against it individually. The
-- ACTUALS are never entered: hours = sum(ride_entries.moving_seconds), climbing =
-- sum(ride_entries.elevation_m) and 20-minute power = max(best_power_20m_w), all
-- taken from the trainings the coach already registers. 20-minute power needs no
-- typed target either: by default it is measured against the cyclist's own best
-- of the previous month. A coach MAY set a watt target for a rider for a given
-- month (athlete_ftp_targets, below); no row means "automatic".
--
-- A row means "from this date on". A new row never rewrites an old one, so a
-- chart of an old week keeps the target that applied then.
--
-- Coaches manage it; every logged-in user may READ it (it is not sensitive, and
-- each cyclist needs it to see their own charts). Additive and re-runnable.

create table if not exists public.team_kpi_targets (
  id                  uuid primary key default gen_random_uuid(),
  effective_from      date not null unique,
  weekly_hours        numeric(5,2) check (weekly_hours is null or (weekly_hours >= 0 and weekly_hours <= 100)),
  weekly_elevation_m  integer      check (weekly_elevation_m is null or (weekly_elevation_m >= 0 and weekly_elevation_m <= 20000)),
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'team_kpi_targets_updated_at' and tgrelid = 'public.team_kpi_targets'::regclass
  ) then
    create trigger team_kpi_targets_updated_at before update on public.team_kpi_targets
      for each row execute function public.set_updated_at();
  end if;
end
$$;

alter table public.team_kpi_targets enable row level security;

drop policy if exists team_kpi_targets_staff_all on public.team_kpi_targets;
create policy team_kpi_targets_staff_all on public.team_kpi_targets
  for all to authenticated
  using      (public.has_role(array['admin','editor','staff','coach']::public.user_role[]))
  with check (public.has_role(array['admin','editor','staff','coach']::public.user_role[]));

drop policy if exists team_kpi_targets_read on public.team_kpi_targets;
create policy team_kpi_targets_read on public.team_kpi_targets
  for select to authenticated
  using (true);

-- Optional 20-minute power target (W) per rider per month, set by a coach from
-- the KPI page's "Targetet FTP" dialog. period = first of the month. A month with
-- no row is measured against the rider's own best of the previous month, so the
-- table only ever holds what a coach actually typed. Staff manage it; a cyclist
-- reads only their own rows.
create table if not exists public.athlete_ftp_targets (
  id          uuid primary key default gen_random_uuid(),
  athlete_id  uuid not null references public.team_members(id) on delete cascade,
  period      date not null check (period = date_trunc('month', period)::date),
  target_w    integer not null check (target_w > 0 and target_w <= 700),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (athlete_id, period)
);
create index if not exists athlete_ftp_targets_period_idx on public.athlete_ftp_targets(period desc);

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'athlete_ftp_targets_updated_at' and tgrelid = 'public.athlete_ftp_targets'::regclass
  ) then
    create trigger athlete_ftp_targets_updated_at before update on public.athlete_ftp_targets
      for each row execute function public.set_updated_at();
  end if;
end
$$;

alter table public.athlete_ftp_targets enable row level security;

drop policy if exists athlete_ftp_targets_staff_all on public.athlete_ftp_targets;
create policy athlete_ftp_targets_staff_all on public.athlete_ftp_targets
  for all to authenticated
  using      (public.has_role(array['admin','editor','staff','coach']::public.user_role[]))
  with check (public.has_role(array['admin','editor','staff','coach']::public.user_role[]));

drop policy if exists athlete_ftp_targets_select_own on public.athlete_ftp_targets;
create policy athlete_ftp_targets_select_own on public.athlete_ftp_targets
  for select to authenticated
  using (athlete_id = any(public.my_athlete_ids()));
