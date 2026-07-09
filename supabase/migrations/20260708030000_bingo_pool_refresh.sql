-- Two de-repetition fixes for bingo cards:
--
-- 1) Open games' pools were 175-label launch snapshots; the built-in pool is
--    now 1000. Append the full built-in set to every OPEN game so cards
--    dealt from here draw from the big pool (dealt cards are untouched).
--    Admin-dropped labels can't be distinguished in the snapshot, so this
--    consciously re-adds everything — acceptable for the pool-size win.
-- 2) bingo_deal_internal now avoids categories already on the member's OWN
--    earlier cards in the game (a fresh card should feel fresh), falling back
--    to the full pool when there aren't 24 unseen categories left.

insert into public.bingo_game_categories (game_id, label)
select g.id, c.label
from public.bingo_games g
cross join public.bingo_categories c
where g.status = 'open'
on conflict (game_id, label) do nothing;

create or replace function public.bingo_deal_internal(p_game uuid, p_card_number int)
returns public.bingo_cards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card public.bingo_cards;
  v_lines smallint[];
  v_fresh int;
begin
  select array_agg(l::smallint order by ord) into v_lines
  from (
    select l, random() as ord from generate_series(0, 11) as l order by 2 limit 3
  ) picked(l, ord);

  insert into bingo_cards (game_id, profile_id, qualifying_lines, card_number)
  values (p_game, auth.uid(), v_lines, p_card_number)
  returning * into v_card;

  -- Prefer categories this member hasn't already had in this game.
  select count(*) into v_fresh
  from bingo_game_categories gc
  where gc.game_id = p_game
    and not exists (
      select 1 from bingo_boxes b
      join bingo_cards k on k.id = b.card_id
      where k.game_id = p_game and k.profile_id = auth.uid()
        and k.id <> v_card.id and b.category_id = gc.id
    );

  insert into bingo_boxes (card_id, position, category_id)
  select v_card.id, p.pos, c.id
  from (
    select pos, row_number() over (order by random()) as rn
    from generate_series(0, 24) as pos
    where pos <> 12
  ) p
  join (
    select id, row_number() over (order by random()) as rn
    from (
      select gc.id from bingo_game_categories gc
      where gc.game_id = p_game
        and (
          v_fresh < 24
          or not exists (
            select 1 from bingo_boxes b
            join bingo_cards k on k.id = b.card_id
            where k.game_id = p_game and k.profile_id = auth.uid()
              and k.id <> v_card.id and b.category_id = gc.id
          )
        )
      order by random() limit 24
    ) sub
  ) c on c.rn = p.rn;

  if (select count(*) from bingo_boxes where card_id = v_card.id) < 24 then
    raise exception 'The category pool is too small to deal a card';
  end if;

  return v_card;
end;
$$;
