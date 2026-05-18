-- Add board-secretary positions to team_position enum.
-- The club's board has a President and two Secretaries (General +
-- Organizational); previously we only had `president` and `commissaire`,
-- and the secretaries were mis-tagged.

alter type public.team_position add value if not exists 'secretary_general';
alter type public.team_position add value if not exists 'secretary_organizational';
