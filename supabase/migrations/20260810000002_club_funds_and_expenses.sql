-- 20260810000002 — Club money that is NOT membership dues: what comes in
-- (sponsorships, projects, donations) and what goes out (the club's expense
-- ledger).
--
-- WHERE THIS COMES FROM
-- ---------------------
-- The club already keeps this by hand, in two spreadsheets, and the shape below
-- is taken from THEM rather than from a generic accounting model:
--
--   "2024-2025":  Ciklisti | Lloji i shpenzimit | Shuma | Data | Detajet | Paid
--   "2026":       Data | Nr. Fatures | Arsyje a shpenzimit | Ciklisti | Vlera |
--                 Forma e pagesses | Pagoi | Burimi | (note)
--
-- Four facts in those columns decide the whole model, and each of them is a
-- thing a naive "expenses table" gets wrong:
--
--   1. Ciklisti — an expense has a BENEFICIARY: one rider, or the club itself
--      (the literal "Klubi"). Riders are already rows in team_members, so the
--      beneficiary is a foreign key and "Klubi" is simply NULL. No parallel
--      text column, because a text column cannot be grouped on reliably
--      ("Albion Ymeri" vs "Albioni").
--
--   2. Vlera can be EMPTY. There is a real row — 19.01.2026, servicing
--      Besart's bike — with a date, a description and no amount yet. So
--      amount_eur is nullable ON PURPOSE, and every total over this table has
--      to say how many rows it could not count instead of adding a silent zero.
--      A zero would make an unknown cost look like a free one.
--
--   3. Pagoi — WHO ACTUALLY PAID is not always the club. Albioni, Qendrimi and
--      Durimi front costs out of their own pockets, and the club then OWES THEM
--      until it is settled. The settlement is frequently in kind ("I kam
--      rimbursu me nafte"), which is why `reimbursed` is a boolean with a free
--      text note rather than a link to a payment row: there is no payment row,
--      there is a tank of fuel. This is a real liability the owner is currently
--      tracking in a notes column, and it is the single most likely thing to be
--      forgotten.
--
--   4. Burimi — a cost can be charged against a SPONSOR'S BUDGET, and that
--      sponsor may not have transferred anything yet ("nevojitet transferi";
--      one row records €2,500 from BikePlus and €6,000 from NOVUS still to
--      come). The club is therefore routinely out of pocket AND owed at the
--      same time. That is why club_funds.status exists: PLEDGED money is not in
--      the bank and must never be added to a balance as though it were.
--
-- The relationship to the existing academy finance is deliberate and minimal:
-- dues stay the membership invoices, untouched. These tables are the other two
-- money flows. The distinction /admin/finance/reports already enforces between
-- cash-in and billed holds here too, in its own dialect: received vs pledged
-- funds, and paid vs unpaid expenses. Only the first of each pair is cash.
--
-- NO HISTORICAL ROWS ARE IMPORTED. The 2024-25 sheet mixes date formats
-- ("9/23/2024" is M/D/YYYY, "14/01/2025" is D/M/YYYY, "1/10/2024" is
-- undecidable); guessing would silently misdate real records. This migration
-- builds the model only.
--
-- Every statement is written to be safely re-runnable.

-- ============================================================
-- A) expense_categories — the owner's own list, not a hardcoded enum.
--
-- An enum would need a migration every time the club invents a cost type, and
-- the 2024-25 sheet already shows the list drifting on its own ("Noter"
-- appeared once). A table with `active` lets a category be retired without
-- rewriting the expenses that used it.
--
-- The seed is exactly the categories the two sheets use, in Albanian, with the
-- sheets' own vocabulary tidied where it was clearly one idea under two names:
--   "Pagesa per klub" + "Noter"        -> Kuotizim dhe taksa
--   Doranti's monthly coaching pay     -> Pagesa dhe angazhime
--   flight/train tickets (2026 sheet)  -> Udhëtim
-- `code` is the stable key the seed and any future migration match on; name_sq
-- is what the admin sees and may rename freely.
-- ============================================================
create table if not exists public.expense_categories (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name_sq       text not null,
  description_sq text,
  display_order int  not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists expense_categories_active_idx
  on public.expense_categories(active, display_order);

drop trigger if exists expense_categories_updated_at on public.expense_categories;
create trigger expense_categories_updated_at before update on public.expense_categories
  for each row execute function public.set_updated_at();

-- do nothing on conflict: a re-run must not undo a rename the admin made.
insert into public.expense_categories (code, name_sq, description_sq, display_order) values
  ('pajisje_sportive',  'Pajisje sportive',
   'Goma, pjesë këmbimi, veshje dhe pajisje për garues.', 10),
  ('derivate',          'Derivate',
   'Karburant për udhëtimet e ekipit.', 20),
  ('suplemente',        'Suplemente',
   'Ushqyerje sportive dhe suplemente.', 30),
  ('gara',              'Gara',
   'Kotizime, tarifa rrugore dhe shpenzime të ditës së garës.', 40),
  ('stervitje_grupore', 'Stërvitje grupore',
   'Shpenzime të stërvitjeve të përbashkëta.', 50),
  ('servisim',          'Servisim',
   'Servisim dhe riparim i biçikletave.', 60),
  ('ushqim',            'Ushqim',
   'Ushqim dhe pije për ekipin.', 70),
  ('udhetim',           'Udhëtim',
   'Bileta fluturimi, treni dhe fjetje.', 80),
  ('pagesa_angazhime',  'Pagesa dhe angazhime',
   'Pagesa mujore për trajnerin dhe angazhime të tjera.', 90),
  ('kuotizim_taksa',    'Kuotizim dhe taksa',
   'Anëtarësi në federatë, noter dhe taksa administrative.', 100),
  ('cash',              'Cash',
   'Ndihmesë e drejtpërdrejtë në para për një garues.', 110),
  ('tjeter',            'Tjetër',
   'Çdo shpenzim që nuk hyn në kategoritë e tjera.', 999)
on conflict (code) do nothing;

-- ============================================================
-- B) club_funds — money coming IN that is not a membership invoice.
--
-- status is the whole point of this table. "nevojitet transferi" in the sheet
-- means the sponsorship has been AGREED but not RECEIVED, while costs are
-- already being charged against it. A pledge is a promise, not cash:
--   'received' — in the bank. Counts towards the club balance.
--   'pledged'  — agreed, not arrived. NEVER counted as cash; the helpers in
--                lib/finance.ts keep it in its own field for exactly this
--                reason, and clubBalance() ignores it.
--
-- occurred_on therefore means "the day it landed" for a received row and "the
-- day it was agreed / is expected" for a pledged one. When a pledge lands the
-- admin flips status and corrects the date — one row, one sponsorship, its
-- whole life visible, instead of a pledge row plus a receipt row that have to
-- be reconciled by hand.
--
-- sponsor_id is a real FK to the sponsors already in the database (Novus,
-- BikePlus, BikePlus KS), because per-sponsor budget position is the report the
-- owner needs and it cannot be computed from a text field.
-- ============================================================
create table if not exists public.club_funds (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (length(btrim(title)) > 0),
  -- Received on, or (for a pledge) agreed/expected on.
  occurred_on  date not null,
  amount_eur   numeric(10,2) not null check (amount_eur >= 0),
  kind         text not null default 'sponsor'
                 check (kind in ('sponsor','project','donation','grant','other')),
  -- RESTRICT, like every other money FK in this schema (see migration
  -- 20260810000001): deleting a sponsor must not quietly erase the record of
  -- the money they gave. Sponsors are deactivated, not deleted.
  sponsor_id   uuid references public.sponsors(id) on delete restrict,
  status       text not null default 'received' check (status in ('received','pledged')),
  -- Bank reference, contract number, transfer note — whatever identifies it.
  reference    text,
  notes        text,
  recorded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- A sponsorship must say WHICH sponsor. Without it the row cannot be counted
  -- in that sponsor's budget position, so the report would quietly under-state
  -- what the club has actually received from them. Other kinds (a private
  -- donation, a municipal grant) may legitimately have no sponsor row.
  constraint club_funds_sponsor_required_ck
    check (kind <> 'sponsor' or sponsor_id is not null)
);

