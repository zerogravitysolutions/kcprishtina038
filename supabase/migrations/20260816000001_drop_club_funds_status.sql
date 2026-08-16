-- 20260816000001 — Remove the PLEDGED-vs-RECEIVED distinction from club_funds.
--
-- The owner's decision: "Premtuar por pa arritur" (agreed but not arrived) is
-- not tracked at all any more. club_funds is now, by definition, only money the
-- club has ACTUALLY RECEIVED. There is no pledged status, no per-sponsor
-- projected figure, no "nevojitet transferi" — the whole idea is retired.
--
-- TWO ROWS ARE DELETED HERE, ON PURPOSE AND NOT RECOVERABLE FROM THIS FILE:
--   'Sponsorizim nga Novus — transfer i pritur'    €6,000.00  (2026-05-06)
--   'Sponsorizim nga BikePlus — transfer i pritur' €2,500.00  (2026-05-06)
-- They were seeded by 20260810000003 with status = 'pledged': €8,500.00 of
-- sponsor money that was AGREED but never transferred into the club account.
-- The club has chosen to stop tracking unreceived pledges, so these two rows
-- are removed rather than migrated. This deletion is intentional; the amounts
-- are not preserved anywhere in this migration.
--
-- ORDER IS LOAD-BEARING. The pledged rows MUST be deleted BEFORE the status
-- column is dropped. If the column were dropped first, those two rows would
-- silently become RECEIVED money and add €8,500.00 of cash the club never got.
--
-- Every statement is safely re-runnable: the delete is a no-op once the rows
-- are gone (and a no-op once the column is gone, guarded below), and the column
-- and index drops use IF EXISTS.

-- (1) Delete the unreceived pledges FIRST, while the column still exists to
--     identify them. Guarded so a replay after the column is dropped does not
--     error on the missing column.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'club_funds'
      and column_name = 'status'
  ) then
    delete from public.club_funds where status = 'pledged';
  end if;
end $$;

-- (2) Drop the now-pointless status index.
drop index if exists public.club_funds_status_idx;

-- (3) Drop the column. This takes its CHECK (status in ('received','pledged'))
--     and its default with it. club_funds now holds received money only.
alter table public.club_funds drop column if exists status;
