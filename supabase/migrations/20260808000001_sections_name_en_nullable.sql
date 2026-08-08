-- The site is Albanian-only: the admin section editor no longer asks for an
-- English name, so new/updated rows never supply sections.name_en. Drop the NOT
-- NULL so INSERTs keep working. The column and its existing data are kept.
alter table public.sections alter column name_en drop not null;
