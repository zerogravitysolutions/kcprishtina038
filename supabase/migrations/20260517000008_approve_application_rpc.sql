-- 0008 — SECURITY DEFINER RPCs for sensitive, multi-step operations.
--
-- These run with elevated privileges, bypassing RLS, so each one MUST
-- assert role authority via public.has_role() before mutating.

-- ============================================================
-- approve_application: mark an application approved + write audit row.
-- The actual auth.users + profile creation happens out-of-band (admin
-- invites the applicant by email; Supabase password-reset / magic-link
-- flow handles the user-side signup). The on_auth_user_created trigger
-- (migration 0002) then auto-creates the profile.
-- ============================================================
create or replace function public.approve_application(app_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  app public.applications;
begin
  if not public.has_role(array['admin','staff']::public.user_role[]) then
    raise exception 'not authorised: requires admin or staff role';
  end if;

  select * into app from public.applications where id = app_id;
  if not found then
    raise exception 'application not found: %', app_id;
  end if;
  if app.status <> 'pending' then
    raise exception 'application already %', app.status;
  end if;

  update public.applications
    set status      = 'approved',
        reviewed_by = auth.uid(),
        reviewed_at = now()
    where id = app_id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, before, after)
  values (auth.uid(), 'application.approve', 'application', app_id::text,
          to_jsonb(app), to_jsonb((select a from public.applications a where a.id = app_id)));

  return app_id;
end
$$;

-- ============================================================
-- reject_application: symmetric to approve.
-- ============================================================
create or replace function public.reject_application(app_id uuid, reason text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  app public.applications;
begin
  if not public.has_role(array['admin','staff']::public.user_role[]) then
    raise exception 'not authorised: requires admin or staff role';
  end if;

  select * into app from public.applications where id = app_id;
  if not found then
    raise exception 'application not found: %', app_id;
  end if;
  if app.status <> 'pending' then
    raise exception 'application already %', app.status;
  end if;

  update public.applications
    set status      = 'rejected',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        notes       = coalesce(notes, '') ||
                      case when reason is null then '' else E'\n[reject reason] ' || reason end
    where id = app_id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, before, after)
  values (auth.uid(), 'application.reject', 'application', app_id::text,
          to_jsonb(app), to_jsonb((select a from public.applications a where a.id = app_id)));

  return app_id;
end
$$;

-- ============================================================
-- set_user_role: admin promotes/demotes a profile's role.
-- Wraps the update so we always write to audit_log.
-- ============================================================
create or replace function public.set_user_role(target_id uuid, new_role public.user_role)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  prev_role public.user_role;
begin
  if not public.has_role(array['admin']::public.user_role[]) then
    raise exception 'not authorised: requires admin role';
  end if;
  if target_id = auth.uid() and new_role <> 'admin' then
    raise exception 'admins cannot demote themselves';
  end if;

  select role into prev_role from public.profiles where id = target_id;
  if prev_role is null then
    raise exception 'target profile not found';
  end if;

  update public.profiles set role = new_role where id = target_id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, before, after)
  values (auth.uid(), 'profile.role_change', 'profile', target_id::text,
          jsonb_build_object('role', prev_role),
          jsonb_build_object('role', new_role));

  return target_id;
end
$$;

-- Grant execute to authenticated users; the function itself enforces role.
grant execute on function public.approve_application(uuid) to authenticated;
grant execute on function public.reject_application(uuid, text) to authenticated;
grant execute on function public.set_user_role(uuid, public.user_role) to authenticated;
