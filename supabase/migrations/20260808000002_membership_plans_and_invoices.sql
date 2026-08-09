-- 20260808000002 — Academy membership plans, memberships (the payment
-- schedule) and monthly invoice generation on top of the existing `dues`
-- table.
--
-- Model:
--   membership_plans  the three academy tiers, admin-editable so the club
--                     owner can change a price without a migration.
--   memberships       one PERIOD ON ONE PLAN: which plan, the amount frozen at
--                     signup, and the window it covers. At most one row per
--                     member is 'active'; moving up a tier closes the current
--                     row and opens a new one (set_member_plan, section E), so
--                     an invoice always keeps the terms it was issued under.
--   dues              UNCHANGED as a concept — it IS the invoice. We only add
--                     membership_id / due_date / invoice_no. The existing
--                     unique(member_id, period) is what makes generation
--                     idempotent, so it is deliberately left alone. invoice_no
--                     is assigned by a trigger (section F) and by nothing else.
--
-- `billable` is the load-bearing flag. The competition tier is not "€0" and not
-- "price on request": it is structurally OUTSIDE billing. A non-billable plan
-- (and any membership copied from one) is never invoiced by anything, ever.
-- The club may one day pay those riders a salary; that is a separate money flow
-- and is deliberately NOT modelled here — nothing below has to be torn out when
-- it arrives, because outbound pay would be its own table, not a negative due.
--
-- Every statement is written to be safely re-runnable.

-- ============================================================
-- A) membership_plans — the academy tiers.
-- amount_eur is NULL on a non-billable plan; the check constraint keeps the
-- two columns from contradicting each other.
-- ============================================================
create table if not exists public.membership_plans (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  name_sq        text not null,
  description_sq text,
  amount_eur     numeric(8,2) check (amount_eur is null or amount_eur >= 0),
  billable       boolean not null default true,
  display_order  int  not null default 0,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- A billable plan must carry a price. A non-billable plan must not depend on
  -- one (it may be NULL, and generation ignores it either way).
  constraint membership_plans_billable_price_ck
    check (not billable or amount_eur is not null)
);

-- Bring a table created by an earlier revision of this file up to date.
alter table public.membership_plans
  add column if not exists billable boolean not null default true;

create index if not exists membership_plans_active_idx
  on public.membership_plans(active, display_order);

drop trigger if exists membership_plans_updated_at on public.membership_plans;
create trigger membership_plans_updated_at before update on public.membership_plans
  for each row execute function public.set_updated_at();

insert into public.membership_plans
  (code, name_sq, description_sq, amount_eur, billable, display_order) values
  ('academy_1', 'Akademia I',
   'Këshilla dhe plan stërvitjeje sipas nivelit tënd. Pa përcjellje nga trajneri dhe pa stërvitje të përbashkëta.',
   20.00, true, 1),
  ('academy_2', 'Akademia II',
   'Trajner profesionist që të përcjell nga afër dhe stërvitje të përbashkëta dy herë në javë.',
   40.00, true, 2),
  ('competition', 'Garues',
   'Për garues me performancë të zhvilluar. Pa pagesë mujore ndaj klubit.',
   null, false, 3)
on conflict (code) do nothing;

-- Repair, not a re-seed: if an earlier revision of this migration already
-- created the competition tier as billable, it must be corrected before the
-- check constraint below can be validated. Prices the admin has edited on the
-- billable tiers are left untouched.
update public.membership_plans
   set billable = false, amount_eur = null
 where code = 'competition' and billable;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'membership_plans_billable_price_ck'
       and conrelid = 'public.membership_plans'::regclass
  ) then
    alter table public.membership_plans
      add constraint membership_plans_billable_price_ck
      check (not billable or amount_eur is not null);
  end if;
end
$$;

-- ============================================================
-- B) applications.plan_id — which tier the applicant chose on /join.
-- Nullable: applications submitted before this migration predate it.
-- ============================================================
alter table public.applications
  add column if not exists plan_id uuid references public.membership_plans(id) on delete set null;
create index if not exists applications_plan_idx on public.applications(plan_id);

