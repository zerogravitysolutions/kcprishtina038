-- 20260913000001 — Prepaid invoices ("Parapagim").
--
-- What the club owner asked for, verbatim: "I want to be able to generate
-- invoices that are prepaid for a few months".
--
-- A PREPAYMENT is one member paying N consecutive months (1..12) at once. It is
-- NOT a new kind of invoice: it produces one ordinary monthly dues row per
-- month — unique(member_id, period) stays exactly as it is — every one of them
-- PAID with the same payment date and method, and all linked to one
-- dues_prepayments row. Because a dues row then exists for each prepaid month,
-- the daily anchored job (generate_dues_anchored_for_date) and the manual
-- generator (generate_dues_for_members) both skip those months through their
-- existing NOT EXISTS — nothing here touches them, and nothing can be billed
-- twice. Billing stays per month; the cash lands on the payment date.
--
-- Per month in the range:
--   * no invoice yet        → a PAID invoice is created, priced from the
--                             membership in force (the generator's covering
--                             pick), half price if asked;
--   * an unpaid/overdue one → it is marked paid AS PART of the prepayment, and
--                             its exact prior state is kept in prior_states so
--                             an undo can put it back;
--   * a paid or waived one  → the WHOLE prepayment is refused (already_settled);
--   * no billable membership in force (amount > 0) → refused (not_covered).
-- Any refusal raises, so the transaction rolls back and nothing is written.
--
-- Everything here is additive and re-runnable: a new table, a new nullable
-- column, create-or-replace functions and drop-if-exists policies.

-- ============================================================
-- A) dues_prepayments — one row per prepayment.
-- ============================================================
create table if not exists public.dues_prepayments (
  id           uuid primary key default gen_random_uuid(),
  -- restrict, like dues.member_id (20260810000001): a member with money on
  -- record cannot be hard-deleted out from under it.
  member_id    uuid not null references public.profiles(id) on delete restrict,
  first_period date not null,
  months       int  not null check (months between 1 and 12),
  paid_on      date not null,
  paid_method  text not null check (paid_method in ('cash', 'bank', 'online')),
  total_eur    numeric(10,2) not null,
  notes        text,
  recorded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  -- The exact values the PRE-EXISTING invoices had before this prepayment
  -- marked them paid: [{id, status, paid_at, paid_method, recorded_by,
  -- amount_eur, full_amount_eur, discount_reason, notes}, …]. Rows the
  -- prepayment CREATED are not listed — an undo deletes those.
  prior_states jsonb not null default '[]'::jsonb
);

create index if not exists dues_prepayments_member_idx on public.dues_prepayments(member_id);

comment on table public.dues_prepayments is
  'One prepayment = one member paying N consecutive months at once. Each month '
  'is an ordinary dues row (paid, prepayment_id set). Written only by '
  'record_prepayment() and removed only by undo_prepayment().';

alter table public.dues_prepayments enable row level security;

-- Read: finance staff see all, a member sees their own (the printable document
-- and the portal use the caller's session). NO insert/update/delete policies:
-- the only writers are the two SECURITY DEFINER functions below.
drop policy if exists dues_prepayments_select_staff on public.dues_prepayments;
create policy dues_prepayments_select_staff on public.dues_prepayments
  for select to authenticated
  using (public.has_role(array['admin','staff']::public.user_role[]));

drop policy if exists dues_prepayments_select_own on public.dues_prepayments;
create policy dues_prepayments_select_own on public.dues_prepayments
  for select to authenticated
  using (member_id = auth.uid());

-- Belt and braces on top of "no policy": the table-level privileges too.
revoke all on table public.dues_prepayments from anon;
revoke insert, update, delete, truncate on table public.dues_prepayments from authenticated;
grant select on table public.dues_prepayments to authenticated;

-- ============================================================
-- B) dues.prepayment_id — which prepayment settled this invoice, if any.
-- ============================================================
alter table public.dues
  add column if not exists prepayment_id uuid references public.dues_prepayments(id) on delete set null;

create index if not exists dues_prepayment_idx on public.dues(prepayment_id);

comment on column public.dues.prepayment_id is
  'Set while this invoice is settled by a prepayment (dues_prepayments). '
  'Cleared, or the row deleted, by undo_prepayment().';

