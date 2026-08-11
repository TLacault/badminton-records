-- A match should arrive ready to tag. The YouTube import inserts rows nobody
-- has opened yet, and every setting it leaves null is one the admin has to
-- notice and fix before the first point can be recorded — the opening serve
-- most of all, which the tagger cannot derive.
--
-- These are only the numbers a row starts with. A match set up deliberately
-- keeps whatever it was given.
alter table public.matches alter column initial_server_side set default 1;
alter table public.matches alter column side1_right_court_slot set default 1;
alter table public.matches alter column side2_right_court_slot set default 3;

update public.matches set initial_server_side = 1 where initial_server_side is null;
update public.matches set side1_right_court_slot = 1 where side1_right_court_slot is null;
update public.matches set side2_right_court_slot = 3 where side2_right_court_slot is null;

-- 0011 gave this column its full default and backfilled the rows that existed
-- then. Rows emptied since — the tagger's Reset used to blank them — go back to
-- printing everything we hold.
update public.matches
  set player_info_fields = '{club,rank_singles,rank_doubles,rank_mixed,licence}'
  where player_info_fields = '{}';

-- Almost every recording is a free-play session. A typeless match prints
-- nothing above the video, which is never what was meant.
update public.matches m
  set match_type_id = t.id
  from public.match_types t
  where t.slug = 'free-play' and m.match_type_id is null;
