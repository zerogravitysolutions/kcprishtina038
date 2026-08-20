-- 20260818000001 — Invoice DATE on every due, a +5 due-date default anchored to
-- it, a "bill a chosen set of members" RPC, and per-member anchored monthly
-- recurrence.
--
-- What the club owner asked for, in three parts:
--   1. Generating academy invoices must ASK for an invoice date and a set of
--      members, instead of silently billing everyone for the calendar month.
--      That is generate_dues_for_members below (section C) — the manual modal
--      calls it with the chosen date + the chosen members.
--   2. The due date is the invoice date + 5 days (was period + 14). Defined once
--      in the trigger (section B) and anchored to issued_on, so every path — the
--      modal, the cron, a hand insert — agrees.
--   3. Each member recurs monthly ON THEIR OWN START DAY (13 Aug → 13 Sep → 13
--      Oct …), auto-generated, due +5, until their membership ends. That is the
--      anchored daily job (section D), which replaces the single 1st-of-month
--      run.
--
-- Everything here is additive and re-runnable:
--   * dues.issued_on is a NEW nullable column, so existing rows are untouched
--     and keep falling back to created_at / period for display.
--   * period stays the first-of-month idempotency bucket (unique(member_id,
--     period)); issued_on is only the human-facing invoice date. They are
--     distinct on purpose — a January invoice cut on 3 Feb has period 1 Jan and
--     issued_on 3 Feb.
--   * generate_dues_for_period is LEFT ALONE for manual month backfills.

-- ============================================================
-- A) dues.issued_on — the INVOICE DATE shown to the member.
--
-- Distinct from `period` (first-of-month, the idempotency bucket) and from
-- `created_at` (the row's generation timestamp). Nullable so every pre-existing
-- row is unaffected and the UI falls back to created_at / period for them.
-- Indexed because the finance list orders and filters invoices by it.
-- ============================================================
alter table public.dues
  add column if not exists issued_on date;

create index if not exists dues_issued_on_idx on public.dues(issued_on);

-- ============================================================
-- B) The due-date default: invoice date + 5, anchored to issued_on.
--
-- Only touched when due_date arrives NULL, so any explicit value a caller sends
-- still wins. When issued_on is set (the modal / the anchored job), the due date
-- follows it; otherwise it falls back to the first of the billed month — the
-- same shape as before, only +5 instead of +14. invoice_no logic is unchanged.
-- ============================================================
create or replace function public.dues_fill_invoice_defaults()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.invoice_no is null then
    new.invoice_no := public.next_invoice_no(new.period);
  end if;
  -- Payment is expected five days after the invoice date. When no invoice date
  -- was given, fall back to the first of the billed month, so a plain
  -- generate_dues_for_period insert still gets a sensible due date.
  if new.due_date is null then
    new.due_date := coalesce(new.issued_on, date_trunc('month', new.period)::date) + 5;
  end if;
  return new;
end
$$;

drop trigger if exists dues_invoice_defaults on public.dues;
create trigger dues_invoice_defaults before insert on public.dues
  for each row execute function public.dues_fill_invoice_defaults();

-- ============================================================
-- C) generate_dues_for_members — bill a CHOSEN SET of members for a period,
-- with an optional explicit invoice date.
--
-- Same shape as generate_dues_for_period: an internal function with NO role
-- check (so a future automated path could call it too), EXECUTE revoked from
-- every client role, plus a thin client-facing wrapper that asserts the role.
-- The covering/eligible pick is IDENTICAL to generate_dues_for_period_internal —
-- one membership per member, the row in force decides, billable AND amount > 0 —
-- restricted to the members in p_member_ids. Idempotent via NOT EXISTS +
-- unique(member_id, period).
-- ============================================================
create or replace function public.generate_dues_for_members_internal(
  p_period     date,
  p_member_ids uuid[],
  p_issued_on  date default null,
  p_actor      uuid default null
)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_period  date := date_trunc('month', p_period)::date;
  v_prefix  text := to_char(v_period, 'YYYY-MM');
  -- When an invoice date is given the due date is issued_on + 5; otherwise leave
  -- it NULL and let the BEFORE INSERT trigger (section B) fill it.
  v_due     date := case when p_issued_on is not null then p_issued_on + 5 else null end;
  v_created int;
begin
  with covering as (
    -- STEP 1 — which membership covered this month, one row per member. Same
    -- pick as generate_dues_for_period_internal (section G of 20260808000002):
    -- 'paused' never bills, an 'ended' row must have an end date, it must have
    -- started by the end of the month and not have ended before it, and the
    -- latest start (then latest end, open-ended first, then id) wins. The only
    -- addition is the member-set restriction.
    select distinct on (m.member_id)
           m.id          as membership_id,
           m.member_id   as member_id,
           m.amount_eur  as amount_eur,
           m.billable    as billable
      from public.memberships m
     where m.member_id = any(p_member_ids)
       and m.status <> 'paused'
       and (m.status = 'active' or m.end_date is not null)
       and m.start_date < (v_period + interval '1 month')::date
       and (m.end_date is null or m.end_date >= v_period)
       and not exists (
         select 1 from public.dues d
          where d.member_id = m.member_id and d.period = v_period
       )
     order by m.member_id, m.start_date desc, m.end_date desc nulls first, m.id
  ),
  eligible as (
    -- STEP 2 — and only now, does that membership bill anything? billable is not
    -- redundant with amount > 0: it stops a competition racer from ever being
    -- invoiced even if an amount was typed onto their row by mistake.
    select membership_id, member_id, amount_eur
      from covering
     where billable and amount_eur > 0
  ),
  ins as (
    insert into public.dues
      (member_id, period, amount_eur, status, membership_id, issued_on, due_date)
    select e.member_id, v_period, e.amount_eur, 'unpaid', e.membership_id,
           p_issued_on, v_due
      from eligible e
    on conflict (member_id, period) do nothing   -- idempotent
    returning 1
  )
  select count(*)::int into v_created from ins;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, before, after)
  values (p_actor, 'dues.generate.members', 'dues_period', v_prefix, null,
          jsonb_build_object(
            'period',    v_period,
            'issued_on', p_issued_on,
            'members',   to_jsonb(p_member_ids),
            'created',   v_created,
            'source',    case when p_actor is null then 'internal' else 'rpc' end
          ));

  return v_created;
