-- Listening Bingo rarity: store each box song's Last.fm all-time playcount so
-- the client can score bingos and cards by obscurity (fewer global streams =
-- rarer, HoopGrids-style). Counts come from the track-stats Edge Function
-- (Last.fm track.getInfo) — the scoring curve itself is pure client math.
--
-- Backfill path for songs picked before this shipped: set_bingo_playcount lets
-- a member stamp the count onto their own boxes lazily when the screen loads
-- (metadata only — no gameplay effect, so it stays writable after close too).

alter table public.bingo_boxes add column lastfm_playcount bigint;

-- set_bingo_song grows a p_lastfm_playcount param (drop first: adding a
-- defaulted arg creates an overload, and the old signature must not linger).
drop function public.set_bingo_song(uuid, text, text, text, text, text, text, int);

create or replace function public.set_bingo_song(
  p_box uuid,
  p_title text,
  p_artist text,
  p_artwork_url text default null,
  p_spotify_url text default null,
  p_apple_url text default null,
  p_spotify_id text default null,
  p_duration_ms int default null,
  p_lastfm_playcount bigint default null
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
      lastfm_playcount = p_lastfm_playcount,
      listen_started_at = null,
      activated_at = null
  where id = p_box;
end;
$$;

-- Stamp (or refresh) the playcount on one of the caller's own boxes without
-- touching the song or its listen state. Used to backfill boxes picked before
-- rarity shipped and to late-resolve slow Last.fm lookups.
create or replace function public.set_bingo_playcount(p_box uuid, p_playcount bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select k.profile_id into v_owner
  from bingo_boxes b join bingo_cards k on k.id = b.card_id
  where b.id = p_box;
  if not found then
    raise exception 'Box not found';
  end if;
  if v_owner <> auth.uid() then
    raise exception 'Not your card';
  end if;
  update bingo_boxes set lastfm_playcount = p_playcount where id = p_box;
end;
$$;

revoke execute on function public.set_bingo_song(uuid, text, text, text, text, text, text, int, bigint) from anon, public;
revoke execute on function public.set_bingo_playcount(uuid, bigint) from anon, public;
