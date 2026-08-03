-- 0021 — Promote the head coach.
--
-- Dorant Haxhidauti is the club's head coach (team_members position 'coach').
-- Give his login account the `coach` role and activate it so he can reach the
-- coach panel and sign in (the login page blocks non-active accounts).
--
-- Idempotent: affects the row only if the profile exists; the `role <> 'admin'`
-- guard avoids ever demoting an admin. Runs once, like the initial-admin promote
-- (20260517000010) — later in-app role changes via /admin/members are preserved.

update public.profiles
set role   = 'coach',
    status = 'active'
where email = 'dorant.haxhidauti@kcprishtina038.cc'
  and role <> 'admin';