create index if not exists club_funds_occurred_idx on public.club_funds(occurred_on desc);
create index if not exists club_funds_status_idx   on public.club_funds(status);
create index if not exists club_funds_sponsor_idx  on public.club_funds(sponsor_id);
create index if not exists club_funds_kind_idx     on public.club_funds(kind);

drop trigger if exists club_funds_updated_at on public.club_funds;
create trigger club_funds_updated_at before update on public.club_funds
  for each row execute function public.set_updated_at();

-- ============================================================
-- C) club_expenses — money going OUT. One row per line of the 2026 sheet.
--
-- The column map, so the next person can read the sheet and this table side by
-- side:
--   Data                -> occurred_on
--   Nr. Fatures         -> invoice_no        ("pa fature" is NULL, not a string)
--   Arsyje a shpenzimit -> description (+ category_id)
--   Ciklisti            -> beneficiary_member_id ("Klubi" is NULL)
--   Vlera               -> amount_eur        (NULLABLE — see the header)
--   Forma e pagesses    -> payment_method    ('cash' = Kesh, 'transfer')
--   Pagoi               -> paid_by / paid_by_member_id ("pa paguar" -> status)
--   Burimi              -> funding_sponsor_id
--   note                -> notes / reimbursed / reimbursed_note
--
-- WHY invoice_no IS NULL AND NOT "pa fature": "pa fature" is not an invoice
-- number, it is the absence of one. Stored as text it would sort, group and
-- search as though dozens of costs shared one invoice. NULL says the true
-- thing, and the UI renders "pa faturë" from it.
--
-- WHY THERE IS NO UNIQUE INDEX ON invoice_no: unlike dues, these invoices are
-- issued by third parties. Two suppliers can use the same number, and one
-- supplier invoice can legitimately be split across several rows (different
-- beneficiaries, different categories). Uniqueness here would reject real data.
-- ============================================================
create table if not exists public.club_expenses (
  id                    uuid primary key default gen_random_uuid(),
  occurred_on           date not null,
  -- RESTRICT: a category with expenses behind it must be deactivated, not
  -- deleted, or the ledger loses the only classification it has.
  category_id           uuid not null references public.expense_categories(id) on delete restrict,
  description           text not null check (length(btrim(description)) > 0),
  -- NULLABLE ON PURPOSE. The club has a real cost with no amount agreed yet.
  -- A null here is NOT zero, and no total may treat it as one: sumAmounts() in
  -- lib/finance.ts counts such rows separately so the screen can say how many
  -- are missing next to the euro figure.
  amount_eur            numeric(10,2) check (amount_eur is null or amount_eur >= 0),
  -- NULL means the club itself ("Klubi" in the sheet), not "unknown".
  -- RESTRICT for the same reason dues.member_id is (migration 20260810000001):
  -- money spent on a person outlives their row on the roster.
  beneficiary_member_id uuid references public.team_members(id) on delete restrict,
  invoice_no            text check (invoice_no is null or length(btrim(invoice_no)) > 0),
  payment_method        text check (payment_method in ('cash','transfer')),
  -- WHO PAID. 'club' = out of the club account; 'member' = an individual
  -- fronted it and is owed the money back.
  paid_by               text not null default 'club' check (paid_by in ('club','member')),
  paid_by_member_id     uuid references public.team_members(id) on delete restrict,
  -- Burimi: which sponsor's budget this cost draws on. Note this is entirely
  -- independent of whether that sponsor has actually transferred anything —
  -- see club_funds.status.
  funding_sponsor_id    uuid references public.sponsors(id) on delete restrict,
  status                text not null default 'paid' check (status in ('paid','unpaid')),
  -- Settlement of a cost fronted by an individual. It happens in kind ("I kam
  -- rimbursu me nafte", "me fature te naftit"), so there is nothing to link to
  -- and the note IS the record.
  reimbursed            boolean not null default false,
  reimbursed_note       text,
  notes                 text,
  recorded_by           uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- The three constraints below exist so the combinations cannot go incoherent.
  -- Each one blocks a state that would produce a WRONG NUMBER, not merely an
  -- untidy row.

  -- 1. paid_by and paid_by_member_id must agree, in both directions. 'member'
  -- without a person is a debt owed to nobody — invisible in the reimbursement
  -- report, so the club silently stops owing it. 'club' with a person named is
  -- the mirror image: a debt the club does not actually have.
  constraint club_expenses_paid_by_ck
    check ((paid_by = 'member') = (paid_by_member_id is not null)),

  -- 2. An UNPAID cost has not been paid by anyone yet, so it cannot name an
  -- individual payer. The sheet's own row proves the state exists: "Servisim
  -- biciklete te Besarti ... Kesh ... pa paguar" — a method is planned, nobody
  -- has handed over money. Without this check that row could be entered as
  -- "unpaid, paid by Albioni" and would appear in the reimbursements the club
  -- owes him, for money he never spent.
  constraint club_expenses_unpaid_no_payer_ck
    check (status = 'paid' or paid_by = 'club'),

  -- 3. Only a cost fronted by an individual can be reimbursed; the club cannot
  -- reimburse itself. A stray reimbursed = true on a club-paid row is harmless
  -- looking and quietly wrong.
  constraint club_expenses_reimbursed_ck
    check (not reimbursed or paid_by = 'member')
);

-- What the screens filter and group on.
create index if not exists club_expenses_occurred_idx    on public.club_expenses(occurred_on desc);
create index if not exists club_expenses_category_idx    on public.club_expenses(category_id);
create index if not exists club_expenses_status_idx      on public.club_expenses(status);
create index if not exists club_expenses_sponsor_idx     on public.club_expenses(funding_sponsor_id);
create index if not exists club_expenses_beneficiary_idx on public.club_expenses(beneficiary_member_id);

-- "What does the club still owe its members?" is a headline figure, and it
-- reads a small slice of a growing table. A partial index keeps it exact.
create index if not exists club_expenses_owed_idx
  on public.club_expenses(paid_by_member_id)
  where paid_by = 'member' and not reimbursed;

drop trigger if exists club_expenses_updated_at on public.club_expenses;
create trigger club_expenses_updated_at before update on public.club_expenses
  for each row execute function public.set_updated_at();

-- ============================================================
-- D) RLS — the same convention the rest of the money already follows.
--
-- dues is: own read, staff read, staff write (dues_write_staff). There is no
-- "own" here to grant: an expense names a beneficiary, but the club's cost
-- ledger is not a statement the rider is entitled to see, and it exposes what
-- the club pays other people. So: admin + staff, read and write, and nobody
-- else gets any access at all. Nothing is widened.
-- ============================================================
alter table public.expense_categories enable row level security;
alter table public.club_funds         enable row level security;
alter table public.club_expenses      enable row level security;

