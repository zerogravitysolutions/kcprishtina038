-- Vendi (location) + Shënime (notes) were removed from the training UI in v1.7
-- (exercise location/notes and the per-cyclist entry notes). Drop the now-unused
-- columns. NOTE: athlete_profiles.notes (the coach's notes on an athlete) is a
-- different, still-used field and is intentionally kept.
-- Safe: the live code no longer selects any of these.
alter table public.training_rides drop column if exists location;
alter table public.training_rides drop column if exists notes;
alter table public.ride_entries   drop column if exists notes;
