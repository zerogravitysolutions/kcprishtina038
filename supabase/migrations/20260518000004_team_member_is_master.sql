-- Manual UCI Master flag on team_members.
--
-- Decision: we do NOT auto-classify riders as Master based on age — the
-- club fields Elite up to and including senior riders. An admin promotes
-- a specific rider to Master only when they actually register in the
-- Master category for the federation.

alter table public.team_members
  add column if not exists is_master boolean not null default false;
