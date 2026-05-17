-- 0001 — Enums + utility functions.
-- All later migrations depend on these types.

create type public.user_role           as enum ('admin','editor','staff','coach','member');
create type public.application_status  as enum ('pending','approved','rejected','waitlist','withdrawn');
create type public.member_status       as enum ('active','inactive','suspended','pending');
create type public.event_status        as enum ('draft','published','cancelled','done');
create type public.event_type          as enum ('race','ride','camp','training');
create type public.registration_status as enum ('registered','waitlist','cancelled','checked_in','dnf','dns');
create type public.dues_status         as enum ('paid','unpaid','overdue','waived');
create type public.attendance_status   as enum ('present','absent','late','excused');
create type public.content_status      as enum ('draft','published','archived');
create type public.sponsor_tier        as enum ('title','technical','partner','supporter');

-- current role of auth.uid(), NULL when unauthenticated or no profile.
create or replace function public.current_role()
returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- has_role(['admin','staff']) → boolean.
create or replace function public.has_role(roles public.user_role[])
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role() = any(roles), false)
$$;

-- is_coach_of(section_id) → true iff caller is the coach of that section.
create or replace function public.is_coach_of(target_section_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and role = 'coach' and section_id = target_section_id
  )
$$;

-- Shared trigger to maintain updated_at on row UPDATE.
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;