-- ============================================================
-- C) memberships — the subscription AND the payment schedule.
--
-- amount_eur and billable are FROZEN from the plan at creation, so editing a
-- plan's price later never restates memberships that already exist.
--
-- Two different situations both end up uninvoiced and reporting must tell them
-- apart:
--   billable = false            → a racer; does not pay the club at all.
--   billable = true, amount 0   → a paying tier waived for this rider
--                                 (e.g. under 14). Still a paying tier.
-- ============================================================
create table if not exists public.memberships (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.profiles(id) on delete cascade,
  plan_id     uuid not null references public.membership_plans(id),
  amount_eur  numeric(8,2) not null default 0 check (amount_eur >= 0),
  billable    boolean not null default true,
  start_date  date not null,          -- first billed month
  end_date    date,                   -- null = ongoing
  status      text not null default 'active' check (status in ('active','paused','ended')),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

alter table public.memberships
  add column if not exists billable boolean not null default true;
alter table public.memberships
  alter column amount_eur set default 0;

create index if not exists memberships_member_idx on public.memberships(member_id);
create index if not exists memberships_status_idx on public.memberships(status);
create index if not exists memberships_plan_idx   on public.memberships(plan_id);

-- A member can hold only ONE active membership at a time.
create unique index if not exists memberships_one_active_per_member
  on public.memberships(member_id) where status = 'active';

drop trigger if exists memberships_updated_at on public.memberships;
create trigger memberships_updated_at before update on public.memberships
  for each row execute function public.set_updated_at();

-- ============================================================
-- D) dues — extend in place. NOTHING is dropped or renamed, and
-- unique(member_id, period) stays exactly as it is: it is what makes
-- invoice generation idempotent.
-- ============================================================
alter table public.dues
  add column if not exists membership_id uuid references public.memberships(id) on delete set null,
  add column if not exists due_date      date,
  add column if not exists invoice_no    text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'dues_invoice_no_key' and conrelid = 'public.dues'::regclass
  ) then
    alter table public.dues add constraint dues_invoice_no_key unique (invoice_no);
  end if;
end
$$;

create index if not exists dues_membership_idx on public.dues(membership_id);
create index if not exists dues_due_date_idx   on public.dues(due_date);