-- ============================================================
-- C) record_prepayment
--
-- Refuses with an exception whose MESSAGE STARTS WITH a stable token, so the
-- server action can map each to an Albanian sentence:
--   forbidden                caller is not an active admin/staff
--   invalid_months           p_months outside 1..12
--   invalid_method           not cash / bank / online
--   invalid_date             p_paid_on missing
--   invalid_period           p_first_period missing or not a first-of-month,
--                            or the range leaves club month −12 .. +12
--   future_payment           p_paid_on after the CLUB's day (Europe/Belgrade)
--   half_outside_range       a half-price month that is not in the range
--   not_covered:YYYY-MM      no billable membership in force for that month
--   already_settled:YYYY-MM  that month's invoice is already paid or waived
-- Months are checked in order, so the FIRST blocking month is the one named —
-- lib/prepay.ts computePrepayPreview() reaches the same verdict in the same
-- order. The 15-day early-billing window deliberately does NOT apply: this
-- records money received, it does not raise a bill in advance.
-- ============================================================
create or replace function public.record_prepayment(
  p_member_id       uuid,
  p_first_period    date,
  p_months          int,
  p_paid_on         date,
  p_method          text,
  p_half_periods    date[] default null,
  p_discount_reason text   default null,
  p_notes           text   default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_today      date := (now() at time zone 'Europe/Belgrade')::date;
  v_this_month date := date_trunc('month', v_today)::date;
  v_first      date;
  v_last       date;
  v_half       date[] := coalesce(p_half_periods, '{}'::date[]);
  v_reason     text;
  v_notes      text := nullif(btrim(coalesce(p_notes, '')), '');
  v_paid_at    timestamptz;
  v_id         uuid;
  v_period     date;
  v_is_half    boolean;
  v_row        public.dues;
  v_cov        record;
  v_prior      jsonb := '[]'::jsonb;
  v_items      jsonb := '[]'::jsonb;
  v_total      numeric(10,2) := 0;
  v_created    int := 0;
  v_marked     int := 0;
  v_pp         public.dues_prepayments;
  i            int;
begin
  if not public.has_role(array['admin','staff']::public.user_role[])
     or not exists (select 1 from public.profiles where id = auth.uid() and status = 'active') then
    raise exception 'forbidden: requires an active admin or staff account';
  end if;
  if p_months is null or p_months < 1 or p_months > 12 then
    raise exception 'invalid_months: %', p_months;
  end if;
  if p_method is null or p_method not in ('cash', 'bank', 'online') then
    raise exception 'invalid_method: %', p_method;
  end if;
  if p_paid_on is null then
    raise exception 'invalid_date: payment date missing';
  end if;
  if p_first_period is null or p_first_period <> date_trunc('month', p_first_period)::date then
    raise exception 'invalid_period: % is not the first of a month', p_first_period;
  end if;

  v_first := p_first_period;
  v_last  := (v_first + make_interval(months => p_months - 1))::date;
  if v_first < (v_this_month - interval '12 months')::date
     or v_last > (v_this_month + interval '12 months')::date then
    raise exception 'invalid_period: % .. % is outside % ± 12 months', v_first, v_last, v_this_month;
  end if;

  if p_paid_on > v_today then
    raise exception 'future_payment: % is after %', p_paid_on, v_today;
  end if;

  if exists (
    select 1 from unnest(v_half) h
     where h is null or h <> date_trunc('month', h)::date or h < v_first or h > v_last
  ) then
    raise exception 'half_outside_range';
  end if;
  -- Same default and cap as set_due_half_price: printed on the invoice.
  v_reason := case when cardinality(v_half) > 0
                   then left(coalesce(nullif(btrim(p_discount_reason), ''), 'Pushime'), 120)
              end;

  -- A member with no id — or an id with no profile — has no membership: the
  -- first month is not covered. Checked here so the dues_prepayments insert
  -- below never surfaces a raw FK violation instead of a token.
  if p_member_id is null
     or not exists (select 1 from public.profiles where id = p_member_id) then
    raise exception 'not_covered:%', to_char(v_first, 'YYYY-MM');
  end if;

  -- The SAME key set_member_plan takes, so a plan change cannot interleave with
  -- the covering pick below.
  perform pg_advisory_xact_lock(hashtext('memberships.member:' || p_member_id::text));

  -- Every invoice already in the range, locked for the rest of the transaction.
  perform 1 from public.dues
   where member_id = p_member_id and period between v_first and v_last
   for update;

  -- noon UTC: the same calendar day in Kosovo (UTC+1/+2), like markInvoicePaid.
  v_paid_at := (p_paid_on::timestamp + interval '12 hours') at time zone 'UTC';

  insert into public.dues_prepayments
    (member_id, first_period, months, paid_on, paid_method, total_eur, notes, recorded_by)
  values
    (p_member_id, v_first, p_months, p_paid_on, p_method, 0, v_notes, auth.uid())
  returning id into v_id;

  for i in 0 .. p_months - 1 loop
    v_period  := (v_first + make_interval(months => i))::date;
    v_is_half := v_period = any(v_half);

    select * into v_row from public.dues
     where member_id = p_member_id and period = v_period
     for update;

    if not found then
      -- The generator's covering pick, verbatim (20260912000001 section C):
      -- the latest-starting membership in force for the month decides, and
      -- only then is it asked whether it bills anything.
      select m.id, m.amount_eur, m.billable into v_cov
        from public.memberships m
       where m.member_id = p_member_id
         and m.status <> 'paused'
         and (m.status = 'active' or m.end_date is not null)
         and m.start_date < (v_period + interval '1 month')::date
         and (m.end_date is null or m.end_date >= v_period)
       order by m.start_date desc, m.end_date desc nulls first, m.id
       limit 1;
      if not found then
        raise exception 'not_covered:%', to_char(v_period, 'YYYY-MM');
      end if;
      if not v_cov.billable or coalesce(v_cov.amount_eur, 0) <= 0 then
        raise exception 'not_covered:%', to_char(v_period, 'YYYY-MM');
      end if;

      -- on conflict: the 03:20 job (or a staff member) may have inserted this
      -- month since the FOR UPDATE above. Then fall through to the
      -- existing-invoice path below instead of dying on the unique key.
      insert into public.dues
        (member_id, period, amount_eur, status, paid_at, paid_method, recorded_by, notes,
         membership_id, issued_on, full_amount_eur, discount_reason, prepayment_id)
      values
        (p_member_id, v_period,
         case when v_is_half then round(v_cov.amount_eur / 2, 2) else v_cov.amount_eur end,
         'paid', v_paid_at, p_method, auth.uid(), v_notes,
         v_cov.id, p_paid_on,
         case when v_is_half then v_cov.amount_eur end,
         case when v_is_half then v_reason end,
         v_id)
      on conflict (member_id, period) do nothing
      returning * into v_row;

      if found then
        v_created := v_created + 1;
        v_total   := v_total + v_row.amount_eur;
        v_items   := v_items || jsonb_build_object(
          'id', v_row.id, 'period', v_row.period, 'invoice_no', v_row.invoice_no,
          'amount_eur', v_row.amount_eur, 'created', true);
        continue;
      end if;

      select * into v_row from public.dues
       where member_id = p_member_id and period = v_period
       for update;
    end if;

    -- An invoice exists for this month.
    if v_row.status not in ('unpaid', 'overdue') then
      raise exception 'already_settled:%', to_char(v_period, 'YYYY-MM');
    end if;

    v_prior := v_prior || jsonb_build_object(
      'id',              v_row.id,
      'status',          v_row.status,
      'paid_at',         v_row.paid_at,
      'paid_method',     v_row.paid_method,
      'recorded_by',     v_row.recorded_by,
      'amount_eur',      v_row.amount_eur,
      'full_amount_eur', v_row.full_amount_eur,
      'discount_reason', v_row.discount_reason,
      'notes',           v_row.notes
    );

    -- Half price only when asked, not already reduced and there is something
    -- to halve — exactly set_due_half_price's rules. Every SET expression reads
    -- the OLD row, so full_amount_eur receives the undiscounted amount.
    update public.dues
       set status          = 'paid',
           paid_at         = v_paid_at,
           paid_method     = p_method,
           recorded_by     = auth.uid(),
           prepayment_id   = v_id,
           notes           = coalesce(v_notes, notes),
           amount_eur      = case when v_is_half and full_amount_eur is null and amount_eur > 0
                                  then round(amount_eur / 2, 2) else amount_eur end,
           full_amount_eur = case when v_is_half and full_amount_eur is null and amount_eur > 0
                                  then amount_eur else full_amount_eur end,
           discount_reason = case when v_is_half and full_amount_eur is null and amount_eur > 0
                                  then v_reason else discount_reason end
     where id = v_row.id
    returning * into v_row;

    v_marked := v_marked + 1;
    v_total  := v_total + v_row.amount_eur;
    v_items  := v_items || jsonb_build_object(
      'id', v_row.id, 'period', v_row.period, 'invoice_no', v_row.invoice_no,
      'amount_eur', v_row.amount_eur, 'created', false);
  end loop;

  update public.dues_prepayments
     set total_eur = v_total, prior_states = v_prior
   where id = v_id
  returning * into v_pp;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, before, after)
  values (auth.uid(), 'dues.prepay', 'dues_prepayments', v_id::text, null,
          to_jsonb(v_pp) || jsonb_build_object(
            'invoices',        v_items,
            'created',         v_created,
            'marked_paid',     v_marked,
            'half_periods',    to_jsonb(v_half),
            'discount_reason', v_reason));

  return v_id;
