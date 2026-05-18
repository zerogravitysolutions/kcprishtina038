-- Gender on event signups so we can validate UCI category eligibility
-- (Elite M / Elite W) and produce gendered startlists / results.
alter table public.event_signups
  add column if not exists gender text
    check (gender in ('m', 'f', 'other'));
