-- `raw` is the unlisted, tagged recording; `match` is now the edited YouTube
-- version linked to it. Every video so far is a raw recording.

alter table public.matches drop constraint matches_video_kind_check;
update public.matches set video_kind = 'raw' where video_kind = 'match';
alter table public.matches
  add constraint matches_video_kind_check check (video_kind in ('raw', 'match', 'highlights', 'edit')),
  alter column video_kind set default 'raw',
  add column edit_maps jsonb not null default '{}';

comment on column public.matches.edit_maps is 'On a raw match: per render (match | highlights | edit), the source → output pieces [{from,to,at,speed}] saved at render time, so linked videos can place the raw tags on their own timeline. shared/publish/editMap.ts.';