-- ============================================================
-- E) set_member_plan — the ONLY way an enrolment changes a member's tier.
--
-- A membership row is a PERIOD SPENT ON ONE PLAN, not a mutable "current
-- subscription". dues.membership_id points at the row an invoice was issued
-- under, so plan_id / amount_eur / billable must never change once invoices
-- exist: a June invoice issued on Akademia II (€40) would otherwise read as a
-- non-billable €0 Garues invoice the moment the rider is promoted in September,
-- and every report that groups by plan would restate history along with it.
-- An academy whose whole point is progression (Akademia I → Akademia II →
-- Garues) hits that on every promotion.
--
-- The four cases, all decided inside ONE transaction:
--   1. no active membership          → insert one.
--   2. active row already identical  → return it untouched (bar clearing an
--      end date that had been scheduled). THIS is what makes a double click on
--      "Aprovo dhe regjistro", or a retry of a half-finished enrolment, free of
--      churn: an identical request must not close and reopen anything.
--   3. different, but the row has NO dues AND does not start before the new
--      start → update in place. Fixing a typo in the amount minutes after
--      enrolling is a correction, not a change of tier; closing and reopening
--      would leave a pointless one-day stub. Nothing points at the row and it
--      covered no month of its own, so there is no history to protect.
--   4. anything else — already invoiced, or it covered earlier months → close
--      the old row and insert a new one.
--
-- END DATE CONVENTION: the closed row ends on the day BEFORE the new one
-- starts (start_date .. end_date inclusive, no overlap). Clamped up to the old
-- row's own start_date so a backdated change cannot violate
-- (end_date >= start_date).
--
-- Before any of the four, one repair runs: a backdated start can reach behind
-- a period that was closed earlier, so already-closed rows that would overlap
-- the new one have their end_date pulled back. Only the window moves.
--
-- The close runs BEFORE the insert, so memberships_one_active_per_member (only
-- one active row per member) can never be transiently violated — not even for
-- an instant, because both statements share one transaction. That single
-- transaction is the whole reason this lives in SQL: two PostgREST calls from
-- the server action could not offer it.
-- ============================================================
create or replace function public.set_member_plan(
  p_member_id uuid,
  p_plan_id   uuid,
  p_amount    numeric,
  p_billable  boolean,
  p_start     date
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_current  public.memberships%rowtype;
  v_amount   numeric(8,2) := round(coalesce(p_amount, 0), 2);
  v_has_dues boolean;
  v_end      date;
  v_id       uuid;
begin
  -- A non-billable tier is outside billing, never "€0 for now" — the amount is
  -- forced here too, so no caller can bill a racer by sending a stale field.
  if not p_billable then
    v_amount := 0;
  end if;

  -- Serialise concurrent enrolments of the SAME member. FOR UPDATE below cannot
  -- lock a row that does not exist yet, so two first-time enrolments racing
  -- each other would both insert and one would die on
  -- memberships_one_active_per_member — a 23505 the admin can do nothing with.
  -- With the lock the loser simply waits and then takes case 2 (identical) or
  -- case 4 (a real change). Transaction-scoped: released on commit or error.
  perform pg_advisory_xact_lock(hashtext('memberships.member:' || p_member_id::text));

  select * into v_current
    from public.memberships
   where member_id = p_member_id and status = 'active'
   order by start_date desc
   limit 1
   for update;

  -- INVARIANT REPAIR, before any case runs: a member's history must never have
  -- two rows covering one month. Backdating can break that — p_start may land
  -- inside a period that was closed earlier, and neither the in-place update
  -- (case 3) nor the close-and-open (case 4) touches anything but the row that
  -- is active right now. Generation and the reports page both resolve "which
  -- membership covered this month", so an overlap there is an arbitrary answer.
  --
  -- Only the WINDOW moves: plan_id, amount_eur and billable are untouched, so
  -- no invoice already issued under those rows is restated. `start_date <
  -- p_start` keeps (end_date >= start_date) satisfied and skips rows that sit
  -- entirely inside the new period, which could only be removed by deleting
  -- history. Normally this updates nothing at all — including on the identical
  -- retry of case 2, where the invariant already holds.
  update public.memberships
     set end_date = p_start - 1
   where member_id = p_member_id
     and id is distinct from v_current.id
     and status = 'ended'
     and start_date < p_start
     and end_date >= p_start;

  -- 1. nothing active yet. A 'paused' row is deliberately left as it is: it is
  -- history, and only the active row is a live payment schedule.
  --
  -- Tested on v_current.id, NOT on FOUND: plpgsql resets FOUND on every
  -- statement, so the repair above (which normally matches no rows) would
  -- otherwise clear it and send an existing member down the insert path,
  -- straight into memberships_one_active_per_member.
  if v_current.id is null then
    insert into public.memberships (member_id, plan_id, amount_eur, billable, start_date, status)
    values (p_member_id, p_plan_id, v_amount, p_billable, p_start, 'active')
    returning id into v_id;
    return v_id;
  end if;

  -- 2. identical retry — same plan, same amount, same start month. Not one row
  -- is written, which is the point: the admin can press "Aprovo dhe regjistro"
  -- twice, or retry a half-finished enrolment, without churning history. The
  -- single exception is a row that had been given an end date: re-enrolling
  -- someone whose membership was scheduled to stop plainly means "keep it
  -- running", and clearing end_date restates no invoice, because plan_id,
  -- amount_eur and billable stay exactly as they were.
  if v_current.plan_id = p_plan_id
     and v_current.amount_eur = v_amount
     and v_current.billable = p_billable
     and v_current.start_date = p_start then
    if v_current.end_date is not null then
      update public.memberships set end_date = null where id = v_current.id;
    end if;
    return v_current.id;
  end if;

  select exists (select 1 from public.dues where membership_id = v_current.id)
    into v_has_dues;

  -- 3. A CORRECTION, not a new period. Two conditions, both required:
  --   • nothing has been invoiced against this row, so no invoice can be
  --     restated by rewriting it; and
  --   • it does not start EARLIER than the new start, so it covers no month the
  --     new row will not cover.
  -- Fixing a mistyped amount minutes after enrolling is the everyday case, and
  -- closing and reopening would leave a degenerate one-day row behind for
  -- nothing. Backdating the start (>) is the same thing seen from the other
  -- side: "closing" the old row would date its end AFTER its replacement
  -- begins, leaving two overlapping rows for the same member.
  --
  -- The start_date test is what keeps this honest, and it is not cosmetic. A
  -- row that started earlier covered real months whether or not they were
  -- invoiced yet — the admin can still generate those months from
  -- /admin/finance — so rewriting it in place would either bill them at the new
  -- tier's price or, once start_date moves forward, never bill them at all.
  -- Such a row goes to case 4 and is preserved as the period it was.
  if not v_has_dues and v_current.start_date >= p_start then
    update public.memberships
       set plan_id    = p_plan_id,
           amount_eur = v_amount,
           billable   = p_billable,
           start_date = p_start,
           end_date   = null,
           status     = 'active'
     where id = v_current.id;
    return v_current.id;
  end if;

  -- 4. a genuine new period: the old row has been invoiced, or it covered
  -- months of its own. Close it, then open the new one.
  v_end := greatest(p_start - 1, v_current.start_date);
  update public.memberships
     set status = 'ended', end_date = v_end
   where id = v_current.id;

  insert into public.memberships (member_id, plan_id, amount_eur, billable, start_date, status)
  values (p_member_id, p_plan_id, v_amount, p_billable, p_start, 'active')
  returning id into v_id;
  return v_id;
end
$$;

-- Server-side only: the enrolment action calls it with the service-role key.
-- No browser session ever reaches it, so it carries no role check of its own —
-- the same shape as generate_dues_for_period_internal below.
revoke all on function public.set_member_plan(uuid, uuid, numeric, boolean, date) from public;
revoke all on function public.set_member_plan(uuid, uuid, numeric, boolean, date) from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.set_member_plan(uuid, uuid, numeric, boolean, date) to service_role;
  end if;
end
$$;

-- ============================================================
-- F) Invoice numbering — one implementation, in the database.
--
-- invoice_no is '<YYYY>-<MM>-<NNNN>': the billed period plus a counter that
-- restarts every month. It used to be computed in plpgsql here AND again in
-- TypeScript in the enrolment action; two max()+1 readers of the same table,
-- each able to hand out a number the other had already taken. A BEFORE INSERT
-- trigger makes every path — the generator, the cron, the enrolment action and
-- any manual insert — get a correct, unique number without knowing the format.
--
-- The counter lives in its own table instead of being derived from
-- max(invoice_no), because THAT is what makes it concurrency-safe:
-- "update ... set last_seq = last_seq + 1 returning last_seq" takes a row lock,
-- so a second transaction numbering the same period blocks until the first
-- commits or rolls back and only then reads the counter. Two transactions can
-- therefore never compute the same number. max(invoice_no)+1 cannot promise
-- that: it sees only COMMITTED rows, so two in-flight inserts both read the
-- same maximum and both pick the same next number.
-- ============================================================
create table if not exists public.dues_invoice_counters (
  period   date primary key,           -- first of the billed month
  last_seq int not null default 0      -- highest number handed out for it
);

