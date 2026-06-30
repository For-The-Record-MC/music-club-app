-- Aux Battle, take 2: a full bracket instead of one featured matchup.
-- Every cycle, ALL members are shuffled into pairs (an odd member out gets a bye
-- and sits the cycle out), and each pair gets its OWN theme. Members vote on
-- every battle except their own; each battle is crowned independently at close.
--
-- This relaxes the one-battle-per-cycle constraint and rewrites the kickoff +
-- close logic. Themes are drawn distinct from the pool while it lasts, then reused
-- so kickoff never fails. Tables/songs/votes/RLS from the prior migration stand.

-- A cycle now holds MANY battles.
alter table public.aux_battles drop constraint aux_battles_cycle_id_key;
create index aux_battles_cycle_idx on public.aux_battles (cycle_id);

-- The single-theme kickoff is replaced by the bracket generator below.
drop function if exists public.start_aux_battle(uuid, text, uuid);

-- Generate the cycle's bracket: shuffle members into pairs, hand each pair its own
-- theme, push both combatants. Returns the number of matchups created. Picker or
-- admin, while the cycle is open, once per cycle.
create or replace function public.start_aux_battle(p_cycle uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle public.cycles;
  v_members uuid[];
  v_n integer;
  v_pairs integer;
  v_idea_ids uuid[];
  v_idea_texts text[];
  v_all_texts text[];
  v_a uuid;
  v_b uuid;
  v_theme text;
  v_idea_id uuid;
  i integer;
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
    raise exception 'Only the picker or an admin can start the Aux Battle';
  end if;
  if exists (select 1 from aux_battles where cycle_id = p_cycle) then
    raise exception 'The Aux Battle bracket has already been set';
  end if;

  -- Shuffle the whole roster.
  select array(select cm.profile_id from club_members cm where cm.club_id = v_cycle.club_id order by random())
    into v_members;
  v_n := coalesce(array_length(v_members, 1), 0);
  if v_n < 2 then
    raise exception 'Need at least 2 members for an Aux Battle';
  end if;
  v_pairs := v_n / 2; -- integer division; an odd member out gets a bye

  -- Distinct unused themes (club + global), shuffled.
  select array_agg(id order by rnd), array_agg(text order by rnd)
    into v_idea_ids, v_idea_texts
  from (
    select id, text, random() as rnd
    from aux_battle_theme_ideas
    where used_cycle_id is null and (club_id is null or club_id = v_cycle.club_id)
  ) q;

  -- Full pool of theme texts, for reuse once the unused set runs out.
  select array_agg(text) into v_all_texts
  from aux_battle_theme_ideas where club_id is null or club_id = v_cycle.club_id;
  if coalesce(array_length(v_all_texts, 1), 0) = 0 then
    v_all_texts := array['Best song'];
  end if;

  for i in 1..v_pairs loop
    v_a := v_members[2 * i - 1];
    v_b := v_members[2 * i];
    if i <= coalesce(array_length(v_idea_ids, 1), 0) then
      v_theme := v_idea_texts[i];
      v_idea_id := v_idea_ids[i];
    else
      v_theme := v_all_texts[1 + floor(random() * array_length(v_all_texts, 1))::int];
      v_idea_id := null;
    end if;

    insert into aux_battles (cycle_id, club_id, theme_text, theme_idea_id, member_a, member_b, created_by)
    values (p_cycle, v_cycle.club_id, v_theme, v_idea_id, v_a, v_b, auth.uid());

    if v_idea_id is not null then
      update aux_battle_theme_ideas set used_cycle_id = p_cycle where id = v_idea_id;
    end if;

    insert into activity_events (club_id, actor_id, recipient_id, event_type, payload)
    select v_cycle.club_id, auth.uid(), m, 'aux_battle_picked',
      jsonb_build_object('cycle_number', v_cycle.number, 'theme', v_theme)
    from unnest(array[v_a, v_b]) as m;
  end loop;

  perform public.publish_activity_event(
    v_cycle.club_id, 'aux_battle_started',
    jsonb_build_object('cycle_number', v_cycle.number, 'cycle_id', p_cycle, 'pairs', v_pairs)
  );

  return v_pairs;
end;
$$;

revoke execute on function public.start_aux_battle(uuid) from anon, public;

-- ═══════════════════════════════════════════════════════
-- CLOSE_CYCLE — crown EVERY battle in the cycle (not just one).
-- Re-created in full; the showdown block is unchanged.
-- ═══════════════════════════════════════════════════════

create or replace function public.close_cycle(p_cycle uuid)
returns public.cycles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle public.cycles;
  v_sd public.showdowns;
  v_winner uuid;
  v_w_title text;
  v_w_artist text;
  v_w_name text;
  v_battle public.aux_battles;
  v_a_votes integer;
  v_b_votes integer;
  v_ab_winner uuid;
  v_ab_name text;
begin
  select * into v_cycle from cycles where id = p_cycle;
  if not found then
    raise exception 'Cycle not found';
  end if;
  if public.club_role(v_cycle.club_id) not in ('owner', 'admin') then
    raise exception 'Admin access required';
  end if;
  if v_cycle.status <> 'open' then
    raise exception 'Cycle is already closed';
  end if;
  update cycles
  set status = 'closed',
      closed_at = now(),
      revealed_at = coalesce(revealed_at, now())
  where id = p_cycle
  returning * into v_cycle;

  -- Crown the showdown winner: highest net (sum of votes), tiebreak by most
  -- upvotes, then earliest submission.
  select * into v_sd from showdowns where cycle_id = p_cycle;
  if found then
    select s.id, s.title, s.artist, p.display_name
      into v_winner, v_w_title, v_w_artist, v_w_name
    from showdown_submissions s
    join profiles p on p.id = s.profile_id
    where s.showdown_id = v_sd.id
    order by
      coalesce((select sum(v.value) from showdown_votes v where v.submission_id = s.id), 0) desc,
      coalesce((select count(*) from showdown_votes v where v.submission_id = s.id and v.value = 1), 0) desc,
      s.created_at asc
    limit 1;

    if v_winner is not null then
      update showdowns set winner_submission_id = v_winner where id = v_sd.id;
      perform public.publish_activity_event(
        v_cycle.club_id, 'showdown_winner',
        jsonb_build_object(
          'cycle_number', v_cycle.number, 'cycle_id', p_cycle,
          'title', v_w_title, 'artist', v_w_artist, 'submitter_name', v_w_name
        )
      );
    end if;
  end if;

  -- Crown EACH Aux Battle in the cycle: more votes wins; a tie credits no one.
  for v_battle in select * from aux_battles where cycle_id = p_cycle loop
    select count(*) filter (where choice = v_battle.member_a),
           count(*) filter (where choice = v_battle.member_b)
      into v_a_votes, v_b_votes
    from aux_battle_votes where battle_id = v_battle.id;

    if v_a_votes > v_b_votes then
      v_ab_winner := v_battle.member_a;
    elsif v_b_votes > v_a_votes then
      v_ab_winner := v_battle.member_b;
    else
      v_ab_winner := null;
    end if;

    if v_ab_winner is not null then
      update aux_battles set winner_profile_id = v_ab_winner where id = v_battle.id;
      select display_name into v_ab_name from profiles where id = v_ab_winner;
      perform public.publish_activity_event(
        v_cycle.club_id, 'aux_battle_winner',
        jsonb_build_object(
          'cycle_number', v_cycle.number, 'cycle_id', p_cycle,
          'theme', v_battle.theme_text, 'winner_name', v_ab_name
        )
      );
    end if;
  end loop;

  perform public.publish_activity_event(
    v_cycle.club_id, 'cycle_closed',
    jsonb_build_object('cycle_number', v_cycle.number, 'cycle_id', v_cycle.id)
  );

  return v_cycle;
end;
$$;

revoke execute on function public.close_cycle(uuid) from anon, public;