end
$$;

revoke all on function public.record_prepayment(uuid, date, int, date, text, date[], text, text) from public;
revoke all on function public.record_prepayment(uuid, date, int, date, text, date[], text, text) from anon;
grant execute on function public.record_prepayment(uuid, date, int, date, text, date[], text, text) to authenticated;

-- ============================================================
-- D) undo_prepayment — admin only, exact.
--
-- Invoices that existed before the prepayment go back to exactly the values
-- saved in prior_states (and lose their prepayment_id); invoices it created
-- are deleted, each with its full row in audit_log ('dues.delete', the same
-- action deleteInvoice writes). Invoice numbers are never handed out again —
-- dues_invoice_counters is not touched, as with any deletion. Returns the
-- number of invoices touched (restored + deleted).
-- Tokens: forbidden, not_found.
-- ============================================================
create or replace function public.undo_prepayment(p_prepayment_id uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_member   uuid;
  v_pp       public.dues_prepayments;
  v_prior    jsonb;
  v_prior_ids uuid[];
  v_row      public.dues;
  v_restored int := 0;
  v_deleted  int := 0;
  v_items    jsonb := '[]'::jsonb;
begin
  if not public.has_role(array['admin']::public.user_role[])
     or not exists (select 1 from public.profiles where id = auth.uid() and status = 'active') then
    raise exception 'forbidden: requires an active admin account';
  end if;

  select member_id into v_member from public.dues_prepayments where id = p_prepayment_id;
  if not found then
    raise exception 'not_found';
  end if;

  -- Same lock order as record_prepayment: the member key first, then rows.
  perform pg_advisory_xact_lock(hashtext('memberships.member:' || v_member::text));

  select * into v_pp from public.dues_prepayments where id = p_prepayment_id for update;
  if not found then
    raise exception 'not_found';   -- undone by someone else meanwhile
  end if;

  perform 1 from public.dues where prepayment_id = p_prepayment_id for update;

  select coalesce(array_agg((e.val->>'id')::uuid), '{}'::uuid[]) into v_prior_ids
    from jsonb_array_elements(v_pp.prior_states) as e(val);

  -- 1. Pre-existing invoices: back to exactly what they were.
  for v_prior in select e.val from jsonb_array_elements(v_pp.prior_states) as e(val) loop
    update public.dues
       set status          = (v_prior->>'status')::public.dues_status,
           paid_at         = (v_prior->>'paid_at')::timestamptz,
           paid_method     = v_prior->>'paid_method',
           recorded_by     = (v_prior->>'recorded_by')::uuid,
           amount_eur      = (v_prior->>'amount_eur')::numeric,
           full_amount_eur = (v_prior->>'full_amount_eur')::numeric,
           discount_reason = v_prior->>'discount_reason',
           notes           = v_prior->>'notes',
           prepayment_id   = null
     where id = (v_prior->>'id')::uuid
       and prepayment_id = p_prepayment_id
    returning * into v_row;
    if found then
      v_restored := v_restored + 1;
      v_items := v_items || jsonb_build_object(
        'id', v_row.id, 'period', v_row.period, 'invoice_no', v_row.invoice_no, 'restored', true);
    end if;
  end loop;

  -- 2. Invoices the prepayment created: audited in full, then deleted.
  for v_row in
    select * from public.dues
     where prepayment_id = p_prepayment_id
       and not (id = any(v_prior_ids))
     order by period
  loop
    insert into public.audit_log (actor_id, action, entity_type, entity_id, before, after)
    values (auth.uid(), 'dues.delete', 'dues', v_row.id::text, to_jsonb(v_row),
            jsonb_build_object('source', 'undo_prepayment', 'prepayment_id', p_prepayment_id));
    delete from public.dues where id = v_row.id;
    v_deleted := v_deleted + 1;
    v_items := v_items || jsonb_build_object(
      'id', v_row.id, 'period', v_row.period, 'invoice_no', v_row.invoice_no, 'deleted', true);
  end loop;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, before, after)
  values (auth.uid(), 'dues.prepay.undo', 'dues_prepayments', p_prepayment_id::text, to_jsonb(v_pp),
          jsonb_build_object('restored', v_restored, 'deleted', v_deleted, 'invoices', v_items));

  delete from public.dues_prepayments where id = p_prepayment_id;

  return v_restored + v_deleted;
end
$$;

revoke all on function public.undo_prepayment(uuid) from public;
revoke all on function public.undo_prepayment(uuid) from anon;
grant execute on function public.undo_prepayment(uuid) to authenticated;
