-- 0002 — Sections + Profiles (the foundation everything else FKs to).

-- ============================================================
-- Sections (the 6 disciplines).
-- coach_id FK is added at the end of this file once profiles exists.
-- ============================================================
create table public.sections (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z][a-z0-9_-]*$'),
  display_order   int  not null,
  name_sq         text not null,
  name_en         text not null,
  description_sq  text,
  description_en  text,
  coach_id        uuid,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger sections_updated_at before update on public.sections
  for each row execute function public.set_updated_at();

-- ============================================================
-- Profiles: 1:1 with auth.users, our application-side user data.
-- ============================================================
create table public.profiles (
  id                       uuid primary key references auth.users(id) on delete cascade,
  full_name                text not null,
  email                    text not null unique,
  phone                    text,
  dob                      date,
  role                     public.user_role not null default 'member',
  section_id               uuid references public.sections(id) on delete set null,
  avatar_url               text,
  bio                      text,
  emergency_contact_name   text,
  emergency_contact_phone  text,
  status                   public.member_status not null default 'pending',
  joined_at                date,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index profiles_role_idx    on public.profiles(role);
create index profiles_section_idx on public.profiles(section_id);
create index profiles_status_idx  on public.profiles(status);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Now profiles exists → close the sections.coach_id FK loop.
alter table public.sections
  add constraint sections_coach_fk
  foreign key (coach_id) references public.profiles(id) on delete set null;

-- ============================================================
-- Auto-create a profile when a new auth.users row appears.
-- Runs with SECURITY DEFINER so it bypasses RLS during the trigger.
-- ============================================================
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    'member',
    'pending'
  );
  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
