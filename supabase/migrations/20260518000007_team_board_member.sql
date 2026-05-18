-- Generic board-member position. Board has 3 named people: the President
-- (already modeled as `president`) plus 2 more whom the admin will name
-- via /admin/team-members. This is separate from the two Secretaries,
-- which already exist as `secretary_general` / `secretary_organizational`.

alter type public.team_position add value if not exists 'board_member';
