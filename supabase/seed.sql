-- Demo data for local development. Applied automatically by `pnpm db:reset`.
--
-- Everything here is prefixed "Demo" so it is never mistaken for real match
-- data. Real videos come from the channel importer; this exists so the guest
-- player has something to render before you have tagged anything.
--
-- HEADS UP: the demo match reuses a real video id from the channel so the
-- player has something to load. The importer skips video ids it already holds,
-- so that one video will not import while this row exists. Drop it first:
--
--   delete from public.matches where id = '55555555-5555-5555-5555-555555555555';

insert into public.players (id, first_name, last_name, club, rank_doubles)
values
  ('11111111-1111-1111-1111-111111111111', 'Demo', 'Player One',   'USTalence', 'D8'),
  ('22222222-2222-2222-2222-222222222222', 'Demo', 'Player Two',   'USTalence', 'D9'),
  ('33333333-3333-3333-3333-333333333333', 'Demo', 'Opponent One', 'BC Bordeaux', 'D7'),
  ('44444444-4444-4444-4444-444444444444', 'Demo', 'Opponent Two', 'BC Bordeaux', 'D8');

insert into public.matches (
  id, title, played_on, venue, format, youtube_video_id,
  visibility, tagging_status,
  best_of, points_to_win, win_by, points_cap,
  initial_server_side, side1_right_court_slot, side2_right_court_slot,
  youtube_duration_seconds
)
values (
  '55555555-5555-5555-5555-555555555555',
  'Demo — mixed doubles, 2 games',
  '2026-08-07', 'Talence', 'doubles', 'oR5JpHfnPDg',
  'public', 'tagged',
  3, 21, 2, 30,
  1, 1, 3,
  866
);

insert into public.match_players (match_id, player_id, slot) values
  ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', 1),
  ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 2),
  ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', 3),
  ('55555555-5555-5555-5555-555555555555', '44444444-4444-4444-4444-444444444444', 4);

-- Game 1 ends 21-15, game 2 ends 21-18, built by alternating to a tie and then
-- running out the winner — legal under rally scoring and short of deuce, so the
-- derived score is unambiguous. Rallies are 10s apart and fit inside the real
-- 866s video.
do $$
declare
  v_match uuid := '55555555-5555-5555-5555-555555555555';
  v_idx   int  := 0;
  v_time  numeric := 20;
  i       int;
begin
  -- game 1: 15 alternating pairs, then 6 for side 1
  for i in 1..15 loop
    insert into public.rallies (match_id, idx, winner_side, is_highlight, ended_at_seconds)
    values (v_match, v_idx, 1, v_idx % 11 = 0, v_time);
    v_idx := v_idx + 1; v_time := v_time + 10;

    insert into public.rallies (match_id, idx, winner_side, is_highlight, ended_at_seconds)
    values (v_match, v_idx, 2, false, v_time);
    v_idx := v_idx + 1; v_time := v_time + 10;
  end loop;

  for i in 1..6 loop
    insert into public.rallies (match_id, idx, winner_side, is_highlight, ended_at_seconds)
    values (v_match, v_idx, 1, i = 6, v_time);
    v_idx := v_idx + 1; v_time := v_time + 10;
  end loop;

  -- game 2: 18 alternating pairs, then 3 for side 1
  for i in 1..18 loop
    insert into public.rallies (match_id, idx, winner_side, is_highlight, ended_at_seconds)
    values (v_match, v_idx, 1, v_idx % 17 = 0, v_time);
    v_idx := v_idx + 1; v_time := v_time + 5;

    insert into public.rallies (match_id, idx, winner_side, is_highlight, ended_at_seconds)
    values (v_match, v_idx, 2, false, v_time);
    v_idx := v_idx + 1; v_time := v_time + 5;
  end loop;

  for i in 1..3 loop
    insert into public.rallies (match_id, idx, winner_side, is_highlight, ended_at_seconds)
    values (v_match, v_idx, 1, i = 3, v_time);
    v_idx := v_idx + 1; v_time := v_time + 5;
  end loop;
end $$;
