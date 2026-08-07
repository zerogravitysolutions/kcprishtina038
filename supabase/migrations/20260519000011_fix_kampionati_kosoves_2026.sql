-- Correct the Kampionati i Kosovës 2026 entry with the real, verified results
-- (from the club's 29 June 2026 Facebook results post): two days (27–28 June),
-- kronometër + rrugore, 4 medals. Replaces the earlier placeholder date/desc.

update public.race_events set
  race_date      = '2026-06-28',
  location       = 'Kosovë',
  race_type      = 'road',
  organizer      = 'FÇK',
  description    = 'Kampionati kombëtar 2026 (27–28 qershor) — kronometër individual dhe garë rrugore. Klubi u kthye me 4 medalje.',
  result_summary = 'Albion Ymeri — vendi 3 në Kronometër Individual (Elite) dhe vendi 3 në Garën Rrugore (Elite). ' ||
                   'Aferdita Ymeri — vendi 3 në Kronometër Individual dhe vendi 2 në Garën Rrugore. ' ||
                   'Morën pjesë edhe Arbër Xhemajli, Fuad Bajrami e Durim Dermaku (Arbëri dhe Fuadi u renditën 4-të e 5-të në kronometër).'
where slug = 'kampionati-kosoves-2026';
