-- Dead time: the interval between games, or any stoppage worth skipping on
-- playback.
--
-- Deliberately NOT part of the rally log. Breaks score nothing, so feeding them
-- through the scoring engine would only add a case to every derivation. They
-- are presentation: the timeline draws them, the player can skip them.
create table public.match_breaks (
  match_id         uuid not null references public.matches on delete cascade,
  idx              int not null check (idx >= 0),
  starts_at_seconds numeric not null check (starts_at_seconds >= 0),
  -- null while the break is still open: `m` opens it, a second `m` closes it.
  ends_at_seconds   numeric check (ends_at_seconds >= starts_at_seconds),
  primary key (match_id, idx)
);

create index match_breaks_match_idx on public.match_breaks (match_id, idx);

grant select on public.match_breaks to anon, authenticated;
grant insert, update, delete on public.match_breaks to authenticated;

alter table public.match_breaks enable row level security;

-- Same visibility rule as every other child of a match.
create policy match_breaks_select on public.match_breaks
  for select using (public.match_is_visible(match_id));
create policy match_breaks_admin_write on public.match_breaks
  for all using (public.is_admin()) with check (public.is_admin());
