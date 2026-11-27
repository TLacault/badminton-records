-- What a video is, set on import from its YouTube title: the raw match, a
-- landscape highlights clip, or a vertical edit.

alter table public.matches
  add column video_kind text not null default 'match'
    check (video_kind in ('match', 'highlights', 'edit'));

comment on column public.matches.video_kind is 'match | highlights | edit. Set on import from the title (server/utils/youtube.ts videoKindOf).';

update public.matches set video_kind = case
  when coalesce(youtube_title, title) ~* 'highlights' then 'highlights'
  when coalesce(youtube_title, title) ~* '\medit\M' then 'edit'
  else 'match'
end;
