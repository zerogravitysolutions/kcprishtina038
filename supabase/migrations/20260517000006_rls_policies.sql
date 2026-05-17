-- 0006 — Row Level Security policies (the security boundary).
--
-- Enable RLS on every table, then add per-role policies. Anything without
-- a policy is denied by default once RLS is enabled.

-- ============================================================
-- Enable RLS everywhere
-- ============================================================
alter table public.sections             enable row level security;
alter table public.profiles             enable row level security;
alter table public.applications         enable row level security;
alter table public.events               enable row level security;
alter table public.event_categories     enable row level security;
alter table public.event_registrations  enable row level security;
alter table public.results              enable row level security;
alter table public.media                enable row level security;
alter table public.news                 enable row level security;
alter table public.sponsors             enable row level security;
alter table public.dues                 enable row level security;
alter table public.attendance           enable row level security;
alter table public.settings             enable row level security;
alter table public.audit_log            enable row level security;

-- ============================================================
-- SECTIONS — public read; admin/editor write.
-- ============================================================
create policy sections_select_all on public.sections
  for select using (true);
create policy sections_write_admin on public.sections
  for all to authenticated
  using       (public.has_role(array['admin','editor']::public.user_role[]))
  with check  (public.has_role(array['admin','editor']::public.user_role[]));

-- ============================================================
-- PROFILES — own + staff; member cannot self-promote.
-- ============================================================
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());

create policy profiles_select_staff on public.profiles
  for select to authenticated
  using (public.has_role(array['admin','editor','staff','coach']::public.user_role[]));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role   = (select role   from public.profiles where id = auth.uid())
    and status = (select status from public.profiles where id = auth.uid())
  );

create policy profiles_update_admin on public.profiles
  for update to authenticated
  using       (public.has_role(array['admin']::public.user_role[]))
  with check  (public.has_role(array['admin']::public.user_role[]));

create policy profiles_insert_admin on public.profiles
  for insert to authenticated
  with check (public.has_role(array['admin']::public.user_role[]));

create policy profiles_delete_admin on public.profiles
  for delete to authenticated
  using (public.has_role(array['admin']::public.user_role[]));

-- ============================================================
-- APPLICATIONS — PUBLIC INSERT (the join form); staff reads + reviews.
-- ============================================================
create policy applications_insert_public on public.applications
  for insert to anon, authenticated with check (true);

create policy applications_select_staff on public.applications
  for select to authenticated
  using (public.has_role(array['admin','editor','staff']::public.user_role[]));

create policy applications_update_staff on public.applications
  for update to authenticated
  using       (public.has_role(array['admin','staff']::public.user_role[]))
  with check  (public.has_role(array['admin','staff']::public.user_role[]));

create policy applications_delete_admin on public.applications
  for delete to authenticated
  using (public.has_role(array['admin']::public.user_role[]));

-- ============================================================
-- EVENTS — published readable by everyone; staff sees drafts too.
-- ============================================================
create policy events_select_published on public.events
  for select using (status = 'published');

create policy events_select_staff on public.events
  for select to authenticated
  using (public.has_role(array['admin','editor','staff','coach']::public.user_role[]));

create policy events_write_editor on public.events
  for all to authenticated
  using (
    public.has_role(array['admin','editor']::public.user_role[])
    or public.is_coach_of(section_id)
  )
  with check (
    public.has_role(array['admin','editor']::public.user_role[])
    or public.is_coach_of(section_id)
  );

-- ============================================================
-- EVENT CATEGORIES — public read; editor/coach write (through parent event).
-- ============================================================
create policy event_categories_select_all on public.event_categories
  for select using (true);

create policy event_categories_write_editor on public.event_categories
  for all to authenticated
  using (
    exists (
      select 1 from public.events e where e.id = event_id
      and (public.has_role(array['admin','editor']::public.user_role[])
           or public.is_coach_of(e.section_id))
    )
  )
  with check (
    exists (
      select 1 from public.events e where e.id = event_id
      and (public.has_role(array['admin','editor']::public.user_role[])
           or public.is_coach_of(e.section_id))
    )
  );

-- ============================================================
-- EVENT REGISTRATIONS — own RSVP; staff/coach manage.
-- ============================================================
create policy registrations_select_own on public.event_registrations
  for select to authenticated using (member_id = auth.uid());

