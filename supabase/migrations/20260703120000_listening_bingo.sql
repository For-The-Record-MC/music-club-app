-- Listening Bingo: a cycle-tied studio room game. The admin/picker launches a
-- game from a curated category pool (built-ins ± admin tweaks, snapshotted per
-- game); every member gets a random 5x5 card (24 categories + free center) with
-- 3 randomly-chosen qualifying lines, dealt lazily on first open. Members fill
-- boxes with songs (Spotify search proxy), prove the listen via a link-out +
-- track-duration time gate, then hit BINGO on a completed qualifying line.
-- Claims are peer-verified box-by-box (any member except the claimer; a
-- challenge deactivates the named boxes with a reason). The game closes with
-- the cycle (or manually); pending claims at close verify as self-certified.
--
-- Boards are fully public — no spoiler guard. Writes flow through
-- security-definer RPCs; comments are direct RLS writes (Best Bars pattern).
--
-- Line indexes 0–11: 0–4 rows (top→bottom), 5–9 columns (left→right),
-- 10 main diagonal (TL→BR), 11 anti-diagonal (TR→BL). Box positions 0–24
-- row-major; 12 is the free center (no box row is created for it).

-- ═══════════════════════════════════════════════════════
-- TABLES
-- ═══════════════════════════════════════════════════════

-- The built-in category pool (global, not per club). The launch UI reads this,
-- lets the admin deselect/add, and passes the final label list to
-- create_bingo_game — customs live only in that game's snapshot.
create table public.bingo_categories (
  id uuid primary key default gen_random_uuid(),
  label text not null unique check (char_length(trim(label)) between 1 and 200),
  created_at timestamptz not null default now()
);

