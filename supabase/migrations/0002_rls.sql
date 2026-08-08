-- security definer so policies on profiles cannot recurse into themselves
create function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- helper: is this match visible to the caller?
create function public.match_is_visible(p_match_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.matches m
    where m.id = p_match_id
      and (m.status = 'published' or public.is_admin())
  );
$$;

-- Table-level privileges come first; RLS narrows them, it does not grant them.
-- Migrations run as supabase_admin, so the default privileges that would
-- normally cover anon/authenticated do not apply and must be spelled out.
grant usage on schema public to anon, authenticated;

grant select on
  public.players, public.matches, public.match_players,
  public.rallies, public.match_game_starts
  to anon, authenticated;

-- Only signed-in users ever read profiles, and the policy limits them to
-- their own row.
grant select on public.profiles to authenticated;

-- Write privileges are granted broadly to authenticated and then narrowed to
-- admins by the policies below.
grant insert, update, delete on
  public.players, public.matches, public.match_players,
  public.rallies, public.match_game_starts
  to authenticated;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.match_is_visible(uuid) to anon, authenticated;

alter table public.profiles          enable row level security;
alter table public.players           enable row level security;
alter table public.matches           enable row level security;
alter table public.match_players     enable row level security;
alter table public.rallies           enable row level security;
alter table public.match_game_starts enable row level security;

-- profiles: read your own row only. No insert/update/delete policies at all,
-- deliberately: an UPDATE policy on your own row would let any guest promote
-- themselves to admin. Roles are changed by SQL only; the trigger inserts.
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());

-- players: world-readable (they are referenced by published matches).
create policy players_select_all on public.players
  for select using (true);
create policy players_admin_write on public.players
  for all using (public.is_admin()) with check (public.is_admin());

-- matches: published are public; drafts are admin-only.
create policy matches_select_visible on public.matches
  for select using (status = 'published' or public.is_admin());
create policy matches_admin_write on public.matches
  for all using (public.is_admin()) with check (public.is_admin());

-- child tables inherit their parent match's visibility.
create policy match_players_select on public.match_players
  for select using (public.match_is_visible(match_id));
create policy match_players_admin_write on public.match_players
  for all using (public.is_admin()) with check (public.is_admin());

create policy rallies_select on public.rallies
  for select using (public.match_is_visible(match_id));
create policy rallies_admin_write on public.rallies
  for all using (public.is_admin()) with check (public.is_admin());

create policy game_starts_select on public.match_game_starts
  for select using (public.match_is_visible(match_id));
create policy game_starts_admin_write on public.match_game_starts
  for all using (public.is_admin()) with check (public.is_admin());