create policy registrations_select_staff on public.event_registrations
  for select to authenticated
  using (public.has_role(array['admin','editor','staff','coach']::public.user_role[]));

create policy registrations_insert_self on public.event_registrations
  for insert to authenticated with check (member_id = auth.uid());

create policy registrations_update_self on public.event_registrations
  for update to authenticated using (member_id = auth.uid());

create policy registrations_delete_self on public.event_registrations
  for delete to authenticated using (member_id = auth.uid());

create policy registrations_write_staff on public.event_registrations
  for all to authenticated
  using       (public.has_role(array['admin','staff','coach']::public.user_role[]))
  with check  (public.has_role(array['admin','staff','coach']::public.user_role[]));

-- ============================================================
-- RESULTS — public read; editor/coach write (coach scoped to own section).
-- ============================================================
create policy results_select_all on public.results
  for select using (true);

create policy results_write_editor on public.results
  for all to authenticated
  using (
    public.has_role(array['admin','editor']::public.user_role[])
    or exists (select 1 from public.events e where e.id = event_id and public.is_coach_of(e.section_id))
  )
  with check (
    public.has_role(array['admin','editor']::public.user_role[])
    or exists (select 1 from public.events e where e.id = event_id and public.is_coach_of(e.section_id))
  );

-- ============================================================
-- MEDIA — public read; editor+ write.
-- ============================================================
create policy media_select_all on public.media for select using (true);

create policy media_write_editor on public.media
  for all to authenticated
  using       (public.has_role(array['admin','editor']::public.user_role[]))
  with check  (public.has_role(array['admin','editor']::public.user_role[]));

-- ============================================================
-- NEWS — public sees published; editor sees + writes drafts.
-- ============================================================
create policy news_select_published on public.news
  for select using (status = 'published');

create policy news_select_editor on public.news
  for select to authenticated
  using (public.has_role(array['admin','editor']::public.user_role[]));

create policy news_write_editor on public.news
  for all to authenticated
  using       (public.has_role(array['admin','editor']::public.user_role[]))
  with check  (public.has_role(array['admin','editor']::public.user_role[]));

-- ============================================================
-- SPONSORS — public sees active; editor+ writes.
-- ============================================================
create policy sponsors_select_active on public.sponsors
  for select using (active = true);

create policy sponsors_select_editor on public.sponsors
  for select to authenticated
  using (public.has_role(array['admin','editor']::public.user_role[]));

create policy sponsors_write_editor on public.sponsors
  for all to authenticated
  using       (public.has_role(array['admin','editor']::public.user_role[]))
  with check  (public.has_role(array['admin','editor']::public.user_role[]));

-- ============================================================
-- DUES — own read; staff/admin manage.
-- ============================================================
create policy dues_select_own on public.dues
  for select to authenticated using (member_id = auth.uid());

create policy dues_select_staff on public.dues
  for select to authenticated
  using (public.has_role(array['admin','staff']::public.user_role[]));

create policy dues_write_staff on public.dues
  for all to authenticated
  using       (public.has_role(array['admin','staff']::public.user_role[]))
  with check  (public.has_role(array['admin','staff']::public.user_role[]));

-- ============================================================
-- ATTENDANCE — own read; staff/coach in scope write.
-- ============================================================
create policy attendance_select_own on public.attendance
  for select to authenticated using (member_id = auth.uid());

create policy attendance_select_staff on public.attendance
  for select to authenticated
  using (public.has_role(array['admin','staff','coach']::public.user_role[]));

create policy attendance_write_coach on public.attendance
  for all to authenticated
  using (
    public.has_role(array['admin','staff']::public.user_role[])
    or public.is_coach_of(section_id)
  )
  with check (
    public.has_role(array['admin','staff']::public.user_role[])
    or public.is_coach_of(section_id)
  );

-- ============================================================
-- SETTINGS — admin only.
-- ============================================================
create policy settings_admin_all on public.settings
  for all to authenticated
  using       (public.has_role(array['admin']::public.user_role[]))
  with check  (public.has_role(array['admin']::public.user_role[]));

-- ============================================================
-- AUDIT_LOG — admin read; system writes via SECURITY DEFINER RPCs only.
-- ============================================================
create policy audit_log_admin_read on public.audit_log
  for select to authenticated
  using (public.has_role(array['admin']::public.user_role[]));
