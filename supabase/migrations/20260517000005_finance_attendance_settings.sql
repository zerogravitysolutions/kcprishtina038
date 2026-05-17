-- 0005 — Dues + Attendance + Settings + Audit log.

-- ============================================================
-- Dues (monthly membership fees).
-- period is a first-of-month date (e.g. 2026-05-01).
-- ============================================================
create table public.dues (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references public.profiles(id) on delete cascade,
  period         date not null,
  amount_eur     numeric(8,2) not null,
  status         public.dues_status not null default 'unpaid',
  paid_at        timestamptz,
  paid_method    text check (paid_method in ('cash','bank','online','waived')),
  recorded_by    uuid references public.profiles(id) on delete set null,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (member_id, period)
);
create index dues_member_idx on public.dues(member_id);
create index dues_status_idx on public.dues(status);
create index dues_period_idx on public.dues(period desc);
create trigger dues_updated_at before update on public.dues
  for each row execute function public.set_updated_at();

-- ============================================================
-- Attendance (training session marks, recorded by coach).
-- ============================================================
create table public.attendance (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references public.profiles(id) on delete cascade,
  session_date   date not null,
  section_id     uuid references public.sections(id) on delete set null,
  status         public.attendance_status not null default 'present',
  notes          text,
  recorded_by    uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (member_id, session_date)
);
create index attendance_section_date_idx on public.attendance(section_id, session_date);
create index attendance_member_idx       on public.attendance(member_id);

-- ============================================================
-- Settings (single-row key-value, club-wide config).
-- ============================================================
create table public.settings (
  key            text primary key,
  value          jsonb not null,
  updated_by     uuid references public.profiles(id) on delete set null,
  updated_at     timestamptz not null default now()
);

-- ============================================================
-- Audit log (admin-only read; populated by SECURITY DEFINER RPCs).
-- No client-visible insert/update/delete policies.
-- ============================================================
create table public.audit_log (
  id             bigint generated always as identity primary key,
  actor_id       uuid references public.profiles(id) on delete set null,
  action         text not null,
  entity_type    text not null,
  entity_id      text,
  before         jsonb,
  after          jsonb,
  created_at     timestamptz not null default now()
);
create index audit_log_actor_idx  on public.audit_log(actor_id);
create index audit_log_entity_idx on public.audit_log(entity_type, entity_id);
create index audit_log_action_idx on public.audit_log(action);
create index audit_log_created_idx on public.audit_log(created_at desc);
