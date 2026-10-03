-- A source of project money is the actual club_funds row. Its title names the
-- project and year; expenses select that row directly. Academy remains the one
-- virtual source, backed by membership payments instead of club_funds.
alter table public.club_expenses
  add column if not exists funding_fund_id uuid references public.club_funds(id) on delete restrict;
create index if not exists club_expenses_funding_fund_idx on public.club_expenses(funding_fund_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'club_expenses_one_fund_source'
    and conrelid = 'public.club_expenses'::regclass) then
    alter table public.club_expenses add constraint club_expenses_one_fund_source
      check (funding_fund_id is null or (funding_sponsor_id is null and not funded_by_academy));
  end if;
end
$$;

-- A new sponsorship is identified by its fund title, not by the public sponsor
-- catalogue. Existing sponsor links remain for historical rows, but new funds
-- no longer need one. No money or source-only placeholder is created here.
alter table public.club_funds drop constraint if exists club_funds_sponsor_required_ck;

-- Give the three existing receipts the confirmed 2025 names. Guard by both id
-- and old title so a name edited between review and deploy is never overwritten.
update public.club_funds set title = 'Komuna e Prishtinës 2025'
where id = '9f662413-6d39-4c6b-95ef-86b4c7a3c33f'
  and title = 'Komuna e Prishtines';
update public.club_funds set title = 'BikePlus 2025'
where id = 'e422c375-fb27-5b61-9b71-766c2b8d78b7'
  and title = 'Sponsorizim nga BikePlus — transfer i pritur';
update public.club_funds set title = 'Novus 2025'
where id = 'e9abae7a-9502-5e9a-ada7-d5aad7101965'
  and title = 'Sponsorizim nga Novus — transfer i pritur';

-- Backfill only when the old sponsor FK identifies exactly one real fund row.
-- The existing Novus costs satisfy this, including those dated 2026. If an
-- installation has several funds for one sponsor, leave its old assignment in
-- place for a person to choose the intended row; never guess by name or date.
with unique_fund as (
  select sponsor_id, (array_agg(id))[1] as fund_id
  from public.club_funds
  where sponsor_id is not null
  group by sponsor_id
  having count(*) = 1
)
update public.club_expenses e
set funding_fund_id = u.fund_id, funding_sponsor_id = null
from unique_fund u
where e.funding_sponsor_id = u.sponsor_id and e.funding_fund_id is null;
