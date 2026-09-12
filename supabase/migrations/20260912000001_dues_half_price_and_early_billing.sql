-- 20260912000001 — Half-price invoices (holidays) and early billing for next
-- month.
--
-- What the club owner asked for, verbatim: "make it possible to have the
-- invoices for the academy half the price for cases where members are in
-- holidays or so; also allow to generate invoices for the next month like 15
-- days before the month start".
--
--   1. HALF PRICE. An invoice can be cut to half — one already issued (section
--      B, set_due_half_price) or one being generated (section C, the new
--      p_half_member_ids argument). The undiscounted price is kept on the row
--      in full_amount_eur for as long as the invoice is reduced, so going back
--      to the full price is exact even for odd cents (40.01 → 20.01 → 40.01),
--      which a stored percentage could not promise.
--   2. EARLY BILLING. generate_dues_for_members accepts next month's period
--      from 15 days before that month begins (section C). The rule is computed
--      on the CLUB's calendar day (Europe/Belgrade), exactly like
--      latestBillablePeriod() in lib/finance.ts — the server action checks the
--      same thing first, this is the backstop for any other caller.
--   3. set_member_plan(p_allow_close) (section D). Closing a period is
--      confirmed in the app, but the app decides on a read taken BEFORE the
--      RPC; the flag makes the SQL refuse case 4 under its own lock unless the
--      caller explicitly allows it.
--
-- Everything here is additive and re-runnable:
--   * two NEW nullable columns — every existing row reads as "not reduced";
--   * the CHECK is added only if it is not already there;
--   * functions are create-or-replace; the two generate_dues_for_members
--     signatures being replaced are dropped first (drop ... if exists), so
--     PostgREST never sees two overloads it cannot choose between — and so is
--     set_member_plan's 5-argument signature (section D).
-- generate_dues_anchored_for_date, generate_dues_for_period and the cron are
-- NOT touched: the daily anchored run already skips any member+period that has
-- an invoice, which is what makes an early invoice safe.

-- ============================================================
-- A) dues.full_amount_eur + dues.discount_reason
-- ============================================================
alter table public.dues
  add column if not exists full_amount_eur numeric(8,2);

alter table public.dues
  add column if not exists discount_reason text;

-- A reduced invoice can never ask for MORE than its full price, and never for
-- a negative amount. Guarded, so a re-run does not fail on "already exists".
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.dues'::regclass
       and conname  = 'dues_full_amount_check'
  ) then
    alter table public.dues
      add constraint dues_full_amount_check
      check (full_amount_eur is null or (full_amount_eur >= amount_eur and amount_eur >= 0));
  end if;
end
$$;

comment on column public.dues.full_amount_eur is
  'The undiscounted price, set ONLY while the invoice is reduced (half price). '
  'Null = amount_eur is the full price. Restoring the full price copies it back '
  'into amount_eur and clears it. See set_due_half_price().';

comment on column public.dues.discount_reason is
  'Why the invoice is reduced (default ''Pushime''). Set together with '
  'full_amount_eur and cleared with it.';

-- ============================================================
-- B) set_due_half_price — halve one open invoice, or undo that.
--
-- Returns a CODE, never raises for an expected outcome, so the server action
-- can map every case to Albanian:
--   'ok'         done
--   'unchanged'  already in the requested state
--   'not_found'  no such invoice
--   'not_open'   paid or waived — reprice only unpaid/overdue rows; a paid one
--                has to be reopened ("Zhbëj") first, so the money on record
--                and the amount on the invoice can never disagree
--   'zero'       nothing to halve (amount <= 0)
-- 'overdue' is accepted as a stored status too, although the UI derives it
-- from the due date and normally stores 'unpaid'.
-- ============================================================
create or replace function public.set_due_half_price(
  p_due_id uuid,
  p_half   boolean,
  p_reason text default null
)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_before public.dues;
  v_after  public.dues;
  -- Trimmed, defaulted and capped: it is printed on the member's invoice.
  v_reason text := left(coalesce(nullif(btrim(p_reason), ''), 'Pushime'), 120);
begin
  if not public.has_role(array['admin','staff']::public.user_role[]) then
    raise exception 'not authorised: requires admin or staff role';
  end if;
  if p_due_id is null or p_half is null then
    return 'not_found';
  end if;

  -- FOR UPDATE: two staff pressing "Gjysmë çmimi" at once must not halve the
  -- already-halved amount a second time.
  select * into v_before from public.dues where id = p_due_id for update;
  if not found then
    return 'not_found';
  end if;

  if p_half = (v_before.full_amount_eur is not null) then
    return 'unchanged';
  end if;
  if v_before.status not in ('unpaid', 'overdue') then
    return 'not_open';
  end if;

  if p_half then
    if v_before.amount_eur <= 0 then
      return 'zero';
    end if;
    update public.dues
       set full_amount_eur = amount_eur,
           amount_eur      = round(amount_eur / 2, 2),
           discount_reason = v_reason
     where id = p_due_id
    returning * into v_after;
  else
    update public.dues
       set amount_eur      = full_amount_eur,
           full_amount_eur = null,
           discount_reason = null
     where id = p_due_id
    returning * into v_after;
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, before, after)
  values (auth.uid(),
          case when p_half then 'dues.half_price' else 'dues.full_price' end,
          'dues', p_due_id::text, to_jsonb(v_before), to_jsonb(v_after));

  return 'ok';
