-- 0019 — Race events as first-class records, curated once from FB posts.
--
-- /races used to be driven by news.tags @> ['race'] populated by a regex
-- in the sync-facebook Edge Function. That mixed actual races with
-- welcomes, recruiting calls, FÇK assembly photos, etc. — anything that
-- happened to use a race-related word.
--
-- This migration replaces that with a curated public.race_events table.
-- Each row is one real race the club participated in (or hosted). Multiple
-- FB news posts about the same race (announcement + race day + results +
-- gallery) all link to ONE race_events row via news.race_event_id.
--
-- Going forward this stays a manual catalog: admin can edit / add races
-- by hand. The Edge Function no longer auto-tags news as 'race'.

create type public.race_type as enum (
  'road',         -- rrugore
  'mtb',          -- mountain bike / XCO
  'tt',           -- kronometer / time trial
  'stage',        -- multi-day / stage races (Tour of …)
  'gravel',
  'cyclocross'
);

create table public.race_events (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  name            text not null,
  race_date       date not null,
  location        text,
  race_type       public.race_type,
  organizer       text,
  description     text,
  result_summary  text,
  cover_media_id  uuid references public.media(id) on delete set null,
  external_url    text,            -- e.g. FB event link or organizer site
  display_order   int  not null default 100,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index race_events_date_idx on public.race_events(race_date desc);
create trigger race_events_updated_at before update on public.race_events
  for each row execute function public.set_updated_at();

alter table public.news
  add column race_event_id uuid references public.race_events(id) on delete set null;
create index news_race_event_idx on public.news(race_event_id, published_at desc);

-- RLS: public read; admin/editor write.
alter table public.race_events enable row level security;
create policy race_events_select_all on public.race_events for select using (true);
create policy race_events_write_admin on public.race_events for all to authenticated
  using       (public.has_role(array['admin','editor']::public.user_role[]))
  with check  (public.has_role(array['admin','editor']::public.user_role[]));

-- ============================================================
-- Seed — 17 curated race events from inspection of all 32 race-tagged
-- FB news posts. Race date is the date the race actually happened
-- (not the date posted on FB). location & organizer pulled from post
-- body where stated.
-- ============================================================
insert into public.race_events
  (slug, name, race_date, location, race_type, organizer, description) values
  -- 2023 -----------------------------------------------------------
  ('cross-country-prishtina-2023',  'Cross Country Prishtina 2023',  '2023-06-04', 'Park nacional Germia, Prishtinë',   'mtb',   'FÇK',                       'Gara e parë XCO në Germi me triumf të Albion Ymerit.'),
  ('kampionati-triatlonit-2023',     'Kampionati i Triatlonit 2023',  '2023-07-31', 'Kosovë',                            null,    'Federata e Triatlonit',     'Albion Ymeri triumfon në kampionatin e triatlonit.'),
  ('kupa-mitrovices-2023',           'Kupa e Mitrovicës 2023',        '2023-08-06', 'Mitrovicë',                         'road',  'KÇ Trepça + FÇK',           'Garë rrugore me terren me kthesa të shumta.'),
  ('tour-of-kosova-2023',            'Tour of Kosova 2023',           '2023-09-09', 'Kosovë',                            'stage', 'FÇK',                       'Gara më e madhe e ciklizmit në Kosovë, me ekipe nga 13 shtete.'),

  -- 2024 -----------------------------------------------------------
  ('shtime-2024',                    'Garë rrugore Shtime 2024',      '2024-05-08', 'Shtime',                            'road',  'FÇK + KÇ Vjosa',            'Garë rrugore me organizim të KÇ Vjosa.'),
  ('tour-of-albania-2024',           'Tour of Albania 2024',          '2024-05-20', 'Shqipëri',                          'stage', 'Federata Shqiptare',         'Valon Binakaj në kombëtaren e Kosovës.'),
  ('kupa-prizrenit-2024',            'Kupa e Prizrenit 2024',         '2024-06-02', 'Prizren',                           'road',  'FÇK',                       'Garë rrugore prej 80 km me 5 çiklistë të klubit.'),
  ('kampionati-kosoves-2024',        'Kampionati i Kosovës 2024',     '2024-06-22', 'Kosovë',                            'road',  'FÇK',                       'Kampionati kombëtar, 21–22 qershor 2024, me rezultate të shkëlqyera.'),
  ('kupa-anamoraves-2024',           'Kupa e Anamoravës 2024',        '2024-08-04', 'Kamenicë',                          'road',  'FÇK',                       'Klubi mori pjesë me 5 çiklistë në kategoritë Elite, U23 dhe Hobi.'),

  -- 2025 -----------------------------------------------------------
  ('trofeu-26-marsi-2025',           'Trofeu 26 Marsi 2025',          '2025-03-26', 'Kavajë, Shqipëri',                  'road',  'Federata Shqiptare',         'Gara hapëse e sezonit 2025 nga Federata Shqiptare e Çiklizmit.'),
  ('ferizaj-kastrioti-2025',         'Garë Ferizaj 2025',             '2025-04-27', 'Ferizaj',                           'road',  'KÇ Kastrioti + FÇK',        'Festim Kurti, një nga talentet, përfaqësoi klubin.'),
  ('kampionati-kosoves-2025',        'Kampionati i Kosovës 2025',     '2025-06-21', 'Bibaj–Malishevë–Bibaj',             'road',  'FÇK',                       'Kronometer (20 qershor) + Gara Rrugore (21 qershor) në Bibaj.'),
  ('sharr-cup-2025',                 'Sharr Cup 2025',                '2025-08-03', 'Sharri (Brezovicë)',                'mtb',   'Sharr Cup',                 'Një nga garat më sfiduese malore të rajonit. 5 çiklistë të klubit.'),
  ('tour-of-kosova-2025',            'Tour of Kosova 2025',           '2025-09-04', 'Kosovë',                            'stage', 'FÇK',                       'Valon Binakaj dhe Betim Rexha në kombëtaren e Kosovës.'),
  ('trofeu-gilman-bakalli-2025',     'Trofeu Gilman Bakalli 2025',    '2025-10-26', 'Shkodër, Shqipëri',                 'mtb',   'Federata Shqiptare',         'MTB Cross Country 42 km. Festim Kurti i parë.'),
  ('kupa-prishtina-2025',            'Kupa Prishtina 2025',           '2025-11-02', 'Prishtinë (Shell / Veternik)',      'road',  'KÇ Prishtina 038 + FÇK',    'Edicioni i parë i Kupës Prishtina, e organizuar nga klubi ynë. 135 km për Elite/U23/Junior, plus kategori Hobi.');

-- ============================================================
-- Link news posts to their race_event by slug. The mapping below was
-- built by inspecting all 32 race-tagged news rows.
-- ============================================================
update public.news n set race_event_id = re.id
from public.race_events re
where (re.slug, n.slug) in (
  -- 2023
  ('cross-country-prishtina-2023',  'fb-159899350393814'),
  ('kampionati-triatlonit-2023',    'fb-194388740278208'),
  ('kupa-mitrovices-2023',          'fb-198553433195072'),
  ('tour-of-kosova-2023',           'fb-216545334729215'),
  -- 2024
  ('shtime-2024',                   'fb-361297033587377'),
  ('tour-of-albania-2024',          'fb-368842602832820'),
  ('kupa-prizrenit-2024',           'fb-375585972158483'),
  ('kupa-prizrenit-2024',           'fb-377262498657497'),
  ('kampionati-kosoves-2024',       'fb-389492847434462'),
  ('kupa-anamoraves-2024',          'fb-415549931495420'),
  -- 2025
  ('trofeu-26-marsi-2025',          'fb-578151295235282'),
  ('ferizaj-kastrioti-2025',        'fb-602433262807085'),
  ('kampionati-kosoves-2025',       'fb-641064412277303'),
  ('kampionati-kosoves-2025',       'fb-642216648828746'),
  ('sharr-cup-2025',                'fb-677751648608579'),
  ('tour-of-kosova-2025',           'fb-700674946316249'),
  ('trofeu-gilman-bakalli-2025',    'fb-743629838687426'),
  -- Kupa Prishtina 2025: 5 related posts (announcement, distances, summary, 3 result posts)
  ('kupa-prishtina-2025',           'fb-742761232107620'),
  ('kupa-prishtina-2025',           'fb-746156811768062'),
  ('kupa-prishtina-2025',           'fb-749378181445925'),
  ('kupa-prishtina-2025',           'fb-750665561317187'),
  ('kupa-prishtina-2025',           'fb-750964811287262'),
  ('kupa-prishtina-2025',           'fb-750965611287182'),
  ('kupa-prishtina-2025',           'fb-750967187953691')
);

-- ============================================================
-- Drop the 'race' tag from news rows that weren't real races
-- (welcomes, recruiting calls, FÇK assembly, vague mentions, etc.)
-- These were false positives from the auto-tagger.
-- ============================================================
update public.news
set tags = array_remove(tags, 'race')
where 'race' = any(tags)
  and race_event_id is null;

-- Sanity:
--   select count(*) from public.race_events;                   -- expect 16
--   select count(*) from public.news where race_event_id is not null; -- expect 24
--   select count(*) from public.news where 'race' = any(tags); -- 0 of the false positives
