-- Listening Bingo: cap concurrent listens at 3 per card.
--
-- Boxes' listen timers run independently, which is right for playlist-style
-- listening but lets a speedrunner tap out on all 24 boxes and wait one song
-- length to light the whole card. A cap of 3 tolerates casual queuing while
-- keeping a full card at roughly real listening wall-clock. Marking a box
-- listened (or swapping its song) frees a slot.

create or replace function public.start_bingo_listen(p_box uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_box public.bingo_boxes;
  v_card public.bingo_cards;
  v_game public.bingo_games;
  v_listening int;
begin
  select * into v_box from bingo_boxes where id = p_box;
  if not found then
    raise exception 'Box not found';
  end if;
  select * into v_card from bingo_cards where id = v_box.card_id;
  if v_card.profile_id <> auth.uid() then
    raise exception 'Not your card';
  end if;
  select * into v_game from bingo_games where id = v_card.game_id;
  if v_game.status <> 'open' then
    raise exception 'The game is closed';
  end if;
  if v_box.title is null then
    raise exception 'Pick a song first';
  end if;
  if v_box.activated_at is not null then
    return; -- already lit
  end if;

  -- Re-tapping the same box just restarts its own timer; only OTHER boxes
  -- count against the cap.
  select count(*) into v_listening
  from bingo_boxes
  where card_id = v_card.id and id <> p_box
    and listen_started_at is not null and activated_at is null;
  if v_listening >= 3 then
    raise exception 'You already have 3 songs in the listening state — mark one listened first';
  end if;

  update bingo_boxes set listen_started_at = now() where id = p_box;
end;
$$;