create table public.bingo_games (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  cycle_id uuid not null references public.cycles (id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index bingo_games_club_idx on public.bingo_games (club_id, created_at desc);
-- One live game per club at a time.
create unique index bingo_games_one_open_idx on public.bingo_games (club_id) where (status = 'open');

-- Per-game category snapshot (built-ins minus disabled plus customs, frozen at
-- launch so later pool edits can't mutate a running game). Cards draw from this.
create table public.bingo_game_categories (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.bingo_games (id) on delete cascade,
  label text not null check (char_length(trim(label)) between 1 and 200),
  unique (game_id, label)
);

create index bingo_game_categories_game_idx on public.bingo_game_categories (game_id);

-- One card per member per game, dealt lazily by deal_bingo_card on first open.
-- qualifying_lines: exactly 3 distinct line indexes (0–11), visible from the
-- start — only these can be claimed.
create table public.bingo_cards (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.bingo_games (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  qualifying_lines smallint[] not null check (array_length(qualifying_lines, 1) = 3),
  dealt_at timestamptz not null default now(),
  unique (game_id, profile_id)
);

create index bingo_cards_game_idx on public.bingo_cards (game_id);

-- 24 rows per card (positions 0–24 except the free 12), created at deal time
-- with the category assigned and the song fields empty. Box lifecycle:
--   song null                → empty
--   song set                 → filled
--   listen_started_at set    → listening (tapped out to Spotify/Apple)
--   activated_at set         → lit (time gate passed, counts toward bingo)
-- Swapping the song resets listen/activation (enforced by set_bingo_song).
create table public.bingo_boxes (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.bingo_cards (id) on delete cascade,
  position smallint not null check (position between 0 and 24 and position <> 12),
  category_id uuid not null references public.bingo_game_categories (id) on delete cascade,
  title text check (title is null or char_length(trim(title)) between 1 and 300),
  artist text not null default '',
  artwork_url text,
  spotify_url text,
  apple_url text,
  spotify_id text,
  duration_ms integer,
  listen_started_at timestamptz,
  activated_at timestamptz,
  unique (card_id, position)
);

create index bingo_boxes_card_idx on public.bingo_boxes (card_id);

-- A BINGO call on one qualifying line. pending → verified (peer or admin) or
-- rejected (with challenges naming the bad boxes). A rejected line can be
-- re-claimed after fixing the boxes (new row — history stays). self_certified
-- marks claims auto-verified at close rather than cleared by a peer.
create table public.bingo_claims (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.bingo_cards (id) on delete cascade,
  line_index smallint not null check (line_index between 0 and 11),
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  claimed_at timestamptz not null default now(),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  self_certified boolean not null default false
);

create index bingo_claims_card_idx on public.bingo_claims (card_id);
-- One live claim per line per card.
create unique index bingo_claims_one_pending_idx on public.bingo_claims (card_id, line_index)
  where (status = 'pending');
create unique index bingo_claims_one_verified_idx on public.bingo_claims (card_id, line_index)
  where (status = 'verified');

-- Why a claim was rejected: the specific boxes that don't fit, with reasons.
create table public.bingo_challenges (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.bingo_claims (id) on delete cascade,
  position smallint not null check (position between 0 and 24 and position <> 12),
  challenger_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (char_length(trim(reason)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index bingo_challenges_claim_idx on public.bingo_challenges (claim_id);

-- One thread per game (Best Bars comment pattern).
create table public.bingo_comments (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.bingo_games (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  text text not null check (char_length(trim(text)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index bingo_comments_game_idx on public.bingo_comments (game_id, created_at);

-- ═══════════════════════════════════════════════════════
-- HELPERS
-- ═══════════════════════════════════════════════════════

-- Who can launch/close a game: owner/admin, or the picker of the club's open
-- cycle — the same trio as Track Madness / Aux Battle.
create or replace function public.can_run_bingo(p_club uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.club_role(p_club) in ('owner', 'admin')
    or exists (
      select 1 from cycles
      where club_id = p_club and status = 'open' and picker_id = auth.uid()
    );
$$;

-- The 5 board positions of a line (the free center 12 appears where relevant;
-- claim validation skips it).
create or replace function public.bingo_line_positions(p_line int)
returns int[]
language sql
immutable
as $$
  select case
    when p_line between 0 and 4 then array[p_line * 5, p_line * 5 + 1, p_line * 5 + 2, p_line * 5 + 3, p_line * 5 + 4]
    when p_line between 5 and 9 then array[p_line - 5, p_line, p_line + 5, p_line + 10, p_line + 15]
    when p_line = 10 then array[0, 6, 12, 18, 24]
    when p_line = 11 then array[4, 8, 12, 16, 20]
  end;
$$;

-- Is this box inside a line with a live (pending/verified) claim? Such boxes
-- are locked against swaps.
create or replace function public.bingo_box_locked(p_card uuid, p_position int)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from bingo_claims c
    where c.card_id = p_card and c.status in ('pending', 'verified')
      and p_position = any (public.bingo_line_positions(c.line_index))
  );
$$;

-- ═══════════════════════════════════════════════════════
-- RPCs
-- ═══════════════════════════════════════════════════════

-- Launch a game for the club's open cycle. p_labels is the final category pool
-- (built-ins the admin kept + any customs), snapshotted into
-- bingo_game_categories. Cards are NOT dealt here — deal_bingo_card is lazy.
create or replace function public.create_bingo_game(p_club uuid, p_labels text[])
returns public.bingo_games
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle public.cycles;
  v_game public.bingo_games;
  v_count int;
begin
  if not public.can_run_bingo(p_club) then
    raise exception 'Only an admin or the current picker can start a bingo game';
  end if;
  select * into v_cycle from cycles where club_id = p_club and status = 'open';
  if not found then
    raise exception 'Bingo needs an open cycle';
  end if;
  if exists (select 1 from bingo_games where club_id = p_club and status = 'open') then
    raise exception 'A bingo game is already live — close it first';
  end if;

  select count(distinct trim(l)) into v_count
  from unnest(p_labels) as l
  where char_length(trim(l)) between 1 and 200;
  if v_count < 24 then
    raise exception 'The category pool needs at least 24 categories (got %)', v_count;
  end if;
  if v_count > 400 then
    raise exception 'That is too many categories';
  end if;

  insert into bingo_games (club_id, cycle_id, created_by)
  values (p_club, v_cycle.id, auth.uid())
  returning * into v_game;

  insert into bingo_game_categories (game_id, label)
  select v_game.id, trim(l)
  from unnest(p_labels) as l
  where char_length(trim(l)) between 1 and 200
  group by trim(l);

  perform public.publish_activity_event(
    p_club, 'bingo_started',
    jsonb_build_object('cycle_number', v_cycle.number, 'cycle_id', v_cycle.id, 'game_id', v_game.id)
  );

  return v_game;
end;
$$;

-- Deal the caller's card: 24 random categories from the game pool into random
-- positions, plus 3 random qualifying lines. Idempotent — returns the existing
-- card if already dealt (including for members who join mid-game).
create or replace function public.deal_bingo_card(p_game uuid)
returns public.bingo_cards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.bingo_games;
  v_card public.bingo_cards;
  v_lines smallint[];
begin
  select * into v_game from bingo_games where id = p_game;
  if not found then
    raise exception 'Game not found';
  end if;
  if not public.is_club_member(v_game.club_id) then
    raise exception 'Not a club member';
  end if;

  select * into v_card from bingo_cards where game_id = p_game and profile_id = auth.uid();
  if found then
    return v_card;
  end if;
  if v_game.status <> 'open' then
    raise exception 'The game is closed';
  end if;

  select array_agg(l::smallint order by ord) into v_lines
  from (
    select l, random() as ord from generate_series(0, 11) as l order by 2 limit 3
  ) picked(l, ord);

  insert into bingo_cards (game_id, profile_id, qualifying_lines)
  values (p_game, auth.uid(), v_lines)
  returning * into v_card;

  -- 24 random categories → the 24 non-center positions, both shuffled.
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

-- Fill (or swap) a box's song. Swapping always resets the listen state — a lit
-- box must always reflect a listened song. Duplicate songs on one card are
-- rejected (by Spotify id when both sides have one, else by title+artist).
create or replace function public.set_bingo_song(
  p_box uuid,
  p_title text,
  p_artist text,
  p_artwork_url text default null,
  p_spotify_url text default null,
  p_apple_url text default null,
  p_spotify_id text default null,
  p_duration_ms int default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_box public.bingo_boxes;
  v_card public.bingo_cards;
  v_game public.bingo_games;
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
  if public.bingo_box_locked(v_card.id, v_box.position) then
    raise exception 'That box is part of a claimed line';
  end if;
  if char_length(trim(coalesce(p_title, ''))) = 0 then
    raise exception 'A song needs a title';
  end if;
  if exists (
    select 1 from bingo_boxes b
    where b.card_id = v_card.id and b.id <> p_box and b.title is not null
      and (
        (b.spotify_id is not null and p_spotify_id is not null and b.spotify_id = p_spotify_id)
        or (lower(trim(b.title)) = lower(trim(p_title)) and lower(trim(b.artist)) = lower(trim(coalesce(p_artist, ''))))
      )
  ) then
    raise exception 'That song is already on your card — one song per box';
  end if;

  update bingo_boxes
  set title = trim(p_title),
      artist = trim(coalesce(p_artist, '')),
      artwork_url = nullif(p_artwork_url, ''),
      spotify_url = nullif(p_spotify_url, ''),
      apple_url = nullif(p_apple_url, ''),
      spotify_id = nullif(p_spotify_id, ''),
      duration_ms = p_duration_ms,
      listen_started_at = null,
      activated_at = null
  where id = p_box;
end;
$$;

-- Stamp the moment the member taps out to Spotify/Apple. mark_bingo_listened
-- only unlocks after the track's duration has elapsed from this stamp.
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

  update bingo_boxes set listen_started_at = now() where id = p_box;
end;
$$;

-- Light the box: the honor-system tap, gated by elapsed track time (min 30s,
-- 90s fallback when the duration is unknown).
create or replace function public.mark_bingo_listened(p_box uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_box public.bingo_boxes;
  v_card public.bingo_cards;
  v_game public.bingo_games;
  v_gate_secs numeric;
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
  if v_box.activated_at is not null then
    return;
  end if;
  if v_box.listen_started_at is null then
    raise exception 'Tap out and listen first';
  end if;

  v_gate_secs := greatest(coalesce(v_box.duration_ms / 1000.0, 90), 30);
  if now() < v_box.listen_started_at + make_interval(secs => v_gate_secs) then
    raise exception 'Still listening? The song is not over yet';
  end if;

  update bingo_boxes set activated_at = now() where id = p_box;
end;
$$;

-- BINGO! Explicit call on a completed qualifying line. Every non-free box on
-- the line must be lit. Emits the club-wide claim event (which doubles as the
-- "someone verify this" nudge).
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

  return v_claim;
end;
$$;

-- Clear or reject a pending claim. Any club member EXCEPT the claimer (that
-- includes admins — nobody self-clears; forced-close self-certification is the
-- only exception). Rejecting requires at least one challenge naming a box on
-- the line with a reason; challenged boxes go dark (re-listen after swapping).
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

-- End the game: launcher/admin/picker, or close_cycle below. Any still-pending
-- claims verify as self-certified (the claimer completed the line; nobody
-- disputed it — voiding them for others' inaction would be backwards).
create or replace function public.close_bingo_game(p_game uuid)
returns public.bingo_games
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.bingo_games;
  v_cycle_number int;
  v_winner text;
  v_count int;
begin
  select * into v_game from bingo_games where id = p_game;
  if not found then
    raise exception 'Game not found';
  end if;
  if v_game.created_by <> auth.uid() and not public.can_run_bingo(v_game.club_id) then
    raise exception 'Only an admin or the current picker can close the game';
  end if;
  if v_game.status <> 'open' then
    raise exception 'The game is already closed';
  end if;

  update bingo_claims c
  set status = 'verified', resolved_by = auth.uid(), resolved_at = now(), self_certified = true
  from bingo_cards k
  where c.card_id = k.id and k.game_id = p_game and c.status = 'pending';

  update bingo_games set status = 'closed', closed_at = now()
  where id = p_game
  returning * into v_game;

  select count(*) into v_count
  from bingo_claims c join bingo_cards k on k.id = c.card_id
  where k.game_id = p_game and c.status = 'verified';

  select p.display_name into v_winner
  from bingo_claims c
  join bingo_cards k on k.id = c.card_id
  join profiles p on p.id = k.profile_id
  where k.game_id = p_game and c.status = 'verified'
  order by c.resolved_at asc
  limit 1;

  select number into v_cycle_number from cycles where id = v_game.cycle_id;
  perform public.publish_activity_event(
    v_game.club_id, 'bingo_closed',
    jsonb_build_object(
      'game_id', p_game, 'cycle_number', v_cycle_number,
      'winner_name', v_winner, 'bingo_count', v_count
    )
  );

  return v_game;
end;
$$;

revoke execute on function public.can_run_bingo(uuid) from anon, public;
revoke execute on function public.bingo_box_locked(uuid, int) from anon, public;
revoke execute on function public.create_bingo_game(uuid, text[]) from anon, public;
revoke execute on function public.deal_bingo_card(uuid) from anon, public;
revoke execute on function public.set_bingo_song(uuid, text, text, text, text, text, text, int) from anon, public;
revoke execute on function public.start_bingo_listen(uuid) from anon, public;
revoke execute on function public.mark_bingo_listened(uuid) from anon, public;
revoke execute on function public.claim_bingo(uuid, int) from anon, public;
revoke execute on function public.resolve_bingo_claim(uuid, boolean, jsonb) from anon, public;
revoke execute on function public.close_bingo_game(uuid) from anon, public;

-- ═══════════════════════════════════════════════════════
-- CLOSE_CYCLE — also closes the cycle's bingo game.
-- Re-created in full; showdown + aux battle blocks unchanged.
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
  v_bingo public.bingo_games;
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

  -- Close the cycle's bingo game (pending claims self-certify inside).
  select * into v_bingo from bingo_games where cycle_id = p_cycle and status = 'open';
  if found then
    perform public.close_bingo_game(v_bingo.id);
  end if;

  perform public.publish_activity_event(
    v_cycle.club_id, 'cycle_closed',
    jsonb_build_object('cycle_number', v_cycle.number, 'cycle_id', v_cycle.id)
  );

  return v_cycle;
end;
$$;

revoke execute on function public.close_cycle(uuid) from anon, public;

-- ═══════════════════════════════════════════════════════
-- RLS — boards are fully public inside the club; writes via RPCs only
-- (comments are the direct-write exception, Best Bars pattern).
-- ═══════════════════════════════════════════════════════

alter table public.bingo_categories enable row level security;
alter table public.bingo_games enable row level security;
alter table public.bingo_game_categories enable row level security;
alter table public.bingo_cards enable row level security;
alter table public.bingo_boxes enable row level security;
alter table public.bingo_claims enable row level security;
alter table public.bingo_challenges enable row level security;
alter table public.bingo_comments enable row level security;

-- The built-in pool is app content, readable by any signed-in member.
create policy bingo_categories_select on public.bingo_categories
  for select to authenticated using (true);

create policy bingo_games_select on public.bingo_games
  for select to authenticated using (public.is_club_member(club_id));
-- Escape hatch for a botched launch: scrap an OPEN game (cascades everything).
create policy bingo_games_delete on public.bingo_games
  for delete to authenticated
  using (
    status = 'open'
    and (created_by = auth.uid() or public.club_role(club_id) in ('owner', 'admin'))
  );

create policy bingo_game_categories_select on public.bingo_game_categories
  for select to authenticated
  using (exists (select 1 from bingo_games g where g.id = game_id and public.is_club_member(g.club_id)));

create policy bingo_cards_select on public.bingo_cards
  for select to authenticated
  using (exists (select 1 from bingo_games g where g.id = game_id and public.is_club_member(g.club_id)));

create policy bingo_boxes_select on public.bingo_boxes
  for select to authenticated
  using (exists (
    select 1 from bingo_cards k join bingo_games g on g.id = k.game_id
    where k.id = card_id and public.is_club_member(g.club_id)
  ));

create policy bingo_claims_select on public.bingo_claims
  for select to authenticated
  using (exists (
    select 1 from bingo_cards k join bingo_games g on g.id = k.game_id
    where k.id = card_id and public.is_club_member(g.club_id)
  ));

create policy bingo_challenges_select on public.bingo_challenges
  for select to authenticated
  using (exists (
    select 1 from bingo_claims c
    join bingo_cards k on k.id = c.card_id
    join bingo_games g on g.id = k.game_id
    where c.id = claim_id and public.is_club_member(g.club_id)
  ));

create policy bingo_comments_select on public.bingo_comments
  for select to authenticated
  using (exists (select 1 from bingo_games g where g.id = game_id and public.is_club_member(g.club_id)));
create policy bingo_comments_insert on public.bingo_comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from bingo_games g where g.id = game_id and public.is_club_member(g.club_id))
  );
create policy bingo_comments_delete on public.bingo_comments
  for delete to authenticated
  using (
    author_id = auth.uid()
    or exists (select 1 from bingo_games g where g.id = game_id and public.club_role(g.club_id) in ('owner', 'admin'))
  );

-- ═══════════════════════════════════════════════════════
-- SEED — the built-in category pool (175, provided 2026-07-03; also in
-- supabase/seed/bingo_categories.csv).
-- ═══════════════════════════════════════════════════════

insert into public.bingo_categories (label) values
  ('Song by a boy band'),
  ('Song by a girl group'),
  ('Song by a sibling band'),
  ('Song by a one-hit wonder'),
  ('Song by an artist with only one name'),
  ('Song by an artist with a stage name'),
  ('Song by an artist under 21 when released'),
  ('Song by an artist over 60 when released'),
  ('Song by a supergroup'),
  ('Song by a duo'),
  ('Song by a trio'),
  ('Song by a band with more than five members'),
  ('Song by an artist from New York'),
  ('Song by an artist from Puerto Rico'),
  ('Song by an artist from outside the U.S.'),
  ('Song by an artist singing in a language you do not speak'),
  ('Song by an artist who also acts'),
  ('Song by an artist who started on YouTube/SoundCloud/TikTok'),
  ('Song by a fictional band or fictional artist'),
  ('Song by an artist with a color in their name'),
  ('Song by an artist with an animal in their name'),
  ('Song by an artist with a number in their name'),
  ('Song by an artist whose name starts with The'),
  ('Song by an artist who changed their name'),
  ('Song by an artist who has won a Grammy'),
  ('Song by an artist who has never won a Grammy'),
  ('Song by an artist with fewer than 100k monthly listeners'),
  ('Song by an artist with more than 50 million monthly listeners'),
  ('Song by a band that broke up'),
  ('Song by a band that reunited'),
  ('Country song'),
  ('Reggaeton song'),
  ('Salsa song'),
  ('Merengue song'),
  ('Bachata song'),
  ('Cumbia song'),
  ('Afrobeats song'),
  ('Amapiano song'),
  ('K-pop song'),
  ('J-pop song'),
  ('Hyperpop song'),
  ('Ska song'),
  ('Punk song'),
  ('Emo song'),
  ('Metal song'),
  ('Jazz song'),
  ('Blues song'),
  ('Gospel song'),
  ('Disco song'),
  ('Funk song'),
  ('Folk song'),
  ('Bluegrass song'),
  ('House song'),
  ('Techno song'),
  ('Drum and bass song'),
  ('Dubstep song'),
  ('Ambient song'),
  ('Classical piece'),
  ('Opera song'),
  ('Shoegaze song'),
  ('Grunge song'),
  ('New wave song'),
  ('Synth-pop song'),
  ('Psychedelic rock song'),
  ('Yacht rock song'),
  ('Motown song'),
  ('Doo-wop song'),
  ('Industrial song'),
  ('Trap song'),
  ('Boom bap rap song'),
  ('Song from the 1950s'),
  ('Song from the 1960s'),
  ('Song from the 1970s'),
  ('Song from the 1980s'),
  ('Song from the 1990s'),
  ('Song from the 2000s'),
  ('Song from the 2010s'),
  ('Song from the 2020s'),
  ('Song released the year you were born'),
  ('Song released before you were born'),
  ('Song released this year'),
  ('Song older than your parents'),
  ('Song from a debut album'),
  ('Song from an artist’s final album'),
  ('Song from an artist’s comeback era'),
  ('Song from a live album'),
  ('Song from a deluxe edition'),
  ('Song from a greatest hits album'),
  ('Song from a soundtrack'),
  ('Song from a musical'),
  ('Song with a key change'),
  ('Song with a beat switch'),
  ('Song with a long instrumental intro'),
  ('Song with no drums'),
  ('Song with no vocals'),
  ('Song with spoken-word sections'),
  ('Song with a choir'),
  ('Song with a children’s choir'),
  ('Song with whistling'),
  ('Song with handclaps'),
  ('Song with prominent horns'),
  ('Song with prominent strings'),
  ('Song with steel drums'),
  ('Song with accordion'),
  ('Song with harmonica'),
  ('Song with saxophone solo'),
  ('Song with guitar solo'),
  ('Song with a bassline that carries the song'),
  ('Song with a fade-out ending'),
  ('Song with an abrupt ending'),
  ('Song longer than 7 minutes'),
  ('Song under 2 minutes'),
  ('Song with a one-word title'),
  ('Song with a title longer than 8 words'),
  ('Song with parentheses in the title'),
  ('Song with a question mark in the title'),
  ('Song with a number in the title'),
  ('Song with a person’s name in the title'),
  ('Song with a place in the title'),
  ('Song with a day of the week in the title'),
  ('Song about friendship'),
  ('Song about betrayal'),
  ('Song about a breakup'),
  ('Song about getting back together'),
  ('Song about money'),
  ('Song about dancing'),
  ('Song about drinking'),
  ('Song about being tired'),
  ('Song about aging'),
  ('Song about childhood'),
  ('Song about a city'),
  ('Song about a specific state or country'),
  ('Song about driving'),
  ('Song about the beach'),
  ('Song about outer space'),
  ('Song about dreams'),
  ('Song about ghosts'),
  ('Song about revenge'),
  ('Song about being famous'),
  ('Song about work'),
  ('Song about a party ending'),
  ('Song about summer'),
  ('Song about winter'),
  ('Song that mentions wine'),
  ('Song that mentions vinyl, records, DJs, or radio'),
  ('Song with religious imagery'),
  ('Song with a murder ballad vibe'),
  ('Song that sounds romantic but is actually sad'),
  ('Song that sounds happy but has dark lyrics'),
  ('Song with lyrics you would never say out loud'),
  ('Song recommended by someone older than you'),
  ('Song recommended by someone younger than you'),
  ('Song you found through a movie'),
  ('Song you found through a TV show'),
  ('Song you found through a video game'),
  ('Song you found from a sample'),
  ('Song where you prefer the cover to the original'),
  ('Song where you prefer the original to the cover'),
  ('Song that samples another famous song'),
  ('Song that was sampled by another famous song'),
  ('Song you thought you hated but now like'),
  ('Song by an artist you usually avoid'),
  ('Song from a genre you rarely listen to'),
  ('Song from a country you’ve never visited'),
  ('Song with fewer than 1 million streams'),
  ('Song with over 1 billion streams'),
  ('Song that your parents might know'),
  ('Song that would confuse your parents'),
  ('Song you’d play at a wedding'),
  ('Song you’d play at a funeral'),
  ('Song you’d play walking into a boxing match'),
  ('Song you’d play during a villain arc'),
  ('Song you’d play for aliens to explain Earth'),
  ('Song you’d use to convince someone an artist is good'),
  ('Song you’d be embarrassed to get caught enjoying');
