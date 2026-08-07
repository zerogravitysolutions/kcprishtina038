-- Backfill (one-time): attach the championship Facebook post's cover + full
-- 14-photo gallery to the Kampionati i Kosovës 2026 race, and link the news
-- post to it — exactly what the "Krijo garë nga ky postim" flow would produce.
-- (The other 5 detector hits were 4 false positives — a congress, a new bike, a
-- general assembly, an awards gala — plus one alum result under review.)

update public.race_events set
  cover_media_id    = 'bd014337-86e9-4d80-ad98-3c77f7d85251',
  external_url      = 'https://www.facebook.com/901162302934178/posts/937384879311920',
  gallery_media_ids = array[
    'bd014337-86e9-4d80-ad98-3c77f7d85251','46381507-2121-4ec9-ad9b-b34ee2f89222',
    '64dc0085-fd62-44a0-8e1d-19fa73a220e8','cd727159-c5cf-4b20-94f8-ca2ac4d76e73',
    '60704b14-c16f-4dde-8bdb-cd61837bf081','98a597fc-466d-498d-a0c4-fad749a8fb13',
    'a9f14dbf-345a-4b0d-b9df-14630eba476f','7bdcff5a-6e18-40c1-83a1-19b6d48083bf',
    '264d7024-8469-4591-84d6-e0f6d9112b21','28fd8c9e-2557-4d6b-8d41-e8341ead23b5',
    '9d1059ec-8fd0-4f69-81ea-2f461be11409','ccce3ed9-8d4c-4ea5-a2bf-3037580f032b',
    '3f201019-aa35-4abc-87b8-c6320c457567','02a63619-8382-45dc-a661-87319607a3dc'
  ]::uuid[]
where slug = 'kampionati-kosoves-2026';

-- Link the results news post to the race (news.race_event_id).
update public.news
set race_event_id = (select id from public.race_events where slug = 'kampionati-kosoves-2026')
where id = '6709209a-368f-4daa-8fda-5ca5601c491e';