-- Written only by the SECURITY DEFINER trigger below (which runs as the owner
-- and so bypasses RLS). RLS on with no policy at all = no client can touch it.
alter table public.dues_invoice_counters enable row level security;
revoke all on table public.dues_invoice_counters from anon, authenticated;

create or replace function public.next_invoice_no(p_period date)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_period date := date_trunc('month', p_period)::date;
  v_prefix text := to_char(v_period, 'YYYY-MM');
  v_seq    int;
  v_no     text;
begin
  for i in 1..50 loop
    v_seq := null;

    -- The row lock taken here is the serialisation point (see the note above).
    update public.dues_invoice_counters
       set last_seq = last_seq + 1
     where period = v_period
    returning last_seq into v_seq;

    if v_seq is null then
      -- First invoice of this period. Seed from whatever `dues` already holds,
      -- so a month numbered before this trigger existed continues its sequence
      -- instead of restarting at 1. If another transaction seeds it at the same
      -- instant our insert waits on the primary key and then fails; we simply
      -- go round again and take the UPDATE path.
      begin
        insert into public.dues_invoice_counters (period, last_seq)
        select v_period,
               coalesce(max(substring(invoice_no from '^\d{4}-\d{2}-(\d+)$')::int), 0) + 1
          from public.dues
         where invoice_no like v_prefix || '-%'
        returning last_seq into v_seq;
      exception when unique_violation then
        v_seq := null;
      end;
    end if;

    if v_seq is not null then
      v_no := v_prefix || '-' || lpad(v_seq::text, 4, '0');
      -- The counter is authoritative, but a hand-written invoice_no could have
      -- jumped ahead of it. Skip numbers already taken instead of letting the
      -- insert die on dues_invoice_no_key.
      if not exists (select 1 from public.dues where invoice_no = v_no) then
        return v_no;
      end if;
    end if;
  end loop;

  -- Only reachable if 50 consecutive numbers were hand-written around the
  -- counter. Say so, instead of returning one that is about to fail on the
  -- unique constraint with no explanation.
  raise exception 'could not allocate an invoice number for period %', v_prefix;
