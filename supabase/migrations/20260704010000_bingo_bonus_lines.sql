-- Listening Bingo bonus lines: finishing all your qualifying lines unlocks
-- another (random, from the 9 you weren't dealt), and so on up to all 12 —
-- the completionist path to a full-card blackout. A line "finishes" when its
-- claim is peer-VERIFIED, so the unlock lives in resolve_bingo_claim; forced
-- self-certifications at close don't expand (the game is over).

alter table public.bingo_cards drop constraint bingo_cards_qualifying_lines_check;
alter table public.bingo_cards add constraint bingo_cards_qualifying_lines_check
  check (array_length(qualifying_lines, 1) between 3 and 12);

create or replace function public.resolve_bingo_claim(
  p_claim uuid,
  p_approve boolean,
  p_challenges jsonb default '[]'::jsonb
)
returns public.bingo_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.bingo_claims;
  v_card public.bingo_cards;
  v_game public.bingo_games;
  v_line int[];
  ch jsonb;
  v_pos int;
  v_rank int;
  v_claimer text;
  v_verified int;
  v_next smallint;
begin
  select * into v_claim from bingo_claims where id = p_claim;
  if not found then
    raise exception 'Claim not found';
  end if;
  select * into v_card from bingo_cards where id = v_claim.card_id;
  select * into v_game from bingo_games where id = v_card.game_id;
  if not public.is_club_member(v_game.club_id) then
    raise exception 'Not a club member';
  end if;
  if v_card.profile_id = auth.uid() then
    raise exception 'You cannot clear your own bingo — that is the whole point';
  end if;
  if v_game.status <> 'open' then
    raise exception 'The game is closed';
  end if;
  if v_claim.status <> 'pending' then
    raise exception 'That claim is already resolved';
  end if;

  if p_approve then
    update bingo_claims
    set status = 'verified', resolved_by = auth.uid(), resolved_at = now()
    where id = p_claim
    returning * into v_claim;

    select count(*) into v_rank
    from bingo_claims c
    join bingo_cards k on k.id = c.card_id
    where k.game_id = v_game.id and c.status = 'verified';

    select display_name into v_claimer from profiles where id = v_card.profile_id;
    perform public.publish_activity_event(
      v_game.club_id, 'bingo_verified',
      jsonb_build_object('game_id', v_game.id, 'claimer_name', v_claimer, 'rank', v_rank)
    );

    -- Every qualifying line verified → unlock a bonus line (random pick from
    -- the ones this card wasn't dealt), until all 12 are in play.
    select count(*) into v_verified
    from bingo_claims
    where card_id = v_card.id and status = 'verified'
      and line_index = any (v_card.qualifying_lines);
    if v_verified >= array_length(v_card.qualifying_lines, 1)
       and array_length(v_card.qualifying_lines, 1) < 12 then
      select l::smallint into v_next
      from generate_series(0, 11) as l
      where not (l::smallint = any (v_card.qualifying_lines))
      order by random()
      limit 1;
      if v_next is not null then
        update bingo_cards
        set qualifying_lines = qualifying_lines || v_next
        where id = v_card.id;
      end if;
    end if;

    return v_claim;
  end if;

  if jsonb_typeof(p_challenges) <> 'array' or jsonb_array_length(p_challenges) = 0 then
    raise exception 'Say which box fails and why';
  end if;
  v_line := public.bingo_line_positions(v_claim.line_index);
  for ch in select * from jsonb_array_elements(p_challenges) loop
    v_pos := (ch ->> 'position')::int;
    if v_pos is null or not (v_pos = any (v_line)) or v_pos = 12 then
      raise exception 'Challenged box % is not on the claimed line', v_pos;
    end if;
    if char_length(trim(coalesce(ch ->> 'reason', ''))) = 0 then
      raise exception 'Every challenge needs a reason';
    end if;
    insert into bingo_challenges (claim_id, position, challenger_id, reason)
    values (p_claim, v_pos, auth.uid(), trim(ch ->> 'reason'));
    -- The box goes dark: swap the song (or keep it) and listen again to relight.
    update bingo_boxes
    set activated_at = null, listen_started_at = null
    where card_id = v_card.id and position = v_pos;
  end loop;

  update bingo_claims
  set status = 'rejected', resolved_by = auth.uid(), resolved_at = now()
  where id = p_claim
  returning * into v_claim;

  return v_claim;
end;
$$;
