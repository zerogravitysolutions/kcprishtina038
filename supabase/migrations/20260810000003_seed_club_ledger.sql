-- 20260810000003 — Import of the club's REAL hand-kept ledger into the tables
-- built by 20260810000002. Two spreadsheets, 69 expense rows. Nothing here is
-- invented: every row below exists on paper.
--
-- NOTE: this seed once also imported two PLEDGED sponsorships (agreed but never
-- transferred, €8,500.00 in total). The owner has since retired the
-- pledged-vs-received distinction entirely — club_funds now holds only money
-- actually received — so migration 20260816000001 drops the club_funds.status
-- column and those two rows are no longer seeded here. A fresh replay therefore
-- inserts NO club_funds rows and never touches the status column.
--
-- The previous migration deliberately imported nothing, because the sheets mix
-- date formats and guessing would misdate real records. That reading has since
-- been settled, so the data can come in.
--
-- ============================================================
-- DATE FORMATS — how each block was read, and why
-- ============================================================
--   2024 rows: M/D/YYYY. Proved by "9/23/2024" and "10/25/2024": there is no
--              month 23 or 25, so the first field must be the month.
--   2025 rows: D/M/YYYY. Proved by "14/01/2025", "28/03/2025", "13/04/2025",
--              "27/04/2025" and "18/06/2025" — first field > 12. Reading the
--              2025 block day-first also makes it run chronologically, which
--              the month-first reading does not.
--   2026 sheet: DD.MM.YYYY throughout, unambiguous.
--
-- Rows that rest on INFERENCE rather than on something written in the sheet —
-- all of them carry an Albanian note in `notes` so the owner sees it in the UI:
--
--   1. FIVE rows have NO date at all in the 2024-25 sheet. occurred_on is NOT
--      NULL, so a date had to be supplied; rather than invent a plausible one,
--      each is parked on 31 December of the year of the block it sits in:
--        2024-12-31  Fuad Bajrami €124.45 (goma conti 5000 …)
--        2024-12-31  Genc Isufi   €108.10 (2 goma conti 5000 …)
--        2025-12-31  Klubi        €206.73 (suplemente në Bike Plus)
--        2025-12-31  Klubi        €219.35 (pajisje sportive — Bike Plus)
--        2025-12-31  Klubi        €100.00 (servisim i biçikletave të Besartit)
--      These five are the ONLY rows whose date is not from the sheet.
--
--   2. Two 2026 rows have no description text in the sheet, and description is
--      NOT NULL:
--        19.01.2026 servisim, no amount — described from the sheet's own
--          wording quoted in migration 20260810000002 ("Servisim biciklete te
--          Besarti … Kesh … pa paguar").
--        19.01.2026 invoice 26-SHV01-005-274, €112.71 — described with the
--          category name, and the note says so.
--
--   3. Nicknames in the "Pagoi" column are resolved to full roster names:
--      Albioni = Albion Ymeri, Qendrimi = Qëndrim Pllana, Durimi = Durim
--      Dermaku, Doranti = Dorant Haxhidauti. "Klubi" in the Ciklisti column is
--      the club itself and becomes beneficiary_member_id = NULL.
--
-- ============================================================
-- ARITHMETIC — the 2024-25 sheet's own total is WRONG
-- ============================================================
-- The sheet states a total of €2,593.03. The 39 rows below add up to
-- €2,693.03 — exactly €100.00 more. NOTHING WAS ADJUSTED to make the stated
-- total come out; the rows are imported as written and the discrepancy is left
-- visible on purpose.
-- The likeliest single explanation is the undated €100.00 row "Servisim i
-- biçikletave të Besartit për Kampionat të Kosovës": it is the only €100.00
-- line that also has no date, i.e. the signature of a line appended below the
-- SUM() range after the total had been computed. Three other €100.00 rows
-- exist (Gara e Kavajës, Kuotizimi 2025, and the 2026 Kamenica row which is on
-- the other sheet), so this is a judgement, not a proof. The owner should
-- check which line their spreadsheet total excludes.
-- For reference: the 2026 sheet's 29 priced rows total €6,693.97, plus one row
-- with no agreed amount, which no total may count as zero.
--
-- ============================================================
-- IDEMPOTENCY
-- ============================================================
-- This migration auto-applies to a live database and may be re-run. Every row
-- carries a HARDCODED primary key (a uuid v5 derived from a stable import key)
-- and every insert ends in `on conflict (id) do nothing`.
--
-- A natural key of (occurred_on, description, amount_eur) was rejected: the
-- header above explicitly ASKS the owner to correct the five invented dates and
-- the two supplied descriptions, and the moment they do, a natural key stops
-- matching and a re-run would duplicate exactly the rows we told them to touch.
-- A fixed primary key survives every edit to every other column.
--
-- On top of that, the whole block returns early if the first imported row is
-- already present, so a re-run does no work at all and — importantly — does not
-- resurrect rows the owner has deliberately deleted. If that one marker row is
-- itself deleted, the per-row `on conflict` still prevents any duplication;
-- only the marker row would come back.
--
-- recorded_by is NULL on every row: nobody entered these in the app, they are
-- an import of paper records.

do $$
declare
  -- Roster (resolved by exact full_name — they all exist).
  m_albion   uuid;
  m_qendrim  uuid;
  m_valon    uuid;
  m_festim   uuid;
  m_fuad     uuid;
  m_genc     uuid;
  m_betim    uuid;
  m_dorant   uuid;
  m_durim    uuid;
  m_dorina   uuid;
  m_sibora   uuid;

  -- Categories (resolved by the `code` seeded in 20260810000002).
  c_pajisje    uuid;
  c_derivate   uuid;
  c_suplemente uuid;
  c_gara       uuid;
  c_stervitje  uuid;
  c_servisim   uuid;
  c_ushqim     uuid;
  c_udhetim    uuid;
  c_pagesa     uuid;
  c_kuotizim   uuid;
  c_cash       uuid;

  -- Sponsors (Burimi column).
  s_novus    uuid;
  s_bikeplus uuid;

  v_missing text;

  -- Notes shown to the owner, in Albanian.
  n_nodate constant text :=
    'Data e saktë mungonte në fletën origjinale të klubit; këtu është vendosur 31 dhjetori i atij viti vetëm si vendmbajtëse — korrigjoje kur ta gjesh datën e vërtetë.';
  n_transfer constant text :=
    'Nevojitet transferi nga sponsori: shpenzimi u mbulua nga klubi, ndërsa mjetet e sponsorit ende nuk kanë mbërritur.';

  -- First row of the import; its presence means the import already ran.
  marker constant uuid := 'b9eecc37-1999-54d7-a0ae-b3debb87c215';
begin
  if exists (select 1 from public.club_expenses where id = marker) then
    raise notice 'club ledger already imported — nothing to do';
    return;
  end if;

  -- ------------------------------------------------------------
  -- Resolve every lookup FIRST and abort loudly if any misses.
  --
  -- This is the point of the whole block. beneficiary_member_id = NULL is not
  -- "unknown", it MEANS the club itself, so a lookup that quietly returned
  -- NULL would silently reclassify a rider's cost as a club cost and the
  -- per-rider report would understate that rider forever. An exception rolls
  -- the migration back instead; a missing person is a data problem to fix, not
  -- a row to guess at.
  -- ------------------------------------------------------------
  select string_agg(n, ', ') into v_missing
  from unnest(array[
    'Albion Ymeri','Qëndrim Pllana','Valon Binakaj','Festim Kurti','Fuad Bajrami',
    'Genc Isufi','Betim Rexha','Dorant Haxhidauti','Durim Dermaku','Dorina Baraku',
    'Sibora Kadriu'
  ]) as n
  where not exists (select 1 from public.team_members t where t.full_name = n);
  if v_missing is not null then
    raise exception 'club ledger seed: team_members not found by full_name: %', v_missing;
  end if;

  -- `into strict` also fails loudly if a name is ambiguous (two rows).
  select id into strict m_albion  from public.team_members where full_name = 'Albion Ymeri';
  select id into strict m_qendrim from public.team_members where full_name = 'Qëndrim Pllana';
  select id into strict m_valon   from public.team_members where full_name = 'Valon Binakaj';
  select id into strict m_festim  from public.team_members where full_name = 'Festim Kurti';
  select id into strict m_fuad    from public.team_members where full_name = 'Fuad Bajrami';
  select id into strict m_genc    from public.team_members where full_name = 'Genc Isufi';
  select id into strict m_betim   from public.team_members where full_name = 'Betim Rexha';
  select id into strict m_dorant  from public.team_members where full_name = 'Dorant Haxhidauti';
  select id into strict m_durim   from public.team_members where full_name = 'Durim Dermaku';
  select id into strict m_dorina  from public.team_members where full_name = 'Dorina Baraku';
  select id into strict m_sibora  from public.team_members where full_name = 'Sibora Kadriu';

  select string_agg(c, ', ') into v_missing
  from unnest(array[
    'pajisje_sportive','derivate','suplemente','gara','stervitje_grupore',
    'servisim','ushqim','udhetim','pagesa_angazhime','kuotizim_taksa','cash'
  ]) as c
  where not exists (select 1 from public.expense_categories e where e.code = c);
  if v_missing is not null then
    raise exception 'club ledger seed: expense_categories not found by code: %', v_missing;
  end if;

  select id into strict c_pajisje    from public.expense_categories where code = 'pajisje_sportive';
  select id into strict c_derivate   from public.expense_categories where code = 'derivate';
  select id into strict c_suplemente from public.expense_categories where code = 'suplemente';
  select id into strict c_gara       from public.expense_categories where code = 'gara';
  select id into strict c_stervitje  from public.expense_categories where code = 'stervitje_grupore';
  select id into strict c_servisim   from public.expense_categories where code = 'servisim';
  select id into strict c_ushqim     from public.expense_categories where code = 'ushqim';
  select id into strict c_udhetim    from public.expense_categories where code = 'udhetim';
  select id into strict c_pagesa     from public.expense_categories where code = 'pagesa_angazhime';
  select id into strict c_kuotizim   from public.expense_categories where code = 'kuotizim_taksa';
  select id into strict c_cash       from public.expense_categories where code = 'cash';

  -- Sponsors are matched case- and space-insensitively because the sheet writes
  -- "NOVUS"/"Novus" and "Bike Plus"/"BikePlus". The normalisation deliberately
  -- does NOT collapse "BikePlus KS" into "BikePlus": they are separate sponsor
  -- rows and charging one budget against the other would be a real error.
  select id into s_novus from public.sponsors
   where lower(btrim(name)) = 'novus'
   order by created_at asc limit 1;
  select id into s_bikeplus from public.sponsors
   where lower(replace(btrim(name), ' ', '')) = 'bikeplus'
   order by created_at asc limit 1;
  if s_novus is null then
    raise exception 'club ledger seed: sponsor "Novus" not found in public.sponsors';
  end if;
  if s_bikeplus is null then
    raise exception 'club ledger seed: sponsor "BikePlus" not found in public.sponsors';
  end if;

  -- ============================================================
  -- SHEET A — 2024-2025. 39 rows.
  -- All paid, all out of the club account (paid_by = 'club'), no invoice
  -- numbers and no payment method recorded: the sheet has no such column, and
  -- guessing 'cash' would be an invention. payment_method stays NULL.
  -- ============================================================
  insert into public.club_expenses (
    id, occurred_on, category_id, description, amount_eur,
    beneficiary_member_id, paid_by, status, notes
  ) values
    ('b9eecc37-1999-54d7-a0ae-b3debb87c215', date '2024-09-23', c_pajisje,
     '2 goma continental 5000 tubeless', 160.00, m_albion, 'club', 'paid', null),
    ('f2d0702a-20c6-5c4d-b24d-5e30cf1c2c8d', date '2024-03-10', c_pajisje,
     'Shirit timoni, zingjir biciklete, gel sportiv x8', 55.70, m_albion, 'club', 'paid', null),
    ('d5e932a1-6ac4-5076-ab7a-688761333aaa', date '2024-01-10', c_pajisje,
     'Syze dielli, zingjir biciklete, tape force, vaj zingjirve, kasetë, çorape overshoes',
     141.50, m_albion, 'club', 'paid', null),
    ('9c69c15f-651f-5aaf-8805-dc27182f9679', date '2024-01-10', c_pajisje,
     'Syze dielli, vegla multi, pompë', 102.40, m_qendrim, 'club', 'paid', null),
    ('6bf04504-b35c-5673-b953-7ba1f4a30022', date '2024-01-10', c_pajisje,
     '2 goma conti 5000 clincher, 2 goma të brendshme, 1 vaj zingjirve',
     111.65, m_valon, 'club', 'paid', null),
    ('00bf6bd3-f0fe-5c1a-8983-25984a3c22c0', date '2024-01-10', c_pajisje,
     '2 goma të brendshme, çorape overshoes', 20.45, m_festim, 'club', 'paid', null),
    -- No date in the sheet.
    ('fc22f23e-6410-5991-803d-fed467d87430', date '2024-12-31', c_pajisje,
     '2 goma conti 5000, 2 goma të brendshme, çorape overshoes',
     124.45, m_fuad, 'club', 'paid', n_nodate),
    -- No date in the sheet.
    ('ab79c147-3fa3-55c4-a6dd-cc3edb7f07e3', date '2024-12-31', c_pajisje,
     '2 goma conti 5000, 2 goma të brendshme', 108.10, m_genc, 'club', 'paid', n_nodate),
    ('92004efe-cd83-54e3-84a5-7f52ad0b92ed', date '2024-10-25', c_cash,
     'Ndihmesë për blerjen e biçikletës së re', 200.00, m_festim, 'club', 'paid', null),
    ('b20eef14-4f00-54b7-9f62-531fa6b4118c', date '2024-10-25', c_cash,
     'Pagesa për përcjellje në gara', 50.00, m_dorant, 'club', 'paid', null),
    ('4d01a0de-453d-5cdf-9edb-96a32a24695f', date '2024-10-25', c_derivate,
     'Pagesa për derivate për garën e Kamenicës', 20.00, m_valon, 'club', 'paid', null),
    ('427992fc-6f19-5e52-8fc7-37f5a052739c', date '2024-01-11', c_pajisje,
     '2 goma tubular continental, 3 shishe uji', 103.00, m_betim, 'club', 'paid', null),
    ('9d1445ec-99ae-5022-ae14-4053c44f2f4e', date '2024-01-11', c_pajisje,
     'Çorape overshoes të vogla dhe tubeless repair kit', 18.90, m_albion, 'club', 'paid', null),
    ('c303acdf-fb84-51e2-8e9b-b1d0633c630a', date '2025-01-14', c_suplemente,
     'Suplemente', 79.30, m_festim, 'club', 'paid', null),
    ('123094bd-dcce-56f6-9270-8f7815b4e40f', date '2025-01-09', c_derivate,
     'Derivate', 50.00, m_albion, 'club', 'paid', null),
    ('594fc054-a545-5081-a983-7bdbb976c196', date '2025-03-28', c_gara,
     'Mbulesa e shpenzimeve për Garën e Kavajës', 100.00, m_valon, 'club', 'paid', null),
    ('6a06730d-fb77-5377-a4bc-189ef71e78ca', date '2025-03-28', c_kuotizim,
     'Kuotizimi për vitin 2025', 100.00, null, 'club', 'paid', null),
    ('cfec69ac-abca-5986-aa93-4d8c7f70ccc0', date '2025-04-05', c_stervitje,
     'Stërvitje grupore', 40.00, null, 'club', 'paid', null),
    ('81030860-2927-5ad4-9870-2b82b6a00bf2', date '2025-04-13', c_gara,
     'Gara e Mitrovicës', 40.00, null, 'club', 'paid', null),
    ('7d888c17-e8f7-5725-b8dc-835d7475c013', date '2025-04-16', c_servisim,
     'Servisim biçiklete të Besartit', 10.00, m_albion, 'club', 'paid', null),
    ('3b85d1ee-19a0-57f6-a0e8-d8543378fb5e', date '2025-04-17', c_pajisje,
     'Sealant dhe pastrues zingjirve', 10.00, m_albion, 'club', 'paid', null),
    ('a8611527-ae6a-591d-ade3-b8b18f5bf56c', date '2025-04-27', c_gara,
     'Gara e Ferizajit (derivate dhe ushqim)', 32.50, null, 'club', 'paid', null),
    ('b6ae9c4e-79b3-55a1-bab2-0f0b1f4e1576', date '2025-05-01', c_stervitje,
     '15 euro derivate, 18 euro ushqim dhe kafe', 33.00, null, 'club', 'paid', null),
    ('acb623de-2331-511f-96de-d2a04de99f36', date '2025-05-03', c_servisim,
     'Servis', 5.00, m_festim, 'club', 'paid', null),
    ('9f10603c-d2a2-5f43-9601-d0257115cdc3', date '2025-06-08', c_stervitje,
     'Stërvitje grupore më 8 qershor +150 km', 50.00, null, 'club', 'paid', null),
    ('63474594-07b6-56bc-a6b9-59a94f613402', date '2025-06-18', c_pajisje,
     'Ndihmesë për blerjen e rrotave të reja', 50.00, m_valon, 'club', 'paid', null),
    ('7b9c4cd4-3918-5b9f-b3f0-c873229d41fd', date '2025-06-15', c_suplemente,
     'Suplemente për Prizren Cup', 20.00, m_valon, 'club', 'paid', null),
    ('d01ea0fa-69ee-5017-895a-fd11c871f6b0', date '2025-06-18', c_pajisje,
     'Pjesë', 20.00, m_fuad, 'club', 'paid', null),
    ('21069e5b-e7e5-567a-a3c4-9affc5ae9395', date '2025-06-20', c_derivate,
     'Derivate për Kampionatin e Kosovës', 40.00, m_dorant, 'club', 'paid', null),
    ('096303de-0383-595f-9067-f3a642aed555', date '2025-06-20', c_ushqim,
     'Ushqim për Kampionatin e Kosovës', 20.00, m_qendrim, 'club', 'paid', null),
    ('e18c2a6c-a280-51ce-9edf-4c7638d1ca81', date '2025-06-20', c_derivate,
     'Derivate për Kampionatin e Kosovës', 20.00, m_betim, 'club', 'paid', null),
    ('0d7466a4-1905-586b-ad87-6d89f55231f5', date '2025-06-20', c_derivate,
     'Derivate për 2 ditë në Kampionatin e Kosovës', 50.00, m_albion, 'club', 'paid', null),
    ('15b03fbb-5d7e-59ec-8fea-2735296de63a', date '2025-06-28', c_cash,
     'Terapia pas rrëzimit me biçikletë', 47.00, m_valon, 'club', 'paid', null),
    ('2d2acad5-7569-5e4e-ad4d-fb5d1be32ee1', date '2025-07-14', c_derivate,
     'Ushtrime grupore — Pejë-Gjeravicë', 20.00, m_albion, 'club', 'paid', null),
    ('847b9d98-5d41-53a0-9c47-6112b7abf476', date '2025-08-03', c_gara,
     'Mbulimi i shpenzimeve për garën Sharr Cup në Tetovë — derivate, pije, ushqim, tarifa rrugore',
     86.00, null, 'club', 'paid', null),
    -- No date in the sheet.
    ('410966bb-5cbf-55cf-a2ef-fbe3fe17e1d8', date '2025-12-31', c_suplemente,
     'Shpenzime të kampionatit — suplemente në Bike Plus', 206.73, null, 'club', 'paid', n_nodate),
    -- No date in the sheet.
    ('aa543e75-81d7-5358-b9a7-a2c09ac52c21', date '2025-12-31', c_pajisje,
     'Pajisje sportive — Bike Plus', 219.35, null, 'club', 'paid', n_nodate),
    ('8d257ad8-b8e4-5255-a0eb-5ea54ac98864', date '2025-08-05', c_kuotizim,
     'Noterizimi i marrëveshjes me BikePlus', 28.00, null, 'club', 'paid', null),
    -- No date in the sheet. This is also the row that most likely explains why
    -- the sheet's stated total (€2,593.03) is €100.00 short of these 39 rows.
    ('163850fd-c9ec-5437-bf5c-1d38aa89542f', date '2025-12-31', c_servisim,
     'Servisim i biçikletave të Besartit për Kampionat të Kosovës', 100.00, null, 'club', 'paid',
     n_nodate || ' Kjo rresht duket se nuk është përfshirë në totalin e fletës (€2.593,03), i cili del €100,00 më i vogël se shuma e rreshtave.')
  on conflict (id) do nothing;

  -- ============================================================
  -- SHEET B — 2026. 30 rows.
  --
  -- Three states from the sheet that the CHECK constraints police, and how
  -- they are encoded here:
  --   * 19.01.2026 has no amount and is "pa paguar" -> amount_eur NULL,
  --     status 'unpaid', paid_by 'club' with no payer named. A NULL amount is
  --     not zero and an unpaid cost has no individual payer yet
  --     (club_expenses_unpaid_no_payer_ck).
  --   * "Pagoi: Albioni / Qendrimi / Durimi" -> paid_by 'member' plus the
  --     person, i.e. money the club OWES them (club_expenses_paid_by_ck).
  --   * "I kam rimbursu me nafte" -> reimbursed = true with the note kept
  --     verbatim; only a member-fronted cost can be reimbursed
  --     (club_expenses_reimbursed_ck).
  -- ============================================================
  insert into public.club_expenses (
    id, occurred_on, category_id, description, amount_eur,
    beneficiary_member_id, invoice_no, payment_method,
    paid_by, paid_by_member_id, funding_sponsor_id,
    status, reimbursed, reimbursed_note, notes
  ) values
    -- No amount agreed yet, and nobody has paid: the row the nullable
    -- amount_eur exists for. Description taken from the sheet's own wording.
    ('fcefabe6-295a-586c-9ae4-8b401ef7671f', date '2026-01-19', c_servisim,
     'Servisim i biçikletës së Besartit', null,
     m_albion, null, 'cash', 'club', null, null,
     'unpaid', false, null,
     'Shuma nuk ishte caktuar në fletën origjinale; shpenzimi mbetet i papaguar derisa të merret vesh vlera.'),
    ('b60734fd-27bf-5fcd-bc01-405ee676b740', date '2026-01-19', c_pajisje,
     'Pajisje sportive', 112.71,
     m_albion, '26-SHV01-005-274', 'transfer', 'club', null, s_novus,
     'paid', false, null,
     n_transfer || ' Përshkrimi nuk ishte shënuar në fletën origjinale; këtu është vendosur emri i kategorisë.'),
    ('6fc562be-b24d-5678-8bce-51f444daa0fa', date '2026-02-04', c_pajisje,
     'Smart Trainer', 450.00,
     null, '26-SHV01-005-814', 'transfer', 'club', null, s_novus,
     'paid', false, null, n_transfer),
    ('ac03447a-1ace-5da6-bd08-8b395e4d3b1b', date '2026-03-12', c_pajisje,
     'Biçikletë garuese e re (Giant Propel)', 3528.92,
     m_albion, '9003043238', 'transfer', 'member', m_durim, s_novus,
     'paid', false, null, null),
    ('b8c84b0b-98cf-5903-a56e-27a574b85c69', date '2026-04-05', c_gara,
     'Pjesëmarrja në garën e Kamenicës (60 euro shpenzime + 40 euro meditje Doranti)', 100.00,
     null, null, 'cash', 'member', m_qendrim, null,
     'paid', false, null, null),
    ('0a11084d-87d9-5cce-82e3-6510688e896e', date '2026-04-13', c_udhetim,
     'Biletë fluturimi Prishtinë-Zvicër-Prishtinë', 206.00,
     m_albion, '770824351', 'transfer', 'club', null, s_novus,
     'paid', false, null, n_transfer),
    ('6212baa9-a209-5ed4-8647-e4fcf4351e86', date '2026-04-16', c_udhetim,
     'Pagesa për biçikletën për fluturim', 130.13,
     m_albion, null, 'transfer', 'club', null, s_novus,
     'paid', false, null, n_transfer),
    ('b42add48-0b7c-5b97-a09b-0d7977c95b69', date '2026-04-22', c_pajisje,
     'Pedalet për biçikletë', 143.41,
     m_albion, '186', 'transfer', 'member', m_albion, s_novus,
     'paid', false, null, null),
    ('94271d2e-9910-58f9-a3b4-1373fc15ef1e', date '2026-04-26', c_pajisje,
     'Pajisje sportive, 5 artikuj', 412.14,
     m_albion, '9003380867', 'transfer', 'club', null, s_novus,
     'paid', false, null, n_transfer),
    ('a9b4e51c-2cf1-5869-82fd-f8134b9c17fc', date '2026-04-27', c_pajisje,
     '2 goma të jashtme continental grand prix 5000', 173.65,
     m_albion, null, 'transfer', 'member', m_albion, s_novus,
     'paid', false, null, null),
    ('f6559a5f-65e3-526d-9917-7484b9f78a9b', date '2026-04-29', c_udhetim,
     'Biletë treni', 32.60,
     m_albion, null, 'transfer', 'member', m_albion, s_novus,
     'paid', false, null, null),
    ('03a82258-871a-5f82-a9c4-d9783584e789', date '2026-04-30', c_pajisje,
     '3 maica dhe 3 palë çorape sportive', 88.86,
     m_albion, null, 'transfer', 'club', null, s_novus,
     'paid', false, null, n_transfer),
    ('a53e4c1e-e57b-5005-83b5-38f66ae24048', date '2026-05-06', c_pajisje,
     'Pajisje sportive, 4 artikuj', 64.56,
     null, null, 'transfer', 'club', null, s_novus,
     'paid', false, null, n_transfer),
    ('fd5816b2-f2fb-5425-bb4d-40ae92bfee22', date '2026-05-06', c_suplemente,
     'Suplemente', 29.60,
     m_albion, null, 'transfer', 'club', null, s_novus,
     'paid', false, null, n_transfer),
    ('286233c6-0933-5193-be15-f90bf3485158', date '2026-05-17', c_gara,
     'Pjesëmarrja në garën PRV-DO në Shkup — 60 euro regjistrime online, 15 euro rimbursim Fuadit, 30 euro derivate për Betimin, 5 euro pije',
     110.00, null, null, 'cash', 'club', null, null,
     'paid', false, null, null),
    ('0efc527d-17e5-5b22-9995-accca665fe78', date '2026-05-18', c_pajisje,
     'Pedale për biçikletë 40 euro, 2 mbajtëse për shishe 10 euro', 50.00,
     m_dorina, null, 'cash', 'member', m_albion, null,
     'paid', true, 'I kam rimbursuar me faturë të naftës', null),
    ('2587af04-cf64-5ddd-a8af-fc9628733c94', date '2026-06-17', c_servisim,
     'Servisim i biçikletës Giant', 40.00,
     m_albion, null, 'cash', 'member', m_albion, null,
     'paid', true, 'I kam rimbursuar me faturë të naftës', null),
    ('0d028665-0929-5e10-abc2-a534ceb21d1a', date '2026-06-17', c_pajisje,
     '2 goma të jashtme dhe 3 helmeta për TT për Kampionatin e Kosovës', 143.00,
     null, '26-shv01-005-2239', 'transfer', 'club', null, null,
     'paid', false, null, null),
    ('213e468c-2526-5a83-803d-6145a510392f', date '2026-06-18', c_suplemente,
     'Suplemente për Kampionatin e Kosovës', 66.50,
     null, '26-shv01-005-2253', 'transfer', 'club', null, null,
     'paid', false, null, null),
    ('8d8f446e-9846-56ac-9c6e-1174c2ad3ab4', date '2026-06-22', c_suplemente,
     'Suplemente për Kampionatin e Kosovës', 21.84,
     null, '26-shv01-005-2292', 'transfer', 'club', null, null,
     'paid', false, null, null),
    ('1a76743f-c35b-5ee9-b522-14dc3f1659b3', date '2026-06-23', c_pajisje,
     'Gumica frenimi shimano', 28.00,
     m_sibora, '005901/2026', 'transfer', 'club', null, null,
     'paid', false, null, null),
    ('daa13156-07d1-5a43-886d-e502546044f2', date '2026-06-23', c_pajisje,
     'Maicë çiklizmi në Bike Plus', 30.00,
     m_albion, null, 'cash', 'member', m_albion, null,
     'paid', true, 'I kam rimbursuar me naftë', null),
    ('4cf01928-0db4-5359-b448-7ce19230b425', date '2026-06-24', c_pagesa,
     'Pagesë për Dorantin për angazhim në Kampionatin e Kosovës', 100.00,
     m_dorant, null, 'cash', 'member', m_albion, null,
     'paid', true, 'I kam rimbursuar me naftë', null),
    ('e72e66ac-dd28-5c80-b52f-510fefadd566', date '2026-06-25', c_derivate,
     'Derivate për Kampionatin e Kosovës', 70.00,
     m_albion, '603510', 'transfer', 'club', null, null,
     'paid', false, null, null),
    ('c04a6c66-0890-5ca6-9b72-da72b60096cf', date '2026-06-25', c_ushqim,
     'Drekë me anëtarët e klubit pas garës së Kampionatit', 88.50,
     null, '1', 'transfer', 'club', null, null,
     'paid', false, null, null),
    ('06a34c1c-7cd5-524f-96e0-aaa8c9651e25', date '2026-07-02', c_pajisje,
     'Maicë çiklizmi dhe syze', 91.74,
     null, '26-shv01-005-2437', 'transfer', 'club', null, null,
     'paid', false, null, null),
    ('00508a25-a993-5835-9dfa-12d68c648eb1', date '2026-07-02', c_pajisje,
     '20 shishe çiklizmi, sealant, degreaser, çorape çiklizmi 3 palë', 125.18,
     null, '26-shv01-00502436', 'transfer', 'club', null, null,
     'paid', false, null, null),
    ('28019ef3-4f0c-54aa-97d4-babf0f7f6ee7', date '2026-07-02', c_pajisje,
     'Vendosja e logos në 5 maica', 30.00,
     null, null, 'cash', 'member', m_albion, null,
     'paid', true, 'I kam rimbursuar me naftë', null),
    ('5a10f15d-6ecd-5310-a27c-a111c91eb85e', date '2026-07-29', c_pajisje,
     'Maicë çiklizmi e bardhë, syze redbull, suplemente dhe mbrojtëse zingjiri', 126.63,
     null, '26-shv01-00502762', 'transfer', 'club', null, null,
     'paid', false, null, null),
    ('a0012a04-28af-5272-a52b-17d2c570271b', date '2026-07-31', c_pagesa,
     'Pagesë për Dorantin për muajin gusht', 100.00,
     m_dorant, null, 'cash', 'member', m_albion, null,
     'paid', true, 'I kam rimbursuar me naftë', null)
  on conflict (id) do nothing;

  -- ============================================================
  -- FUNDS — none.
  --
  -- This seed once inserted two PLEDGED sponsorships here (Novus €6,000 and
  -- BikePlus €2,500, "nevojiten edhe 2 transferet e sponsorit"), agreed on
  -- 06.05.2026 but never transferred into the club account. The owner retired
  -- the pledged-vs-received distinction, so club_funds now records only money
  -- actually received. Those two rows are no longer seeded, and migration
  -- 20260816000001 drops the club_funds.status column entirely. There is no
  -- club_funds insert on a fresh replay.
  -- ============================================================
end $$;

-- Sanity (run by hand after apply):
--   select count(*) from public.club_expenses;                        -- expect 69
--   select sum(amount_eur) from public.club_expenses
--     where occurred_on < date '2026-01-01';                          -- expect 2693.03
--   select sum(amount_eur), count(*) filter (where amount_eur is null)
--     from public.club_expenses where occurred_on >= date '2026-01-01';
--                                                                     -- expect 6693.97, 1
--   select count(*) from public.club_funds;                          -- expect 0
--   select count(*) from public.club_expenses
--     where paid_by = 'member' and not reimbursed;                     -- expect 5 (owed)
