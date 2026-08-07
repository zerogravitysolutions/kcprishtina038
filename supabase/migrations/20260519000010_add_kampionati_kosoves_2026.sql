-- Provisional 2026 edition of the Kosovo championship (requested — was missing
-- from the curated race_events catalog).
--
-- No verified 2026 data is available to seed here; race_date is an estimate
-- (~20 June, following the 2024/2025 pattern). Admin should confirm the exact
-- date and add real results in /admin/races.

insert into public.race_events
  (slug, name, race_date, location, race_type, organizer, description)
values
  ('kampionati-kosoves-2026', 'Kampionati i Kosovës 2026', '2026-06-20', 'Kosovë', 'road', 'FÇK',
   'Kampionati kombëtar 2026 — data dhe rezultatet do të konfirmohen.')
on conflict (slug) do nothing;
