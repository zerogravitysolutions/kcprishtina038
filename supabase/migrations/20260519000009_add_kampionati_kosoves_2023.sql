-- Add the missing 2023 Kosovo championship to the curated race catalog.
--
-- public.race_events is a hand-curated catalog (see migration 0019). It was
-- seeded once from inspecting FB posts; the 2023 national championship edition
-- was not captured then (only Cross Country Prishtina, Triatloni, Kupa e
-- Mitrovicës and Tour of Kosova made it in for 2023), even though the club won
-- medals there. 2024 and 2025 editions are already in the catalog.
--
-- Results are from the club's own 2023 season summary. NOTE: race_date is an
-- estimate (June 2023) — adjust the exact date/route in /admin/races if needed.

insert into public.race_events
  (slug, name, race_date, location, race_type, organizer, description)
values
  ('kampionati-kosoves-2023', 'Kampionati i Kosovës 2023', '2023-06-24', 'Kosovë', 'road', 'FÇK',
   'Kampionati kombëtar (qershor 2023). Dy medalje ari për klubin: Albion Ymeri kampion në krono Elite dhe Festim Kurti kampion në rrugë Kadetë. Albion Ymeri argjend në rrugë; Genc Isufi bronz në U23 (krono dhe rrugë).')
on conflict (slug) do nothing;
