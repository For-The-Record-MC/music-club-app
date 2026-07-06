-- Repair: unlock the bonus line on cards that hit the all-lines-claimed
-- milestone BEFORE unlock-on-claim shipped (20260704020000). The unlock only
-- runs inside claim_bingo/resolve_bingo_claim, so a card fully claimed before
-- those migrations never got checked and sat stuck at 3 lines.
--
-- One line per eligible card (matching the normal single-unlock per
-- milestone); claiming the new line triggers the next unlock via the RPC as
-- usual. Idempotent: cards whose newest line is unclaimed don't qualify.

do $$
declare
  v_card public.bingo_cards;
  v_next smallint;
begin
  for v_card in
    select k.* from bingo_cards k
    join bingo_games g on g.id = k.game_id
    where g.status = 'open'
      and array_length(k.qualifying_lines, 1) < 12
      and not exists (
        select 1 from unnest(k.qualifying_lines) as ql
        where not exists (
          select 1 from bingo_claims c
          where c.card_id = k.id and c.line_index = ql
            and c.status in ('pending', 'verified')
        )
      )
  loop
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
  end loop;
end;
$$;
