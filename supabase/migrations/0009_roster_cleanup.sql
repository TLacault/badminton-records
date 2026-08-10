-- Age goes: MyFFBaD publishes no birth date, so the column was never going to
-- be filled by the lookup, and nothing in the app wants to show it.
update public.matches
  set player_info_fields = array_remove(player_info_fields, 'age')
  where 'age' = any (player_info_fields);

alter table public.players drop column birth_year;

-- One row per licence. The form used to write '' for "no licence", which would
-- collide the moment a second player had none, so empties become null first and
-- the index simply skips them.
update public.players set ffbad_license = null where btrim(ffbad_license) = '';

create unique index players_ffbad_license_key
  on public.players (ffbad_license)
  where ffbad_license is not null;
