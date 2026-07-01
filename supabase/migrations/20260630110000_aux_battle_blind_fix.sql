-- Fix: the opponent-blind policy on aux_battle_songs selected from
-- aux_battle_songs inside its own USING clause, which re-triggers the policy →
-- "infinite recursion detected in policy" → every read of the table errors, so
-- the Aux Battle screen came back empty.
--
-- Move the "has the viewer submitted in this battle?" check into a SECURITY
-- DEFINER function, which reads the table with the owner's rights (bypassing RLS)
-- and so doesn't recurse.

create or replace function public.aux_has_submitted(p_battle uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from aux_battle_songs
    where battle_id = p_battle and profile_id = auth.uid()
  );
$$;

revoke execute on function public.aux_has_submitted(uuid) from anon;

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
      or public.aux_has_submitted(battle_id)
    )
  );