end
$$;

revoke all on function public.next_invoice_no(date) from public;
revoke all on function public.next_invoice_no(date) from anon, authenticated;

-- Fills in what every invoice needs and nothing else. Both fields are only
-- touched when NULL, so an explicit value from a caller always wins.
create or replace function public.dues_fill_invoice_defaults()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.invoice_no is null then
    new.invoice_no := public.next_invoice_no(new.period);
  end if;
  -- Payment is expected mid-month. Defined here once, so no caller repeats it.
  if new.due_date is null then
    new.due_date := date_trunc('month', new.period)::date + 14;
  end if;
  return new;
end
$$;

drop trigger if exists dues_invoice_defaults on public.dues;
create trigger dues_invoice_defaults before insert on public.dues
  for each row execute function public.dues_fill_invoice_defaults();

-- ============================================================
-- G) Invoice generation.
--
-- generate_dues_for_period_internal — the actual work, with NO role check, so
-- the cron job (which runs as the table owner and has no auth.uid()) can call
-- it. It is SECURITY DEFINER, so EXECUTE is revoked from every client role
-- below; the only public entry point is the RPC underneath, which asserts the
-- caller's role.
-- ============================================================
create or replace function public.generate_dues_for_period_internal(
  p_period date,
  p_actor  uuid default null
)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_period   date := date_trunc('month', p_period)::date;
  v_prefix   text := to_char(v_period, 'YYYY-MM');
  v_created  int;
begin
  -- No advisory lock and no sequence arithmetic here any more. invoice_no and
  -- due_date come from the BEFORE INSERT trigger in section F, which serialises
  -- on the counter row, so overlapping runs (the 1st-of-month cron firing while
  -- an admin presses the button) can no longer hand the same number to two
  -- members. Double-billing stays impossible for the reason it always was:
  -- unique(member_id, period) plus the NOT EXISTS filter below.
  --
  -- Because that filter excludes members who already have this month's invoice,
  -- a plain re-run inserts nothing and therefore consumes no numbers. ON
  -- CONFLICT is only the backstop for a true race; losing one leaves a gap in
  -- the month's sequence, which is harmless — numbers must be unique and
  -- ascending, not contiguous.
  with covering as (
    -- STEP 1 — WHICH MEMBERSHIP COVERED THIS MONTH, one row per member.
    -- Deliberately says nothing about money yet; see `eligible` below for why
    -- that separation is load-bearing.
    --
    -- Not "which one is current": since a tier change CLOSES the old row and
    -- opens a new one (section E), the membership that covered a past month is
    -- normally an 'ended' row by the time an admin backfills that month from
    -- /admin/finance. Filtering on status = 'active' would find nobody for it
    -- and quietly drop real academy debt; worse, it would drop it at the OLD
    -- price. 'paused' is the one status that means "do not bill".
    --
    -- DISTINCT ON keeps this to ONE row per member. Two membership rows can
    -- touch the same month if a start was ever backdated, and two source rows
    -- with the same member+period would be silently reduced to an arbitrary one
    -- by the ON CONFLICT below — i.e. an arbitrary amount. The latest start
    -- wins, then the latest end (an open-ended row is still in force, so it
    -- sorts first), then the id purely so the result is deterministic.
    select distinct on (m.member_id)
           m.id          as membership_id,
           m.member_id   as member_id,
           m.amount_eur  as amount_eur,
           m.billable    as billable
      from public.memberships m
     where m.status <> 'paused'
       -- An 'ended' row with no end date is malformed: a closed period with no
       -- known end. Treating it as ongoing would bill it forever, so only an
       -- active row is allowed to be open-ended.
       and (m.status = 'active' or m.end_date is not null)
       and m.start_date < (v_period + interval '1 month')::date   -- started on or before this month
       and (m.end_date is null or m.end_date >= v_period)         -- and had not ended before it
       and not exists (
         select 1 from public.dues d
          where d.member_id = m.member_id and d.period = v_period
       )
     order by m.member_id, m.start_date desc, m.end_date desc nulls first, m.id
  ),
  eligible as (
    -- STEP 2 — and only now, does that membership bill anything?
    --
    -- This MUST run after the pick, never as part of it. Applied inside the
    -- DISTINCT ON above, a non-billable row would be filtered out before it
    -- could win, and an OLDER billable row of the same member would take its
    -- place — invoicing a competition racer for a month they were already a
    -- racer in. Filtering afterwards means the row in force decides, and if
    -- that row is a racer's the member simply drops out.
    --
    -- billable is NOT redundant with amount > 0: it is the guard that stops a
    -- competition racer from ever being invoiced, even if someone later types
    -- an amount onto their membership row by mistake.
    select membership_id, member_id, amount_eur
      from covering
     where billable and amount_eur > 0
  ),
  ins as (
    insert into public.dues
      (member_id, period, amount_eur, status, membership_id)
    select e.member_id, v_period, e.amount_eur, 'unpaid', e.membership_id
      from eligible e
    on conflict (member_id, period) do nothing   -- idempotent
    returning 1
  )
  select count(*)::int into v_created from ins;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, before, after)
  values (p_actor, 'dues.generate', 'dues_period', v_prefix, null,
          jsonb_build_object(
            'period',   v_period,
            'created',  v_created,
            'source',   case when p_actor is null then 'cron' else 'rpc' end
          ));

  return v_created;
