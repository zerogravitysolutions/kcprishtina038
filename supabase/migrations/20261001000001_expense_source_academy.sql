-- 20261001000001 — "Nga Akademia" as an expense source.
--
-- An expense's source (Burimi) could only be a sponsor's budget. The club also
-- pays costs out of academy membership income, and the owner wants to say so
-- the same way. A flag rather than a fake sponsor row: the academy is not a
-- sponsor, has no contract or logo, and must never appear in sponsor positions.
-- A cost has at most ONE source, so the flag and a sponsor exclude each other.
-- Additive and re-runnable; every existing row reads as "not from the academy".

alter table public.club_expenses
  add column if not exists funded_by_academy boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.club_expenses'::regclass
       and conname  = 'club_expenses_one_source'
  ) then
    alter table public.club_expenses
      add constraint club_expenses_one_source
      check (not (funded_by_academy and funding_sponsor_id is not null));
  end if;
end
$$;

comment on column public.club_expenses.funded_by_academy is
  'Source = academy membership income ("Nga Akademia"). Mutually exclusive '
  'with funding_sponsor_id (club_expenses_one_source).';
