-- Add the documented results for Kampionati i Kosovës 2023 (from the club's own
-- season history). NOTE: there is no FB post/gallery for this edition in the
-- synced feed (the club didn't post a race gallery for it in 2023), so no photos
-- can be attached without fabricating them.
update public.race_events set
  result_summary = 'Albion Ymeri — kampion (ar) në Kronometër Elite dhe argjend në Garën Rrugore. Festim Kurti — kampion (ar) në Garën Rrugore, kategoria Kadetë. Genc Isufi — bronz në U23 (kronometër dhe rrugë).'
where slug = 'kampionati-kosoves-2023' and result_summary is null;
