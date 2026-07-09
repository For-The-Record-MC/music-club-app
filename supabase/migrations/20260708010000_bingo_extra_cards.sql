-- Bingo: no double-counted bingos + up to 3 cards per cycle.
--
-- 1) Bonus lines must demand NEW listening. Unlocks now draw only from lines
--    that are not already fully lit — before this, a fully-lit board turned
--    every unlock into an instant free bingo, cascading to all 12 lines
--    (double counting). When every candidate line is already lit, nothing
--    unlocks: the blackout is the trophy, not a bingo printer.
-- 2) A fully-lit (blackout) card can request a FRESH card — up to 3 per game.
--    Cards get a card_number; the room plays on the latest, earlier cards
--    stay browsable and their claims stand.
-- 3) One-time repair for the card that hit the cascade before the fix: its
--    six pending pre-completed claims are removed and those lines revoked
--    (peer-verified claims stand — humans signed off on those).

alter table public.bingo_cards add column card_number smallint not null default 1;
alter table public.bingo_cards drop constraint bingo_cards_game_id_profile_id_key;
alter table public.bingo_cards add constraint bingo_cards_game_profile_number_key
  unique (game_id, profile_id, card_number);

-- ═══════════════════════════════════════════════════════
-- Shared dealing helper (card + 24 boxes + 3 random lines)
-- ═══════════════════════════════════════════════════════

create or replace function public.bingo_deal_internal(p_game uuid, p_card_number int)
returns public.bingo_cards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card public.bingo_cards;
  v_lines smallint[];
begin
  select array_agg(l::smallint order by ord) into v_lines
  from (
    select l, random() as ord from generate_series(0, 11) as l order by 2 limit 3
  ) picked(l, ord);

  insert into bingo_cards (game_id, profile_id, qualifying_lines, card_number)
  values (p_game, auth.uid(), v_lines, p_card_number)
  returning * into v_card;

  insert into bingo_boxes (card_id, position, category_id)
  select v_card.id, p.pos, c.id
  from (
    select pos, row_number() over (order by random()) as rn
    from generate_series(0, 24) as pos
    where pos <> 12
  ) p
  join (
    select id, row_number() over (order by random()) as rn
    from (select id from bingo_game_categories where game_id = p_game order by random() limit 24) sub
  ) c on c.rn = p.rn;

  if (select count(*) from bingo_boxes where card_id = v_card.id) < 24 then
    raise exception 'The category pool is too small to deal a card';
  end if;

  return v_card;
end;
$$;

revoke execute on function public.bingo_deal_internal(uuid, int) from anon, public;

-- deal_bingo_card: idempotent as before, now returns the LATEST card.
create or replace function public.deal_bingo_card(p_game uuid)
returns public.bingo_cards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.bingo_games;
  v_card public.bingo_cards;
begin
  select * into v_game from bingo_games where id = p_game;
  if not found then
    raise exception 'Game not found';
  end if;
  if not public.is_club_member(v_game.club_id) then
    raise exception 'Not a club member';
  end if;

  select * into v_card from bingo_cards
  where game_id = p_game and profile_id = auth.uid()
  order by card_number desc limit 1;
  if found then
    return v_card;
  end if;
  if v_game.status <> 'open' then
    raise exception 'The game is closed';
  end if;

  return public.bingo_deal_internal(p_game, 1);
end;
$$;

-- The blackout reward: a fully-lit latest card unlocks a fresh one, max 3.
create or replace function public.request_bingo_card(p_game uuid)
returns public.bingo_cards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.bingo_games;
  v_card public.bingo_cards;
  v_count int;
begin
  select * into v_game from bingo_games where id = p_game;
  if not found then
    raise exception 'Game not found';
  end if;
  if not public.is_club_member(v_game.club_id) then
    raise exception 'Not a club member';
  end if;
  if v_game.status <> 'open' then
    raise exception 'The game is closed';
  end if;

  select count(*) into v_count from bingo_cards
  where game_id = p_game and profile_id = auth.uid();
  if v_count = 0 then
    raise exception 'Open the room to get your first card';
  end if;
  if v_count >= 3 then
    raise exception 'Three cards is the cycle limit — see you next cycle';
  end if;

  select * into v_card from bingo_cards
  where game_id = p_game and profile_id = auth.uid()
  order by card_number desc limit 1;
  if (select count(*) from bingo_boxes b where b.card_id = v_card.id and b.activated_at is not null) < 24 then
    raise exception 'Light every box on your current card first';
  end if;

  return public.bingo_deal_internal(p_game, v_count + 1);
end;
$$;

revoke execute on function public.request_bingo_card(uuid) from anon, public;

-- ═══════════════════════════════════════════════════════
-- Unlocks draw only from lines that still need listening
-- ═══════════════════════════════════════════════════════

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

  -- Every qualifying line live-claimed → unlock the next line, but ONLY from
  -- lines that still have unlit boxes: a pre-completed line would be a free
  -- bingo (double counting). No candidates → the card is done; blackout (and
  -- a fresh card) is the reward.
  select count(*) into v_claimed
  from bingo_claims
  where card_id = p_card and status in ('pending', 'verified')
    and line_index = any (v_card.qualifying_lines);
  if v_claimed >= array_length(v_card.qualifying_lines, 1)
     and array_length(v_card.qualifying_lines, 1) < 12 then
    select l::smallint into v_next
    from generate_series(0, 11) as l
    where not (l::smallint = any (v_card.qualifying_lines))
      and exists (
        select 1 from unnest(public.bingo_line_positions(l)) as pos
        where pos <> 12
          and not exists (
            select 1 from bingo_boxes b
            where b.card_id = p_card and b.position = pos and b.activated_at is not null
          )
      )
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

-- Same eligibility rule for the verify-time backstop.
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

    select count(*) into v_verified
    from bingo_claims
    where card_id = v_card.id and status = 'verified'
      and line_index = any (v_card.qualifying_lines);
    if v_verified >= array_length(v_card.qualifying_lines, 1)
       and array_length(v_card.qualifying_lines, 1) < 12 then
      select l::smallint into v_next
      from generate_series(0, 11) as l
      where not (l::smallint = any (v_card.qualifying_lines))
        and exists (
          select 1 from unnest(public.bingo_line_positions(l)) as pos
          where pos <> 12
            and not exists (
              select 1 from bingo_boxes b
              where b.card_id = v_card.id and b.position = pos and b.activated_at is not null
            )
        )
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

-- ═══════════════════════════════════════════════════════
-- One-time repair: card 0a57401b hit the pre-fix cascade after a full-board
-- blackout. Remove its six pending pre-completed claims and revoke those
-- lines; the six peer-verified claims stand.
-- ═══════════════════════════════════════════════════════

do $$
declare
  v_card_id uuid := '0a57401b-a19d-4b7b-a963-13b92ce3e911';
  v_pending smallint[];
begin
  select array_agg(line_index) into v_pending
  from bingo_claims
  where card_id = v_card_id and status = 'pending';

  if v_pending is not null then
    delete from bingo_claims where card_id = v_card_id and status = 'pending';
    update bingo_cards
    set qualifying_lines = (
      select array_agg(l order by ord)
      from unnest(qualifying_lines) with ordinality as q(l, ord)
      where not (l = any (v_pending))
    )
    where id = v_card_id;
  end if;
end;
$$;
