-- What kind of session a match belongs to: a Tuesday of free play, an
-- interclub tie, a tournament round.
--
-- A table rather than an enum or a check constraint, because the list belongs
-- to the club and not to the schema. Adding "Regional final" should be a form
-- submission, not a migration.
create table public.match_types (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  label      text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

insert into public.match_types (slug, label, sort_order) values
  ('free-play', 'Free play', 10),
  ('training', 'Training', 20),
  ('interclubs', 'Interclubs', 30),
  ('tournament', 'Tournament', 40),
  ('championship', 'Championship', 50);

-- set null, not cascade: deleting a type must never take matches with it.
alter table public.matches
  add column match_type_id uuid references public.match_types on delete set null;

-- Which personal details the match page prints beside each player. Per match,
-- because a tournament sheet wants ranks and licences where a Tuesday evening
-- wants a name and nothing else. Entries are `players` column names, plus
-- 'age', which is derived from birth_year.
alter table public.matches
  add column player_info_fields text[] not null default '{}';

grant select on public.match_types to anon, authenticated;
grant insert, update, delete on public.match_types to authenticated;

alter table public.match_types enable row level security;

-- Readable by everyone: the type is printed on the public match page, and
-- there is nothing private about the word "Tournament".
create policy match_types_select on public.match_types
  for select using (true);
create policy match_types_admin_write on public.match_types
  for all using (public.is_admin()) with check (public.is_admin());
