-- 20260810000001 — The club's accounting record must outlive the account.
--
-- THE BUG THIS CLOSES
-- -------------------
--   profiles.id           references auth.users(id) on delete cascade
--   dues.member_id        references profiles(id)   on delete cascade   <-- here
--   memberships.member_id references profiles(id)   on delete cascade   <-- here
--
-- deleteMember() in app/admin/actions.ts calls auth.admin.deleteUser(). That
-- one DELETE walked the whole chain: auth.users -> profiles -> dues +
-- memberships. Removing a member's LOGIN therefore erased every invoice they
-- had ever been issued, PAID ONES INCLUDED, plus the enrolment history those
-- invoices were priced from. The money was already collected and booked; the
-- only surviving trace of it was the row that just got deleted. Nothing warned
-- the admin, nothing failed, and /admin/finance simply reported a smaller year.
--
-- The action's own copy — "Nëse llogaria ka të dhëna të lidhura, përdor
-- 'Çaktivizo'" — shows the author expected the delete to FAIL when related
-- rows existed. With ON DELETE CASCADE it could not fail. This migration makes
-- that expectation true in the only place it can be enforced.
--
-- WHY RESTRICT AND NOT SET NULL
-- -----------------------------
-- SET NULL would keep the rows and drop the member: an invoice for €40, paid in
-- cash, belonging to nobody. That is worse than useless for accounting, because
-- an accounting record is a claim against a PERSON — "who owes what, who paid".
-- Concretely, in this codebase:
--   * /admin/finance and /admin/finance/reports join dues to profiles to build
--     per-member debt and the collection rate; a null member_id silently drops
--     out of every grouping, so the euro totals would move again — the same
--     class of loss, one indirection further away.
--   * dues.unique(member_id, period) stops double-billing a member for a month.
--     NULLs are never equal in a unique index, so orphaned rows would fall out
--     of that guarantee too.
--   * memberships.one-active-per-member and set_member_plan() both key on
--     member_id; a null one is unreachable by every code path that maintains it.
-- Both columns are NOT NULL today, which already rules SET NULL out without a
-- second, destructive migration to relax them — and relaxing them is exactly
-- what we do NOT want. They stay NOT NULL; the constraint changes to RESTRICT,
-- so member_id is always a real member and the FK is the thing that says no.
--
-- RESTRICT, not NO ACTION: NO ACTION can be deferred to end-of-transaction and
-- reads as "unspecified" to the next person. RESTRICT is checked immediately
-- and states the intent: this row pins its member.
--
-- WHAT THE ADMIN GETS INSTEAD
-- ---------------------------
-- Deactivation, which already existed and already does the whole job:
-- setMemberStatus() flips profiles.status and bans the auth user, requireAdmin()
-- re-reads status on every server action, and the admin layout gates on it. The
-- person loses access; the club keeps its books. deleteMember() now pre-checks
-- dues + memberships and explains this in Albanian; this constraint is the
-- backstop for every other path into the database (SQL console, service-role
-- script, a future bulk cleanup) — the app is no longer the thing that has to
-- remember.
--
-- SAFE ON A LIVE DATABASE
-- -----------------------
-- Additive in effect: no column, row or index changes, and nothing is deleted.
-- Dropping and re-adding an FK re-validates it, so the honest question is
-- whether the new constraint can fail against the ~12 linked profiles and the
-- invoices already generated for them. It cannot: the constraint being replaced
-- is a VALIDATED FK on the SAME columns, so every dues.member_id and
-- memberships.member_id in the table today already resolves to a live
-- profiles.id — that is what the old constraint was enforcing. The delete rule
-- is the only thing that differs, and a delete rule is only consulted when a
-- profile is deleted, never during validation. Drop and add also share this
-- migration's single transaction, so there is no instant in which rows could be
-- written unchecked. Both member_id columns are already indexed
-- (dues_member_idx, memberships_member_idx), so the reverse lookup RESTRICT
-- performs on every profile delete stays an index hit.
--
-- Re-runnable: a constraint that is already RESTRICT is left exactly as it is.

-- ============================================================
-- A) dues.member_id — the invoices themselves. cascade -> restrict.
-- ============================================================
do $$
declare
  v_con text;
begin
  for v_con in
    select c.conname
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype  = 'f'
       and c.conrelid = 'public.dues'::regclass
       and c.confrelid = 'public.profiles'::regclass
       and array_length(c.conkey, 1) = 1
       and a.attname = 'member_id'
       and c.confdeltype <> 'r'          -- 'r' = restrict: already correct
  loop
    execute format('alter table public.dues drop constraint %I', v_con);
  end loop;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.dues'::regclass
       and contype  = 'f'
       and conname  = 'dues_member_id_fkey'
  ) then
    alter table public.dues
      add constraint dues_member_id_fkey
      foreign key (member_id) references public.profiles(id) on delete restrict;
  end if;
end
$$;

-- ============================================================
-- B) memberships.member_id — the terms each invoice was priced under.
--
-- Protected for the same reason, not merely by association: dues.membership_id
-- is ON DELETE SET NULL, so cascading memberships away left the invoices in
-- place but stripped of the plan and price they were issued on. Every report
-- that groups by tier would then quietly under-count.
-- ============================================================
do $$
declare
  v_con text;
begin
  for v_con in
    select c.conname
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype  = 'f'
       and c.conrelid = 'public.memberships'::regclass
       and c.confrelid = 'public.profiles'::regclass
       and array_length(c.conkey, 1) = 1
       and a.attname = 'member_id'
       and c.confdeltype <> 'r'
  loop
    execute format('alter table public.memberships drop constraint %I', v_con);
  end loop;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.memberships'::regclass
       and contype  = 'f'
       and conname  = 'memberships_member_id_fkey'
  ) then
    alter table public.memberships
      add constraint memberships_member_id_fkey
      foreign key (member_id) references public.profiles(id) on delete restrict;
  end if;
end
$$;

-- ============================================================
-- C) Say so in the schema, for whoever reads it next in psql.
-- ============================================================
comment on constraint dues_member_id_fkey on public.dues is
  'RESTRICT on purpose: an invoice is an accounting record. Deleting a member '
  'must fail, not erase their billing history. Deactivate the profile instead '
  '(profiles.status + auth ban).';

comment on constraint memberships_member_id_fkey on public.memberships is
  'RESTRICT on purpose: a membership is the plan and price an invoice was '
  'issued under. Deactivate the profile instead.';

comment on column public.profiles.status is
  'active | inactive | suspended | pending. Anything other than active revokes '
  'access (requireAdmin + the admin layout gate + an auth ban). This is the '
  'supported way to remove a member who has financial history — the FKs on '
  'dues and memberships refuse a hard delete.';