end
$$;

revoke all on function public.generate_dues_for_members_internal(date, uuid[], date, uuid) from public;
revoke all on function public.generate_dues_for_members_internal(date, uuid[], date, uuid) from anon, authenticated;

-- The client-facing RPC: same work, but only admin/staff may run it. This is
-- what the "Gjenero fatura" modal calls.
create or replace function public.generate_dues_for_members(
  p_period     date,
  p_member_ids uuid[],
  p_issued_on  date default null
)
returns integer
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(array['admin','staff']::public.user_role[]) then
    raise exception 'not authorised: requires admin or staff role';
  end if;
  return public.generate_dues_for_members_internal(
    date_trunc('month', p_period)::date, p_member_ids, p_issued_on, auth.uid()
  );
end
$$;

grant execute on function public.generate_dues_for_members(date, uuid[], date) to authenticated;

-- ============================================================
-- D) Anchored monthly recurrence.
--
-- Each member recurs on their OWN start day. generate_dues_anchored_for_date
-- runs daily and, for every active billable membership whose ANCHOR DAY equals
-- today's day, cuts this month's invoice (period = first of this month,
-- issued_on = today, due_date = today + 5) unless one already exists.
--
-- ANCHOR DAY = the membership's start_date day-of-month, CLAMPED to the number
-- of days in the current month. A 31st anchor therefore bills on the 30th in
-- September and on the 28th/29th in February — i.e. on the LAST day of any month
-- shorter than the anchor. least(start-day, days-in-month) does exactly that,
-- and the daily cadence means the clamp fires that member on that last day.
--
-- No DISTINCT ON is needed: memberships_one_active_per_member guarantees at most
-- one active row per member, so the insert cannot produce two rows for one
-- member+period. Idempotent via NOT EXISTS + unique(member_id, period).
-- ============================================================
create or replace function public.generate_dues_anchored_for_date(p_on date)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_period date := date_trunc('month', p_on)::date;
  v_prefix text := to_char(v_period, 'YYYY-MM');
  -- Days in p_on's month: first-of-month + 1 month - 1 day.
  v_dim    int  := extract(day from (v_period + interval '1 month' - interval '1 day'))::int;
  v_day    int  := extract(day from p_on)::int;
  v_due    date := p_on + 5;
  v_created int;
begin
  with ins as (
    insert into public.dues
      (member_id, period, amount_eur, status, membership_id, issued_on, due_date)
    select m.member_id, v_period, m.amount_eur, 'unpaid', m.id, p_on, v_due
      from public.memberships m
     where m.status = 'active'
       and m.billable and m.amount_eur > 0
       and m.start_date <= p_on                                 -- started on/before today
       and (m.end_date is null or m.end_date >= p_on)           -- and not ended
       -- Fires on the member's anchor day, clamped to this month's length.
       and least(extract(day from m.start_date)::int, v_dim) = v_day
       and not exists (
         select 1 from public.dues d
          where d.member_id = m.member_id and d.period = v_period
       )
    on conflict (member_id, period) do nothing   -- idempotent
    returning 1
  )
  select count(*)::int into v_created from ins;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, before, after)
  values (null, 'dues.generate.anchored', 'dues_period', v_prefix, null,
          jsonb_build_object(
            'on',      p_on,
            'period',  v_period,
            'created', v_created,
            'source',  'cron'
          ));

  return v_created;
end
$$;

revoke all on function public.generate_dues_anchored_for_date(date) from public;
revoke all on function public.generate_dues_anchored_for_date(date) from anon, authenticated;

-- ============================================================
-- E) Cron: replace the single 1st-of-month run with a DAILY anchored run.
-- Unschedule the old and any prior daily job first, so re-running this migration
-- cannot leave a duplicate. generate_dues_for_period stays available for manual
-- backfills of a whole month.
-- ============================================================
create extension if not exists pg_cron with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'dues-generate-monthly') then
    perform cron.unschedule('dues-generate-monthly');
  end if;
  if exists (select 1 from cron.job where jobname = 'dues-generate-daily') then
    perform cron.unschedule('dues-generate-daily');
  end if;
end
$$;

select cron.schedule(
  'dues-generate-daily',
  '20 3 * * *',
  $$
  select public.generate_dues_anchored_for_date(current_date);
  $$
);
