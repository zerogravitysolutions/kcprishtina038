-- 0007 — Seed the 6 disciplines (matches the prototype's hardcoded copy).
-- This is the only seed data; everything else (members, events, news) is
-- created by the admin app or by application approval.

insert into public.sections (slug, display_order, name_sq, name_en, description_sq, description_en) values
  ('road',   1, 'Rrugë',
   'Road',
   'Sezoni i pranverës–vjeshtës. Garat kombëtare të FÇK, Granfondo, dhe etapat rajonale.',
   'Spring–autumn season. FÇK national races, Granfondos, and regional stage races.'),
  ('mtb',    2, 'MTB',
   'MTB',
   'Cross-country mbi Germinë, Sharrin dhe Prokletijet. Format XCO dhe maratonë.',
   'Cross-country across Germia, Sharri and the Accursed Mountains. XCO and marathon.'),
  ('gravel', 3, 'Gravel',
   'Gravel',
   'E reja e klubit. Gara aventureske dhe ekspedita të hapura në rrugët dytësore të Kosovës.',
   'The newest section. Adventure events and open expeditions on Kosovo''s back roads.'),
  ('track',  4, 'Trek',
   'Track',
   'Disiplinë e shkurtër — sprint, keirin, persecution. Bashkëpunim me velodromin rajonal.',
   'The short discipline — sprint, keirin, pursuit. Partnered with the regional velodrome.'),
  ('youth',  5, 'Akademia e të rinjve',
   'Youth Academy',
   'Çiklistët e ardhshëm të Kosovës — moshat 9–17 vjeç. Stërvitje çdo të shtunë.',
   'The future of Kosovar cycling — ages 9–17. Training every Saturday.'),
  ('women',  6, 'Femra',
   'Women''s',
   'Programi i çiklizmit të femrave — gara, ride të hapura, dhe mentorim ndër-gjenerata.',
   'The women''s cycling program — racing, open rides, inter-generational mentoring.')
on conflict (slug) do nothing;

-- Default club settings.
insert into public.settings (key, value) values
  ('club.name',                 '"KÇ Prishtina 038"'::jsonb),
  ('club.founded',              '"2022"'::jsonb),
  ('club.federation_id',        '"KS-22-038"'::jsonb),
  ('club.contact_email',        '"info@prishtina038.cc"'::jsonb),
  ('dues.default_amount_eur',   '25'::jsonb),
  ('dues.currency',             '"EUR"'::jsonb),
  ('payments.instructions_url', '"https://prishtina038.cc/payments"'::jsonb)
on conflict (key) do nothing;
