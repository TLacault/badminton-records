-- Clubs, imported from badiste's departmental list.
--
-- `myffbad_club_id` is the upsert key and the join to a MyFFBaD player row,
-- whose ClubId is the same number. Matching on names would be guesswork;
-- this is exact.
create table public.clubs (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  acronym         text,
  city            text,
  department      text not null default '33',
  myffbad_club_id text unique,
  -- 'badiste' rows are owned by the importer and rewritten on every refresh.
  -- 'manual' rows are yours — a club outside Gironde, say — and the importer
  -- never touches them.
  source          text not null default 'badiste'
                    check (source in ('badiste', 'manual')),
  -- Search ranking. Higher sorts first; everything not listed is 0.
  priority        int not null default 0,
  -- Set when badiste stops listing a club. Not deleted: a player may still
  -- point at it, and a club that folds is history rather than a mistake.
  archived_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index clubs_priority_idx on public.clubs (priority desc, name);

alter table public.players
  add column club_id uuid references public.clubs on delete set null;

create index players_club_id_idx on public.players (club_id);

-- Table-level privileges come first; RLS narrows them, it does not grant them.
grant select on public.clubs to anon, authenticated;
grant insert, update, delete on public.clubs to authenticated;

alter table public.clubs enable row level security;

-- Same shape as the rest of the schema: the public site reads, admins write.
create policy clubs_select_all on public.clubs
  for select using (true);
create policy clubs_admin_write on public.clubs
  for all using (public.is_admin()) with check (public.is_admin());
