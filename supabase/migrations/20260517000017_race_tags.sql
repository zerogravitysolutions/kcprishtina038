-- 0017 — Auto-tag race-related news rows so they can drive a /races page.
--
-- Race-related FB posts have very recognizable text patterns: "gara",
-- "Granfondo", "Tour of Kosova/Kosovo", "Kampionati", "Maratoni",
-- "Sharr Cup", "Rezultatet", "Kronometer", "podium", etc. We tag those
-- news rows with both 'facebook' (already there for FB-sourced rows)
-- AND 'race', so the public /races page can simply filter by tag.
--
-- Going forward, the sync-facebook Edge Function applies the same
-- regex when creating a news row from a fresh FB post.

-- Tag function — keeps the regex in one place. Returns the tags array
-- with 'race' merged in when the body text matches.
create or replace function public.fb_news_race_tags(text_body text, existing_tags text[])
returns text[] language plpgsql immutable as $$
begin
  if text_body is null then return existing_tags; end if;
  if text_body ~* '(gar[aëë]|granfondo|tour\s+of\s+kosov|kampionat|maraton|sharr\s+cup|kup[aëë]\s+pri|rezultatet|kronomet|krono|XCO|UCI\s+(1|2)\.|podium|fitor|sprint|championship|race(\s|$)|stage|etap)'
  then
    return array(select distinct unnest(coalesce(existing_tags, '{}'::text[]) || array['race']::text[]));
  end if;
  return existing_tags;
end
$$;

-- Backfill existing FB-sourced news rows.
update public.news
set tags = public.fb_news_race_tags(body_sq, tags)
where source = 'facebook'
  and not ('race' = any(tags));

-- Sanity counts:
--   select count(*) from public.news where 'race' = any(tags);
--   select slug, left(title_sq, 80), published_at::date
--   from public.news where 'race' = any(tags) order by published_at desc limit 10;
