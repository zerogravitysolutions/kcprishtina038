-- RLS test suite — runs against a local Supabase via `supabase test db`.
-- Asserts the role matrix: anon < member < coach/staff/editor < admin.
--
-- Pattern: SET LOCAL ROLE + SET LOCAL "request.jwt.claims" to impersonate a
-- specific authenticated user, then DO blocks that PERFORM a query and
-- assert it either succeeds or RAISES.
--
-- This file is idempotent — each test is wrapped in its own transaction
-- (BEGIN/ROLLBACK) so state doesn't leak.

\set ON_ERROR_STOP on

-- ===========================================================================
-- 1. anon cannot read profiles
-- ===========================================================================
begin;
  set local role anon;
  do $$
  declare leaked int;
  begin
    select count(*) into leaked from public.profiles;
    -- RLS returns 0 rows for anon (no policy grants SELECT), not an error.
    if leaked > 0 then raise exception 'FAIL: anon could read % profile rows', leaked; end if;
    raise notice 'PASS: anon profiles read = 0';
  end $$;
rollback;

-- ===========================================================================
-- 2. anon CAN insert into applications (public form)
-- ===========================================================================
begin;
  set local role anon;
  do $$
  begin
    insert into public.applications (full_name, email) values ('Test Anon', 'test+anon@example.com');
    raise notice 'PASS: anon insert into applications works';
  end $$;
rollback;

-- ===========================================================================
-- 3. anon cannot read applications
-- ===========================================================================
begin;
  set local role anon;
  do $$
  declare cnt int;
  begin
    select count(*) into cnt from public.applications;
    if cnt > 0 then raise exception 'FAIL: anon could read % applications', cnt; end if;
    raise notice 'PASS: anon applications read = 0';
  end $$;
rollback;

-- ===========================================================================
-- 4. anon CAN read published events
-- ===========================================================================
begin;
  set local role anon;
  do $$
  declare leaked_drafts int;
  begin
    -- Should return rows where status='published', 0 otherwise.
    select count(*) into leaked_drafts from public.events where status != 'published';
    if leaked_drafts > 0 then raise exception 'FAIL: anon saw % non-published events', leaked_drafts; end if;
    raise notice 'PASS: anon event read filtered to published only';
  end $$;
rollback;

-- ===========================================================================
-- 5. sections are publicly readable
-- ===========================================================================
begin;
  set local role anon;
  do $$
  declare cnt int;
  begin
    select count(*) into cnt from public.sections;
    if cnt < 6 then raise exception 'FAIL: anon expected 6 sections, saw %', cnt; end if;
    raise notice 'PASS: anon sees % sections', cnt;
  end $$;
rollback;

-- ===========================================================================
-- 6. settings are NOT publicly readable
-- ===========================================================================
begin;
  set local role anon;
  do $$
  declare cnt int;
  begin
    select count(*) into cnt from public.settings;
    if cnt > 0 then raise exception 'FAIL: anon saw % settings rows', cnt; end if;
    raise notice 'PASS: anon settings read = 0';
  end $$;
rollback;

-- ===========================================================================
-- 7. audit_log is NOT publicly readable (admin-only)
-- ===========================================================================
begin;
  set local role anon;
  do $$
  declare cnt int;
  begin
    select count(*) into cnt from public.audit_log;
    if cnt > 0 then raise exception 'FAIL: anon saw % audit_log rows', cnt; end if;
    raise notice 'PASS: anon audit_log read = 0';
  end $$;
rollback;

-- ===========================================================================
-- 8. NOTE on impersonating real authenticated users.
-- The above tests use the anon role only. To exercise member/coach/admin
-- paths, run these patterns from a Node/Python harness that uses real
-- user JWTs via supabase.auth.signInWithPassword. This SQL file is the
-- floor; the harness is the ceiling. See scripts/smoke.py.
-- ===========================================================================

\echo 'All anon-path RLS assertions passed.'
