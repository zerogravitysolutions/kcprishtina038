-- 0010 — Promote the initial admin.
--
-- Idempotent: if the profile doesn't exist yet (auth.users row not created),
-- this UPDATE affects 0 rows and re-runs harmlessly on next migration cycle.
-- If the profile exists, it's promoted exactly once.

update public.profiles
set role      = 'admin',
    status    = 'active',
    full_name = case
                  when full_name is null or full_name = split_part(email, '@', 1)
                  then 'Qëndrim Pllana'
                  else full_name
                end,
    joined_at = coalesce(joined_at, current_date)
where email = 'qendrim.pllanna@gmail.com';
