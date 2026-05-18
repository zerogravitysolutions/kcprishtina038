-- Fix: the previous seed lumped Femra / Hobi / Hobi Femra into "amateur"
-- with continuous places (1..6), which made the public results table show
-- them all as a single ranking. The FB recap actually awarded podium
-- positions per group. Restore each group to its own category bucket and
-- reset place numbers per group.

update public.event_signups
   set category = 'Femra', result_place = 1
 where event_id = (select id from public.events where slug = 'kupa-prishtina-2025')
   and full_name = 'Enilda Zeqiri';

update public.event_signups
   set category = 'Femra', result_place = 2
 where event_id = (select id from public.events where slug = 'kupa-prishtina-2025')
   and full_name = 'Aferdita Ymeri';

update public.event_signups
   set category = 'Hobi', result_place = 1
 where event_id = (select id from public.events where slug = 'kupa-prishtina-2025')
   and full_name = 'Ilir Gorqi';

update public.event_signups
   set category = 'Hobi', result_place = 2
 where event_id = (select id from public.events where slug = 'kupa-prishtina-2025')
   and full_name = 'Ilir Lumi';

update public.event_signups
   set category = 'Hobi', result_place = 3
 where event_id = (select id from public.events where slug = 'kupa-prishtina-2025')
   and full_name = 'Egzon Baruti';

update public.event_signups
   set category = 'Hobi Femra', result_place = 1
 where event_id = (select id from public.events where slug = 'kupa-prishtina-2025')
   and full_name = 'Luta Bislimi';
