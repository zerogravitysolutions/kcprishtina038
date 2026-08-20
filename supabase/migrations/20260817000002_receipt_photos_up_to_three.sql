-- 20260817000002 — club_expenses.receipt_paths — up to three receipt photos.
--
-- Today: receipt_path text, nullable, pinned by club_expenses_receipt_path_ck
-- to '^receipts/[0-9a-f]{32}\.(jpg|png|webp)$'. We move to an array so a single
-- expense can carry up to three photos of the same purchase (a slip that runs
-- over two till rolls, a slip plus its itemised breakdown, etc.).
--
-- BACKFILL IS SAFE. receipt_path is nullable and the single-photo feature was
-- only added in 20260811000001; in production every row is expected to be NULL,
-- so array[receipt_path] where not null else array[]::text[] loses nothing. Even
-- if a few rows already carry a path, each becomes a one-element array of that
-- exact path, which still satisfies the new check.
--
-- The whole rewrite is guarded on the OLD column still existing, so a replay
-- after it has been dropped is a no-op. The array column, the check and the
-- comment are (re)applied unconditionally with IF EXISTS / drop-first so the
-- file stays re-runnable regardless of how far a previous run got.

-- CHECK constraints cannot contain a subquery, and Postgres has no "every array
-- element matches this regex" operator, so the per-element test lives in an
-- IMMUTABLE helper the constraint calls. Same pattern as the old single-column
-- check; cardinality is capped at 3.
create or replace function public.club_expenses_receipt_paths_ok(p text[])
returns boolean
language sql immutable set search_path = public as $$
  select cardinality(p) <= 3
     and not exists (
       select 1 from unnest(p) as e
        where e !~ '^receipts/[0-9a-f]{32}\.(jpg|png|webp)$'
     );
$$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'club_expenses'
       and column_name = 'receipt_path'
  ) then
    -- First run: add the array column, backfill from the single path, then drop
    -- the old check and column.
    alter table public.club_expenses
      add column if not exists receipt_paths text[] not null default array[]::text[];

    update public.club_expenses
       set receipt_paths = case
             when receipt_path is not null then array[receipt_path]
             else array[]::text[]
           end;

    alter table public.club_expenses
      drop constraint if exists club_expenses_receipt_path_ck;
    alter table public.club_expenses
      drop column if exists receipt_path;
  else
    -- Replay after the migration already ran: guarantee the array column is
    -- present without touching data.
    alter table public.club_expenses
      add column if not exists receipt_paths text[] not null default array[]::text[];
  end if;
end
$$;

alter table public.club_expenses
  drop constraint if exists club_expenses_receipt_paths_ck;
alter table public.club_expenses
  add constraint club_expenses_receipt_paths_ck
  check (public.club_expenses_receipt_paths_ok(receipt_paths));

comment on column public.club_expenses.receipt_paths is
  'Up to three receipt-photo paths inside the `media` storage bucket, each '
  '"receipts/<32 hex>.(jpg|png|webp)". Empty array = no photo attached. Objects '
  'are removed by the server action when a receipt is dropped or the expense is '
  'deleted. Supersedes the single receipt_path column (migration 20260811000001).';