end
$$;

revoke all on function public.set_due_half_price(uuid, boolean, text) from public;
revoke all on function public.set_due_half_price(uuid, boolean, text) from anon;
grant execute on function public.set_due_half_price(uuid, boolean, text) to authenticated;

-- ============================================================
-- C) generate_dues_for_members — same pick, plus half-price members and the
-- early-billing window.
--
-- The old signatures go first. Leaving them would give PostgREST two
-- overloads that both accept (p_period, p_member_ids, p_issued_on) and it
-- would refuse the call as ambiguous.
-- ============================================================
drop function if exists public.generate_dues_for_members(date, uuid[], date);
drop function if exists public.generate_dues_for_members_internal(date, uuid[], date, uuid);

-- The covering/eligible CTEs are IDENTICAL to 20260818000001 section C (and so
-- to generate_dues_for_period_internal). The only change is the insert: a
-- member in p_half_member_ids is billed round(amount / 2, 2), with the
-- membership's price kept in full_amount_eur and the reason beside it.
create or replace function public.generate_dues_for_members_internal(
  p_period          date,
  p_member_ids      uuid[],
  p_issued_on       date   default null,
  p_actor           uuid   default null,
  p_half_member_ids uuid[] default null,
  p_discount_reason text   default null
)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_period  date   := date_trunc('month', p_period)::date;
  v_prefix  text   := to_char(v_period, 'YYYY-MM');
  -- When an invoice date is given the due date is issued_on + 5; otherwise leave
  -- it NULL and let the BEFORE INSERT trigger fill it.
  v_due     date   := case when p_issued_on is not null then p_issued_on + 5 else null end;
  v_half    uuid[] := coalesce(p_half_member_ids, '{}'::uuid[]);
  v_reason  text   := case when cardinality(coalesce(p_half_member_ids, '{}'::uuid[])) > 0
                           then left(coalesce(nullif(btrim(p_discount_reason), ''), 'Pushime'), 120)
                           else null end;
  v_created int;
begin
  with covering as (
    -- STEP 1 — which membership covered this month, one row per member. See
    -- generate_dues_for_period_internal for why each line is there.
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
    -- STEP 2 — only now, does that membership bill anything?
    select membership_id, member_id, amount_eur,
           (member_id = any(v_half)) as half
      from covering
     where billable and amount_eur > 0
  ),
  ins as (
    insert into public.dues
      (member_id, period, amount_eur, status, membership_id, issued_on, due_date,
       full_amount_eur, discount_reason)
    select e.member_id, v_period,
           case when e.half then round(e.amount_eur / 2, 2) else e.amount_eur end,
           'unpaid', e.membership_id, p_issued_on, v_due,
           case when e.half then e.amount_eur end,
           case when e.half then v_reason end
      from eligible e
    on conflict (member_id, period) do nothing   -- idempotent
    returning 1
  )
  select count(*)::int into v_created from ins;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, before, after)
  values (p_actor, 'dues.generate.members', 'dues_period', v_prefix, null,
          jsonb_build_object(
            'period',          v_period,
            'issued_on',       p_issued_on,
            'members',         to_jsonb(p_member_ids),
            'half_members',    to_jsonb(v_half),
            'discount_reason', v_reason,
            'created',         v_created,
            'source',          case when p_actor is null then 'internal' else 'rpc' end
          ));

  return v_created;
end
$$;

revoke all on function public.generate_dues_for_members_internal(date, uuid[], date, uuid, uuid[], text) from public;
revoke all on function public.generate_dues_for_members_internal(date, uuid[], date, uuid, uuid[], text) from anon, authenticated;

-- The client-facing RPC. Two gates before the work:
--   1. admin/staff only, as before;
--   2. the EARLY-BILLING WINDOW. The latest month that may be billed is the
--      current one, or NEXT month once the club's day is on/after the first of
--      next month minus 15 days (16 Sep for October; 17 Dec for January).
--      Computed on the club's calendar (Europe/Belgrade) — Supabase runs in
--      UTC, which is still "yesterday" for the first hour or two of a Kosovo
--      day. Must stay identical to latestBillablePeriod() in lib/finance.ts;
--      the server action refuses first with an Albanian sentence, this raises
--      the token 'billing_window_closed' for any other caller.
create or replace function public.generate_dues_for_members(
  p_period          date,
  p_member_ids      uuid[],
  p_issued_on       date   default null,
  p_half_member_ids uuid[] default null,
  p_discount_reason text   default null
)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_period     date := date_trunc('month', p_period)::date;
  v_today      date := (now() at time zone 'Europe/Belgrade')::date;
  v_this_month date := date_trunc('month', v_today)::date;
  v_next_month date := (date_trunc('month', v_today) + interval '1 month')::date;
  v_latest     date;