drop policy if exists expense_categories_select_staff on public.expense_categories;
drop policy if exists expense_categories_write_staff  on public.expense_categories;
drop policy if exists club_funds_select_staff         on public.club_funds;
drop policy if exists club_funds_write_staff          on public.club_funds;
drop policy if exists club_expenses_select_staff      on public.club_expenses;
drop policy if exists club_expenses_write_staff       on public.club_expenses;

create policy expense_categories_select_staff on public.expense_categories
  for select to authenticated
  using (public.has_role(array['admin','staff']::public.user_role[]));

create policy expense_categories_write_staff on public.expense_categories
  for all to authenticated
  using       (public.has_role(array['admin','staff']::public.user_role[]))
  with check  (public.has_role(array['admin','staff']::public.user_role[]));

create policy club_funds_select_staff on public.club_funds
  for select to authenticated
  using (public.has_role(array['admin','staff']::public.user_role[]));

create policy club_funds_write_staff on public.club_funds
  for all to authenticated
  using       (public.has_role(array['admin','staff']::public.user_role[]))
  with check  (public.has_role(array['admin','staff']::public.user_role[]));

create policy club_expenses_select_staff on public.club_expenses
  for select to authenticated
  using (public.has_role(array['admin','staff']::public.user_role[]));

create policy club_expenses_write_staff on public.club_expenses
  for all to authenticated
  using       (public.has_role(array['admin','staff']::public.user_role[]))
  with check  (public.has_role(array['admin','staff']::public.user_role[]));

-- anon has no policy on any of the three, so it already sees nothing. The
-- revoke is belt and braces against a future policy being written `to public`
-- by accident: these tables are never public.
revoke all on table public.expense_categories from anon;
revoke all on table public.club_funds         from anon;
revoke all on table public.club_expenses      from anon;
