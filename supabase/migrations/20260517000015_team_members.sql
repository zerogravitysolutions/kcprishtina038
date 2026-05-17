-- 0015 — Public team roster.
--
-- Separate from `profiles` because the roster lists people who don't
-- necessarily have auth accounts (race commissaires, coaches, former
-- riders) and one person can hold multiple roles simultaneously
-- (Qëndrim is president + commissaire + rider). Profiles stays 1:1
-- with auth.users for permissions; team_members is 1 per real person
-- on the public roster.

create type public.team_position as enum (
  'president',     -- Kryetar
  'commissaire',   -- Komisar
  'coach',         -- Trajner
  'rider',         -- Çiklist / Çikliste (gender disambiguates display label)
  'mechanic',      -- Mechanic
  'physio',        -- Physiotherapist
  'staff'          -- Operations / team car / etc.
);

create type public.team_gender as enum ('m', 'f');

create type public.team_status as enum ('active', 'past');

create table public.team_members (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique check (slug ~ '^[a-z][a-z0-9-]*$'),
  full_name           text not null,
  first_name          text not null,
  last_name           text not null,
  -- Stored for UCI category derivation; the date itself is admin-only.
  dob                 date,
  gender              public.team_gender,
  positions           public.team_position[] not null default '{}'::public.team_position[]
                        check (array_length(positions, 1) >= 1),
  section_slug        text,
  photo_media_id      uuid references public.media(id) on delete set null,
  -- Source URL for the photo (often Google Drive) — kept so we can
  -- re-fetch / re-upload to Supabase Storage at any time.
  external_photo_url  text,
  status              public.team_status not null default 'active',
  -- For past members: when they left. NULL for active.
  ended_at            date,
  bio                 text,
  -- If this person also has an auth account, link it. Optional.
  profile_id          uuid references public.profiles(id) on delete set null,
  display_order       int  not null default 100,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index team_members_status_idx     on public.team_members(status, display_order);
create index team_members_positions_idx  on public.team_members using gin(positions);
create trigger team_members_updated_at before update on public.team_members
  for each row execute function public.set_updated_at();

-- RLS: public read for active rows; admins manage all.
alter table public.team_members enable row level security;
create policy team_members_select_public on public.team_members for select using (true);
create policy team_members_write_admin   on public.team_members for all to authenticated
  using       (public.has_role(array['admin','editor']::public.user_role[]))
  with check  (public.has_role(array['admin','editor']::public.user_role[]));

-- ============================================================
-- Seed — 12 active + 2 past members.
-- Photo URLs are Google Drive share links; a follow-up pass will
-- download each to the `media` bucket and link photo_media_id.
-- ============================================================
insert into public.team_members
  (slug, full_name, first_name, last_name, dob, gender, positions,
   external_photo_url, status, ended_at, display_order)
values
  ('qendrim-pllana',         'Qëndrim Pllana',         'Qëndrim',  'Pllana',
   '1991-11-30', 'm', array['president','commissaire','rider']::public.team_position[],
   'https://drive.google.com/file/d/141BXXW-kJpu_vCAuiygkY4OD02t_H5de/view',
   'active', null, 10),

  ('dorant-haxhidauti',      'Dorant Haxhidauti',      'Dorant',   'Haxhidauti',
   '1995-11-24', 'm', array['coach']::public.team_position[],
   'https://drive.google.com/file/d/1I2b6AF-VbasF1rTE2a-W1pdKHGAQIXmY/view',
   'active', null, 20),

  ('fuad-bajrami',           'Fuad Bajrami',           'Fuad',     'Bajrami',
   '1996-11-25', 'm', array['commissaire','rider']::public.team_position[],
   'https://drive.google.com/file/d/1Bypks5q9cAAY03qAvA2lt1LFHr7TidHN/view',
   'active', null, 30),

  ('albion-ymeri',           'Albion Ymeri',           'Albion',   'Ymeri',
   '1995-10-14', 'm', array['rider']::public.team_position[],
   'https://drive.google.com/file/d/1KfRMIuGfJfrggTC0UQQhAz2PYY9beSZN/view',
   'active', null, 100),

  ('arber-xhemjali',         'Arbër Xhemjali',         'Arbër',    'Xhemjali',
   '1993-07-11', 'm', array['rider']::public.team_position[],
   null, 'active', null, 100),

  ('betim-rexha',            'Betim Rexha',            'Betim',    'Rexha',
   '1990-05-21', 'm', array['rider']::public.team_position[],
   null, 'active', null, 100),

  ('sibora-kadriu',          'Sibora Kadriu',          'Sibora',   'Kadriu',
   '1999-03-18', 'f', array['rider']::public.team_position[],
   null, 'active', null, 100),

  ('aferdita-ymeri',         'Afërdita Ymeri',         'Afërdita', 'Ymeri',
   '1977-03-13', 'f', array['rider']::public.team_position[],
   null, 'active', null, 100),

  ('genc-isufi',             'Genc Isufi',             'Genc',     'Isufi',
   '2004-07-25', 'm', array['rider']::public.team_position[],
   'https://drive.google.com/file/d/1mJXWYDUUDSuYa8pzfpqIdT2y0a9g6VIL/view',
   'active', null, 100),

  ('durim-dermaku',          'Durim Dermaku',          'Durim',    'Dermaku',
   '1991-02-16', 'm', array['rider']::public.team_position[],
   'https://drive.google.com/file/d/1vrrOTdS0vULbRtfXkmLOYXYGTirh4r5J/view',
   'active', null, 100),

  ('dorina-baraku',          'Dorina Baraku',          'Dorina',   'Baraku',
   '1994-10-06', 'f', array['rider']::public.team_position[],
   'https://drive.google.com/file/d/1abwxnIKatD1Om3EOhveNTSZTaQZvsMSk/view',
   'active', null, 100),

  ('shqiponja-osmani-pllana','Shqiponja Osmani Pllana','Shqiponja','Osmani Pllana',
   '1992-01-13', 'f', array['rider']::public.team_position[],
   'https://drive.google.com/file/d/1OLo0K3pXjj4-iQIFgCDG_TyN2ydmkFBl/view',
   'active', null, 100),

  -- Past members (left at end of 2025 season).
  ('festim-kurti',           'Festim Kurti',           'Festim',   'Kurti',
   '2008-09-29', 'm', array['rider']::public.team_position[],
   'https://drive.google.com/file/d/1v6hGFEznoTAGShELBRje-aUvZfiI3G6H/view',
   'past', '2025-12-31', 200),

  ('valon-binakaj',          'Valon Binakaj',          'Valon',    'Binakaj',
   '1990-05-18', 'm', array['rider']::public.team_position[],
   'https://drive.google.com/file/d/1Ykbt1YNgx2GFKwk1-aJgJJ9hg8Y5v5R3/view',
   'past', '2025-12-31', 200);

-- Sanity (run by hand after apply):
--   select count(*) from public.team_members;            -- expect 14
--   select status, count(*) from public.team_members group by 1;
