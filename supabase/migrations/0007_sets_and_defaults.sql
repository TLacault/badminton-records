-- Badminton scores sets, not games. The schema said "game" everywhere because
-- the scoring engine was written from the BWF rulebook's English; the club says
-- set, the UI says set, and the two should not disagree.
alter table public.match_game_starts rename to match_set_starts;
alter table public.match_set_starts rename column game_number to set_number;

-- Constraints and policies keep the name they were born with; rename them too
-- so a future error message points at something that still exists.
alter table public.match_set_starts
  rename constraint match_game_starts_game_number_check to match_set_starts_set_number_check;
alter table public.match_set_starts
  rename constraint match_game_starts_pkey to match_set_starts_pkey;

alter policy game_starts_select on public.match_set_starts
  rename to set_starts_select;
alter policy game_starts_admin_write on public.match_set_starts
  rename to set_starts_admin_write;

-- New house rules: sets to 15, capped at 21. Defaults only — matches already
-- recorded under 21/30 keep their own numbers, and the tagger reads each
-- match's stored rules rather than these.
alter table public.matches alter column points_to_win set default 15;
alter table public.matches alter column points_cap set default 21;

-- Nearly every match is filmed in the same hall, and the YouTube import has no
-- way to know where a video was shot.
alter table public.matches alter column venue set default 'Talence';
