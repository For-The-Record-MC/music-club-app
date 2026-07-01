-- Aux Battle: seal the 1v1. Two rules, both enforced server-side:
--   1. A combatant can't see their opponent's song until they've submitted their
--      own. (Voters — non-combatants — still see both, since they need them.)
--   2. Once BOTH combatants have submitted, songs lock — no more changes.
-- Rule 1 is an RLS visibility policy; rule 2 is a guard in submit_aux_song.

-- ── Rule 1: opponent-blind song visibility ──────────────────────────────────
drop policy aux_battle_songs_select on public.aux_battle_songs;
create policy aux_battle_songs_select on public.aux_battle_songs
  for select to authenticated
  using (
    exists (select 1 from aux_battles ab where ab.id = battle_id and public.is_club_member(ab.club_id))
    and (
      -- Voters (not in this battle) see every song.
      not exists (
        select 1 from aux_battles ab
        where ab.id = battle_id and (ab.member_a = auth.uid() or ab.member_b = auth.uid())
      )
      -- Your own song is always visible to you.
      or profile_id = auth.uid()
      -- A combatant sees the opponent's song only after submitting their own.
      or exists (
        select 1 from aux_battle_songs mine
        where mine.battle_id = battle_id and mine.profile_id = auth.uid()
      )
    )
  );

-- ── Rule 2: lock once both combatants have submitted ────────────────────────
create or replace function public.submit_aux_song(
  p_battle uuid,
  p_title text,
  p_artist text default '',
  p_artwork_url text default null,
  p_spotify_url text default null,
  p_apple_url text default null
)
returns public.aux_battle_songs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_battle public.aux_battles;
  v_status text;
  v_row public.aux_battle_songs;
begin
  select * into v_battle from aux_battles where id = p_battle;
  if not found then
    raise exception 'Battle not found';
  end if;
  if auth.uid() <> v_battle.member_a and auth.uid() <> v_battle.member_b then
    raise exception 'Only the two combatants can submit a song';
  end if;
  select status into v_status from cycles where id = v_battle.cycle_id;
  if v_status <> 'open' then
    raise exception 'The battle is closed';
  end if;
  if char_length(trim(coalesce(p_title, ''))) = 0 then
    raise exception 'A song title is required';
  end if;
  -- Once both combatants have a song in, submissions are locked (this includes
  -- changing your own). The second submitter still gets through: only one row
  -- exists at that point.
  if (select count(*) from aux_battle_songs where battle_id = p_battle) >= 2 then
    raise exception 'Both songs are locked in — no more changes.';
  end if;

  insert into aux_battle_songs (battle_id, profile_id, title, artist, artwork_url, spotify_url, apple_url)
  values (p_battle, auth.uid(), trim(p_title), coalesce(p_artist, ''), p_artwork_url, p_spotify_url, p_apple_url)
  on conflict (battle_id, profile_id) do update
    set title = excluded.title, artist = excluded.artist, artwork_url = excluded.artwork_url,
        spotify_url = excluded.spotify_url, apple_url = excluded.apple_url
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.submit_aux_song(uuid, text, text, text, text, text) from anon, public;
