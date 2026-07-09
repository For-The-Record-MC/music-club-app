-- One-time redeal: this member's untouched cards (no songs, no claims) were
-- dealt from pre-expansion 175-label pools; regenerate them from their games'
-- now-1000-label pools, avoiding categories already on the member's other
-- cards in the same game (mirrors bingo_deal_internal's freshness rule).
-- Explicitly requested by the card owner; zero data loss by construction.

do $$
declare
  v_profile uuid;
  v_card record;
begin
  select id into v_profile from profiles where email = 'jordanreticker@gmail.com';

  for v_card in
    select k.id, k.game_id
    from bingo_cards k
    join bingo_games g on g.id = k.game_id
    where k.profile_id = v_profile and g.status = 'open'
      and not exists (select 1 from bingo_boxes b where b.card_id = k.id and b.title is not null)
      and not exists (select 1 from bingo_claims c where c.card_id = k.id)
  loop
    delete from bingo_boxes where card_id = v_card.id;

    update bingo_cards
    set qualifying_lines = (
      select array_agg(l::smallint order by ord)
      from (
        select l, random() as ord from generate_series(0, 11) as l order by 2 limit 3
      ) picked(l, ord)
    )
    where id = v_card.id;

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
        where gc.game_id = v_card.game_id
          and not exists (
            select 1 from bingo_boxes b
            join bingo_cards k2 on k2.id = b.card_id
            where k2.game_id = v_card.game_id and k2.profile_id = v_profile
              and k2.id <> v_card.id and b.category_id = gc.id
          )
        order by random() limit 24
      ) sub
    ) c on c.rn = p.rn;
  end loop;
end;
$$;
