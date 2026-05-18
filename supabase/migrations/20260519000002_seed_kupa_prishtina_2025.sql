-- Seed: Kupa Prishtina 2025 — first-edition road race organized by the
-- club on 2 Nov 2025. Pulled from the FB result post + the pre-race
-- announcement. Idempotent via ON CONFLICT (slug) DO NOTHING.

do $$
declare
  v_event_id uuid;
  v_cover    uuid := '2490bb44-e124-409b-8686-66fd9009825e';
  v_admin    uuid;
begin
  -- created_by must point at a profile; pick any admin so the row passes
  -- whatever FK assumption downstream code might have.
  select id into v_admin from public.profiles where role = 'admin' order by created_at asc limit 1;

  insert into public.events (
    slug, title_sq, title_en, type, status, start_at,
    location, distance_km, elevation_m,
    description_sq, registration_close_at,
    cover_media_id, source, results_published, results_published_at,
    created_by
  )
  values (
    'kupa-prishtina-2025',
    'Kupa Prishtina 2025',
    'Prishtina Cup 2025',
    'race', 'published',
    '2025-11-02 11:00:00+01',
    'Veternik, Prishtinë',
    134, null,
    $body$Edicioni i parë i garës rrugore "Kupa Prishtina 2025", organizuar nga KÇ Prishtina 038 në bashkëpunim me Federatën e Çiklizmit të Kosovës — pjesë e kalendarit zyrtar të FÇK.

Itinerari: Shell/Veternik → Lipjan – Babush – Ferizaj – Kaçanik – rrethrrotullimi në Hani i Elezit (afër "Viva Fresh") → kthim: Kaçanik – Ferizaj – Lipjan → finish te Shell/autostradë.

Distancat sipas kategorive:
• Junior, U-23, Elitë — 134 km
• Kadetë, Femra, Veteranë, Hobi — 40 km

Pjesëmarrës nga klubet e Kosovës, Shqipërisë dhe Maqedonisë së Veriut.

Falënderim i veçantë për Policinë e Kosovës (sigurimi i rrjedhës së garës), Komunën e Prishtinës, dhe të gjithë sponsorët që e bënë të mundur këtë ngjarje.$body$,
    '2025-10-31 23:59:00+01',
    v_cover,
    'native',
    true,
    '2025-11-04 09:07:12+00',
    v_admin
  )
  on conflict (slug) do nothing
  returning id into v_event_id;

  -- If the insert was a no-op (row already exists), look it up.
  if v_event_id is null then
    select id into v_event_id from public.events where slug = 'kupa-prishtina-2025';
  end if;

  -- Skip if signups already seeded.
  if (select count(*) from public.event_signups where event_id = v_event_id) > 0 then
    return;
  end if;

  -- Result rows. email is NOT NULL; use a deterministic placeholder so a
  -- re-run won't violate the (event_id, lower(email)) uniqueness.
  insert into public.event_signups
    (event_id, full_name, email, gender, category, status, result_place, result_time)
  values
    -- Elitë (134 km)
    (v_event_id, 'Albion Kastrati',  'albion.kastrati+kupa2025@seed.local',  'm', 'elite',   'confirmed', 1, '3:18:36'),
    (v_event_id, 'Agron Kelmendi',   'agron.kelmendi+kupa2025@seed.local',   'm', 'elite',   'confirmed', 2, '3:27:48'),
    (v_event_id, 'Valon Binakaj',    'valon.binakaj+kupa2025@seed.local',    'm', 'elite',   'confirmed', 3, '3:30:01'),

    -- U23
    (v_event_id, 'Visar Nuhaj',      'visar.nuhaj+kupa2025@seed.local',      'm', 'u23',     'confirmed', 1, '3:18:56'),
    (v_event_id, 'Henri Hysa',       'henri.hysa+kupa2025@seed.local',       'm', 'u23',     'confirmed', 2, '3:24:47'),

    -- Junior
    (v_event_id, 'Festim Kurti',     'festim.kurti+kupa2025@seed.local',     'm', 'junior',  'confirmed', 1, '3:24:47'),
    (v_event_id, 'Leo Piku',         'leo.piku+kupa2025@seed.local',         'm', 'junior',  'confirmed', 2, '3:32:00'),

    -- Kadet (40 km) → youth in our preset
    (v_event_id, 'Dion Bytyqi',      'dion.bytyqi+kupa2025@seed.local',      'm', 'youth',   'confirmed', 1, '0:59:54'),
    (v_event_id, 'Blend Biqka',      'blend.biqka+kupa2025@seed.local',      'm', 'youth',   'confirmed', 2, '1:16:30'),

    -- Master (40 km)
    (v_event_id, 'Edis Krusha',      'edis.krusha+kupa2025@seed.local',      'm', 'masters', 'confirmed', 1, '1:01:24'),
    (v_event_id, 'Muhamet Hamza',    'muhamet.hamza+kupa2025@seed.local',    'm', 'masters', 'confirmed', 2, '1:02:12'),
    (v_event_id, 'Musa Morina',      'musa.morina+kupa2025@seed.local',      'm', 'masters', 'confirmed', 3, '1:46:10'),

    -- Femra (40 km) — gendered women's category; storing as amateur w/
    -- gender=f keeps the preset list intact. (FB grouped it separately.)
    (v_event_id, 'Enilda Zeqiri',    'enilda.zeqiri+kupa2025@seed.local',    'f', 'amateur', 'confirmed', 1, '1:17:20'),
    (v_event_id, 'Aferdita Ymeri',   'aferdita.ymeri+kupa2025@seed.local',   'f', 'amateur', 'confirmed', 2, '1:24:12'),

    -- Hobi (40 km)
    (v_event_id, 'Ilir Gorqi',       'ilir.gorqi+kupa2025@seed.local',       'm', 'amateur', 'confirmed', 3, '1:03:17'),
    (v_event_id, 'Ilir Lumi',        'ilir.lumi+kupa2025@seed.local',        'm', 'amateur', 'confirmed', 4, '1:06:32'),
    (v_event_id, 'Egzon Baruti',     'egzon.baruti+kupa2025@seed.local',     'm', 'amateur', 'confirmed', 5, '1:07:47'),

    -- Hobi Femra
    (v_event_id, 'Luta Bislimi',     'luta.bislimi+kupa2025@seed.local',     'f', 'amateur', 'confirmed', 6, '1:42:20');
end $$;
