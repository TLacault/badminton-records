-- Print every personal detail we hold, unless told otherwise. A detail the
-- player has no value for is dropped at render, so the empty default only ever
-- meant "show nothing" — which is not what any match wanted.
--
-- 'age' is deliberately absent: 0009 removed it.
alter table public.matches
  alter column player_info_fields
  set default '{club,rank_singles,rank_doubles,rank_mixed,licence}';

-- Existing matches that were never given any fields follow the same rule. One
-- that was deliberately narrowed keeps its choice.
update public.matches
  set player_info_fields = '{club,rank_singles,rank_doubles,rank_mixed,licence}'
  where player_info_fields = '{}';
