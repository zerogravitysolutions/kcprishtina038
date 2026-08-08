-- Titulli was removed from the app (v1.6): the training name now derives from
-- Lloji (focus), falling back to "Stërvitje". Drop the now-unused column.
-- Safe: the live code no longer selects training_rides.title.
alter table public.training_rides drop column if exists title;