begin
  if not public.has_role(array['admin','staff']::public.user_role[]) then
    raise exception 'not authorised: requires admin or staff role';
  end if;

  v_latest := case when v_today >= v_next_month - 15 then v_next_month else v_this_month end;
  if v_period > v_latest then
    raise exception 'billing_window_closed: % opens on %',
      v_period, (v_period - 15);
  end if;

  return public.generate_dues_for_members_internal(
    v_period, p_member_ids, p_issued_on, auth.uid(), p_half_member_ids, p_discount_reason
  );
end
$$;

revoke all on function public.generate_dues_for_members(date, uuid[], date, uuid[], text) from public;
revoke all on function public.generate_dues_for_members(date, uuid[], date, uuid[], text) from anon;
grant execute on function public.generate_dues_for_members(date, uuid[], date, uuid[], text) to authenticated;

-- ============================================================
-- D) set_member_plan — case 4 only when the caller allows it.
--
-- Identical to 20260808000002 section E, plus p_allow_close. The server
-- actions read the active row and its dues, decide whether a save closes the
-- period, and ask the admin first — but that read happens BEFORE this call.
-- Another save, an invoice generated meanwhile or the 03:20 cron can land in
-- between and turn a correction (case 3) into a close-and-open (case 4) that
-- nobody confirmed. So the case is decided again HERE, under the advisory
-- lock and FOR UPDATE, and case 4 without p_allow_close returns NULL having
-- written nothing — not even the overlap repair, which is why the case test
-- now runs before it. The callers map NULL to "confirm first".
--
-- The 5-argument signature is dropped first: a call with five named arguments
-- would otherwise match both it and this one, and PostgREST would refuse it as
-- ambiguous.
-- ============================================================
drop function if exists public.set_member_plan(uuid, uuid, numeric, boolean, date);

create or replace function public.set_member_plan(
  p_member_id   uuid,
  p_plan_id     uuid,
  p_amount      numeric,
  p_billable    boolean,
  p_start       date,
  p_allow_close boolean default false
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_current  public.memberships%rowtype;
  v_amount   numeric(8,2) := round(coalesce(p_amount, 0), 2);
  v_has_dues boolean := false;
  v_same     boolean := false;
  v_end      date;
  v_id       uuid;
begin
  if not p_billable then
    v_amount := 0;
  end if;

  perform pg_advisory_xact_lock(hashtext('memberships.member:' || p_member_id::text));

  select * into v_current
    from public.memberships
   where member_id = p_member_id and status = 'active'
   order by start_date desc
   limit 1
   for update;

  if v_current.id is not null then
    -- coalesce: a NULL argument must read as "different", never as NULL,
    -- which would slip past the refusal below and fall through to case 4.
    v_same := coalesce(v_current.plan_id = p_plan_id
          and v_current.amount_eur = v_amount
          and v_current.billable = p_billable
          and v_current.start_date = p_start, false);
    select exists (select 1 from public.dues where membership_id = v_current.id)
      into v_has_dues;

    -- Case 4 is about to be taken and the caller did not allow it: nothing is
    -- written. Checked before the repair below, which is itself a write.
    if not v_same
       and not (not v_has_dues and v_current.start_date >= p_start)
       and not coalesce(p_allow_close, false) then
      return null;
    end if;
  end if;

  -- INVARIANT REPAIR (unchanged): already-closed rows that would overlap the
  -- new period have their end_date pulled back. Only the window moves.
  update public.memberships
     set end_date = p_start - 1
   where member_id = p_member_id
     and id is distinct from v_current.id
     and status = 'ended'
     and start_date < p_start
     and end_date >= p_start;

  -- 1. nothing active yet.
  if v_current.id is null then
    insert into public.memberships (member_id, plan_id, amount_eur, billable, start_date, status)
    values (p_member_id, p_plan_id, v_amount, p_billable, p_start, 'active')
    returning id into v_id;
    return v_id;
  end if;

  -- 2. identical retry (bar clearing a scheduled end date).
  if v_same then
    if v_current.end_date is not null then
      update public.memberships set end_date = null where id = v_current.id;
    end if;
    return v_current.id;
  end if;

  -- 3. a correction: no dues, and it does not start before the new start.
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

  -- 4. a genuine new period, allowed by the caller: close, then open.
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

-- Server-side only, as before: the actions call it with the service-role key.
revoke all on function public.set_member_plan(uuid, uuid, numeric, boolean, date, boolean) from public;
revoke all on function public.set_member_plan(uuid, uuid, numeric, boolean, date, boolean) from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.set_member_plan(uuid, uuid, numeric, boolean, date, boolean) to service_role;
  end if;
end
$$;
