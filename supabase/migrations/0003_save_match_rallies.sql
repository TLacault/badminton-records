-- Replaces a match's entire rally log in one transaction. Whole-log replacement
-- avoids diffing an array where a mid-list insert renumbers everything after it;
-- the deferrable unique index on (match_id, idx) is what makes that legal.
--
-- security invoker: RLS on public.rallies is the real enforcement. The explicit
-- is_admin() check just turns a silent no-op into a clear error.
create function public.save_match_rallies(p_match_id uuid, p_rallies jsonb)
returns void
language plpgsql
security invoker
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden: admin role required';
  end if;

  if jsonb_typeof(p_rallies) is distinct from 'array' then
    raise exception 'p_rallies must be a JSON array';
  end if;

  delete from public.rallies where match_id = p_match_id;

  insert into public.rallies (
    match_id, idx, winner_side, is_let, is_highlight,
    scored_by_player_id, ended_at_seconds
  )
  select
    p_match_id,
    (r->>'idx')::int,
    nullif(r->>'winnerSide', '')::smallint,
    coalesce((r->>'isLet')::boolean, false),
    coalesce((r->>'isHighlight')::boolean, false),
    nullif(r->>'scoredByPlayerId', '')::uuid,
    (r->>'endedAtSeconds')::numeric
  from jsonb_array_elements(p_rallies) as r;

  update public.matches set updated_at = now() where id = p_match_id;
end;
$$;

grant execute on function public.save_match_rallies(uuid, jsonb) to authenticated;
