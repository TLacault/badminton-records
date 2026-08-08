-- profiles: 1:1 with auth.users. Role is set by SQL only; there is no
-- self-serve path to admin.
create table public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text,
  role         text not null default 'guest' check (role in ('guest', 'admin')),
  created_at   timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- players: the roster, reused across matches.
create table public.players (
  id            uuid primary key default gen_random_uuid(),
  first_name    text not null,
  last_name     text not null,
  club          text,
  birth_year    int check (birth_year between 1900 and 2100),
  rank_singles  text,
  rank_doubles  text,
  rank_mixed    text,
  ffbad_license text,
  notes         text,
  created_at    timestamptz not null default now()
);

create index players_last_name_idx on public.players (last_name, first_name);

-- matches
create table public.matches (
  id                     uuid primary key default gen_random_uuid(),
  title                  text not null,
  played_on              date,
  venue                  text,
  format                 text not null check (format in ('singles', 'doubles')),
  youtube_video_id       text,
  status                 text not null default 'draft'
                           check (status in ('draft', 'published')),
  best_of                int not null default 3 check (best_of in (1, 3, 5)),
  points_to_win          int not null default 21 check (points_to_win > 0),
  win_by                 int not null default 2 check (win_by >= 1),
  points_cap             int not null default 30 check (points_cap >= points_to_win),
  initial_server_side    smallint check (initial_server_side in (1, 2)),
  side1_right_court_slot smallint check (side1_right_court_slot in (1, 2)),
  side2_right_court_slot smallint check (side2_right_court_slot in (3, 4)),
  created_by             uuid references public.profiles on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index matches_status_played_on_idx
  on public.matches (status, played_on desc nulls last);

-- match_players: participants and the AZERTY numkey mapping.
create table public.match_players (
  match_id  uuid not null references public.matches on delete cascade,
  player_id uuid not null references public.players on delete restrict,
  slot      smallint not null check (slot between 1 and 4),
  side      smallint generated always as
              (case when slot <= 2 then 1 else 2 end) stored,
  primary key (match_id, player_id),
  unique (match_id, slot)
);

-- rallies: the event log. The only truth.
create table public.rallies (
  id                  uuid primary key default gen_random_uuid(),
  match_id            uuid not null references public.matches on delete cascade,
  idx                 int not null check (idx >= 0),
  winner_side         smallint check (winner_side in (1, 2)),
  is_let              boolean not null default false,
  is_highlight        boolean not null default false,
  scored_by_player_id uuid references public.players on delete set null,
  ended_at_seconds    numeric not null check (ended_at_seconds >= 0),
  created_at          timestamptz not null default now(),
  constraint rallies_let_has_no_winner check (
    (is_let and winner_side is null) or (not is_let and winner_side is not null)
  ),
  -- Deferrable because inserting a missed rally mid-match renumbers every
  -- later rally, passing through transiently duplicate idx values.
  constraint rallies_match_idx_unique unique (match_id, idx)
    deferrable initially deferred
);

create index rallies_match_idx on public.rallies (match_id, idx);

-- match_game_starts: doubles-only overrides for games 2 and 3.
create table public.match_game_starts (
  match_id               uuid not null references public.matches on delete cascade,
  game_number            smallint not null check (game_number between 1 and 5),
  server_slot            smallint check (server_slot between 1 and 4),
  side1_right_court_slot smallint check (side1_right_court_slot in (1, 2)),
  side2_right_court_slot smallint check (side2_right_court_slot in (3, 4)),
  primary key (match_id, game_number)
);
