-- Splits matches.status into two orthogonal axes and adds the YouTube metadata
-- the channel importer writes.
--
-- `status` conflated two unrelated questions: "is this finished?" and "can the
-- public see it?". A video can be fully tagged and still private, or public
-- while tagging is only half done. One column could not express that.

alter table public.matches
  add column visibility text not null default 'private'
    check (visibility in ('private', 'public')),
  -- 'processed' was the working name; tagging_status says what is actually
  -- being tracked and leaves room for the in-between state.
  add column tagging_status text not null default 'untagged'
    check (tagging_status in ('untagged', 'in_progress', 'tagged'));

-- Backfill from the column being replaced. Completeness is derived in TypeScript
-- (shared/badminton), not reproducible in SQL, so anything already published
-- with rallies is assumed finished and everything else with rallies is
-- mid-flight. The tagger corrects both on next open.
update public.matches m
set visibility = case when m.status = 'published' then 'public' else 'private' end,
    tagging_status = case
      when not exists (select 1 from public.rallies r where r.match_id = m.id)
        then 'untagged'
      when m.status = 'published' then 'tagged'
      else 'in_progress'
    end;

-- Policies and the visibility helper read `status`, so they have to be rebuilt
-- before the column can go.
drop policy matches_select_visible on public.matches;

create policy matches_select_visible on public.matches
  for select using (visibility = 'public' or public.is_admin());

create or replace function public.match_is_visible(p_match_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.matches m
    where m.id = p_match_id
      and (m.visibility = 'public' or public.is_admin())
  );
$$;

drop index public.matches_status_played_on_idx;
alter table public.matches drop column status;

create index matches_visibility_played_on_idx
  on public.matches (visibility, played_on desc nulls last);
create index matches_tagging_status_idx on public.matches (tagging_status);

-- YouTube metadata. Cached from the API at import time so the feed renders
-- without a per-request round trip to Google.
alter table public.matches
  add column youtube_channel_id      text,
  add column youtube_title           text,
  add column youtube_published_at    timestamptz,
  add column youtube_thumbnail_url   text,
  add column youtube_duration_seconds int check (youtube_duration_seconds >= 0),
  add column imported_at             timestamptz;

-- What makes re-import idempotent: the importer inserts only video ids it does
-- not already hold. Partial, because hand-created matches have no video yet.
create unique index matches_youtube_video_id_key
  on public.matches (youtube_video_id)
  where youtube_video_id is not null;

-- The importer cannot know singles from doubles, and the column is NOT NULL.
-- Doubles is the common case; the admin corrects it when tagging.
alter table public.matches alter column format set default 'doubles';
