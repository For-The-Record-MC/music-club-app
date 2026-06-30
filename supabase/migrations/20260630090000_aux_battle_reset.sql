-- Let the picker/admin re-roll the Aux Battle bracket while the cycle is open.
-- Clears the cycle's matchups (cascading their songs + votes) and returns any
-- themes spent this cycle to the pool, so start_aux_battle can run fresh. Useful
-- after a roster change or a stale bracket (e.g. one left over from an earlier
-- single-matchup build).

create or replace function public.reset_aux_battle(p_cycle uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle public.cycles;
begin
  select * into v_cycle from cycles where id = p_cycle;
  if not found then
    raise exception 'Cycle not found';
  end if;
  if v_cycle.status <> 'open' then
    raise exception 'The cycle is closed';
  end if;
  if v_cycle.picker_id <> auth.uid()
     and public.club_role(v_cycle.club_id) not in ('owner', 'admin') then
    raise exception 'Only the picker or an admin can reset the bracket';
  end if;

  update aux_battle_theme_ideas set used_cycle_id = null where used_cycle_id = p_cycle;
  delete from aux_battles where cycle_id = p_cycle;
end;
$$;

revoke execute on function public.reset_aux_battle(uuid) from anon, public;
