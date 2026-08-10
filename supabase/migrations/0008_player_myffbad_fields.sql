-- Fields the MyFFBaD lookup can fill that the roster had nowhere to put.
--
-- No birth_year here on purpose: MyFFBaD's public payload carries no birth
-- date, so that column stays hand-entered. `category` ("Senior", "Veteran 2")
-- is the closest public stand-in for age.
alter table public.players
  add column cpph              numeric(7, 2),
  add column category          text,
  add column myffbad_person_id text;

comment on column public.players.cpph is
  'CPPH rating from MyFFBaD (GlobalRating), e.g. 1470.00. Finer than the P/D/R letter ranks.';
comment on column public.players.category is
  'FFBaD age category from MyFFBaD, e.g. Senior, Veteran 2, Minime 1.';
comment on column public.players.myffbad_person_id is
  'MyFFBaD internal person id. The profile URL is built from ffbad_license, not this; kept because it is the only identifier that survives a licence reissue.';