end
$$;

revoke all on function public.generate_dues_for_period_internal(date, uuid) from public;
revoke all on function public.generate_dues_for_period_internal(date, uuid) from anon, authenticated;

-- The client-facing RPC: same work, but only admin/staff may run it.
create or replace function public.generate_dues_for_period(p_period date)
returns integer
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(array['admin','staff']::public.user_role[]) then
    raise exception 'not authorised: requires admin or staff role';
  end if;
  return public.generate_dues_for_period_internal(date_trunc('month', p_period)::date, auth.uid());
end
$$;

grant execute on function public.generate_dues_for_period(date) to authenticated;

-- ============================================================
-- H) Monthly cron: generate the current month's invoices on the 1st.
-- Unschedule first so re-running this migration cannot duplicate the job.
-- ============================================================
create extension if not exists pg_cron with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'dues-generate-monthly') then
    perform cron.unschedule('dues-generate-monthly');
  end if;
end
$$;

select cron.schedule(
  'dues-generate-monthly',
  '20 3 1 * *',
  $$
  select public.generate_dues_for_period_internal(date_trunc('month', now())::date);
  $$
);

-- ============================================================
-- I) RLS.
-- ============================================================
alter table public.membership_plans enable row level security;
alter table public.memberships      enable row level security;

drop policy if exists membership_plans_select_active on public.membership_plans;
drop policy if exists membership_plans_select_staff  on public.membership_plans;
drop policy if exists membership_plans_write_admin   on public.membership_plans;
drop policy if exists memberships_select_own   on public.memberships;
drop policy if exists memberships_select_staff on public.memberships;
drop policy if exists memberships_write_staff  on public.memberships;

-- MEMBERSHIP PLANS — the tier list is shown on the public /join form, so active
-- plans are world-readable (same shape as sponsors_select_active). Staff
-- additionally see deactivated plans; only admin writes.
create policy membership_plans_select_active on public.membership_plans
  for select using (active = true);

create policy membership_plans_select_staff on public.membership_plans
  for select to authenticated
  using (public.has_role(array['admin','editor','staff','coach']::public.user_role[]));

create policy membership_plans_write_admin on public.membership_plans
  for all to authenticated
  using       (public.has_role(array['admin']::public.user_role[]))
  with check  (public.has_role(array['admin']::public.user_role[]));

-- MEMBERSHIPS — own read; admin/staff read and write everything.
create policy memberships_select_own on public.memberships
  for select to authenticated using (member_id = auth.uid());

create policy memberships_select_staff on public.memberships
  for select to authenticated
  using (public.has_role(array['admin','staff']::public.user_role[]));

create policy memberships_write_staff on public.memberships
  for all to authenticated
  using       (public.has_role(array['admin','staff']::public.user_role[]))
  with check  (public.has_role(array['admin','staff']::public.user_role[]));

-- DUES — the policies from migration 0006 (dues_select_own / dues_select_staff
-- / dues_write_staff) are column-agnostic and already cover membership_id,
-- due_date and invoice_no for both the member portal and the admin panel.
-- Nothing is added and nothing is weakened here.
