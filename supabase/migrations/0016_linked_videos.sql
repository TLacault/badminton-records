-- The raw, tagged video lives forever; the public match video, the highlights
-- and the edit point at it instead of copying its data ("symlink").

alter table public.matches
  add column source_match_id uuid references public.matches(id) on delete set null,
  add column show_scoreboard boolean not null default false;

alter table public.matches
  add constraint matches_source_not_self check (source_match_id is null or source_match_id <> id);

create index matches_source_match_id_idx on public.matches (source_match_id);

comment on column public.matches.source_match_id is 'The raw tagged match this video was cut from; players, scores and stats are read from it.';
comment on column public.matches.show_scoreboard is 'Overlay the live scoreboard on the player. Only meaningful on the raw tagged video, whose timestamps the rallies use.';

update public.matches set show_scoreboard = (tagging_status = 'tagged');
