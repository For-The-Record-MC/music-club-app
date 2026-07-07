-- Bonus lines unlock on CLAIM, not verification. Waiting for a peer to clear
-- your last line stalled the completionist path — now the moment every
-- qualifying line has a live (pending or verified) claim, the next line opens
-- and you can keep playing while review catches up. A rejected claim just
-- means that earlier line needs fixing and re-claiming; the already-unlocked
-- bonus line stays (you'd have earned it anyway once fixed).
--
-- resolve_bingo_claim keeps its all-verified expansion check as a harmless
-- backstop; claim-time is the primary trigger.

create or replace function public.claim_bingo(p_card uuid, p_line int)
returns public.bingo_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card public.bingo_cards;
  v_game public.bingo_games;
  v_claim public.bingo_claims;
  v_missing int;
  v_claimed int;
  v_next smallint;
begin
  select * into v_card from bingo_cards where id = p_card;
  if not found then
    raise exception 'Card not found';
  end if;
  if v_card.profile_id <> auth.uid() then
    raise exception 'Not your card';
  end if;
  select * into v_game from bingo_games where id = v_card.game_id;
  if v_game.status <> 'open' then
    raise exception 'The game is closed';
  end if;
  if not (p_line = any (v_card.qualifying_lines)) then
    raise exception 'That line is not one of your qualifying lines';
  end if;
  if exists (
    select 1 from bingo_claims
    where card_id = p_card and line_index = p_line and status in ('pending', 'verified')
  ) then
    raise exception 'That line is already claimed';
  end if;

  select count(*) into v_missing
  from unnest(public.bingo_line_positions(p_line)) as pos
  where pos <> 12
    and not exists (
      select 1 from bingo_boxes b
      where b.card_id = p_card and b.position = pos and b.activated_at is not null
    );
  if v_missing > 0 then
    raise exception 'Light every box on the line first (% to go)', v_missing;
  end if;

  insert into bingo_claims (card_id, line_index)
  values (p_card, p_line)
  returning * into v_claim;

  perform public.publish_activity_event(
    v_game.club_id, 'bingo_claimed',
    jsonb_build_object('game_id', v_game.id, 'line_index', p_line)
  );

  -- Every qualifying line now live-claimed → unlock the next line right away
  -- (random from the ones this card wasn't dealt), up to all 12.
  select count(*) into v_claimed
  from bingo_claims
  where card_id = p_card and status in ('pending', 'verified')
    and line_index = any (v_card.qualifying_lines);
  if v_claimed >= array_length(v_card.qualifying_lines, 1)
     and array_length(v_card.qualifying_lines, 1) < 12 then
    select l::smallint into v_next
    from generate_series(0, 11) as l
    where not (l::smallint = any (v_card.qualifying_lines))
    order by random()
    limit 1;
    if v_next is not null then
      update bingo_cards
      set qualifying_lines = qualifying_lines || v_next
      where id = p_card;
    end if;
  end if;

  return v_claim;
end;
$$;
