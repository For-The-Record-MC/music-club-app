-- Theme brackets: Track Madness's second mode. A bracket's subject is now
-- either an artist (as shipped) or a THEME — any Last.fm tag (genre, decade,
-- mood), seeded by tag-relevance rank via the bracket-seed Edge Function, max
-- two tracks per artist, unrestricted manual swaps at review. Everything
-- downstream (picks, consensus, spoiler guard, solo scope, import) is
-- track-id-based and untouched.
--
-- brackets.artist_name does double duty as the subject name (the tag text for
-- themes, with artist_spotify_id = '' and artist_image_url null). Theme shelf
-- cards render a 2x2 collage instead of an artist photo: theme_art holds the
-- top four seeds' artwork, derived here at create time so archive/solo lists
-- need no bracket_tracks fetch.

alter table public.brackets
  add column kind text not null default 'artist' check (kind in ('artist', 'theme')),
  add column theme_art text[];

-- Which artist a track belongs to — themes are multi-artist, so the bracket-
-- level artist_name can't say. Empty string on artist brackets (the bracket
-- knows) and on pre-theme rows.
alter table public.bracket_tracks
  add column artist text not null default '' check (char_length(artist) <= 300);

-- ═══════════════════════════════════════════════════════
-- create_bracket — now kind-aware. Old clients call with named args and no
-- p_kind; the default keeps them on artist behavior unchanged.
-- ═══════════════════════════════════════════════════════

drop function public.create_bracket(uuid, text, text, text, int, jsonb, text);

create or replace function public.create_bracket(
  p_club uuid,
  p_artist_name text,
  p_artist_spotify_id text,
  p_artist_image_url text,
  p_size int,
  p_tracks jsonb,
  p_scope text default 'club',
  p_kind text default 'artist'
)
returns public.brackets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bracket public.brackets;
  v_order int[];
  v_pos int[];
  v_theme_art text[];
  i int;
  t jsonb;
begin
  if p_scope not in ('club', 'personal') then
    raise exception 'Invalid scope';
  end if;
  if p_kind not in ('artist', 'theme') then
    raise exception 'Invalid bracket kind';
  end if;
  if p_scope = 'club' then
    if not public.can_run_bracket(p_club) then
      raise exception 'Only an admin or the current picker can start a bracket';
    end if;
    if exists (select 1 from brackets where club_id = p_club and status = 'open' and scope = 'club') then
      raise exception 'A bracket is already live — close it first';
    end if;
  else
    -- Solo: any member, no live-bracket limit.
    if not public.is_club_member(p_club) then
      raise exception 'Not a club member';
    end if;
  end if;
  if p_size not in (16, 32, 64) then
    raise exception 'Bracket size must be 16, 32, or 64';
  end if;
  if jsonb_typeof(p_tracks) <> 'array' or jsonb_array_length(p_tracks) <> p_size then
    raise exception 'Expected exactly % tracks', p_size;
  end if;

  -- Theme shelf art: the top four seeds' artwork, frozen at creation.
  if p_kind = 'theme' then
    select array_agg(art order by ord) into v_theme_art
    from (
      select t2 ->> 'artwork_url' as art, ord
      from jsonb_array_elements(p_tracks) with ordinality as e(t2, ord)
      where coalesce(t2 ->> 'artwork_url', '') <> ''
      order by ord
      limit 4
    ) top4;
  end if;

  insert into brackets (club_id, artist_name, artist_spotify_id, artist_image_url, size, created_by, scope, owner_id, kind, theme_art)
  values (
    p_club, trim(p_artist_name), coalesce(p_artist_spotify_id, ''), p_artist_image_url, p_size, auth.uid(),
    p_scope, case when p_scope = 'personal' then auth.uid() end,
    p_kind, v_theme_art
  )
  returning * into v_bracket;

  v_order := public.bracket_seed_order(p_size);
  v_pos := array_fill(0, array[p_size]);
  for i in 1..p_size loop
    v_pos[v_order[i]] := i;
  end loop;

  for i in 1..p_size loop
    t := p_tracks -> (i - 1);
    if char_length(trim(coalesce(t ->> 'title', ''))) = 0 then
      raise exception 'Track % is missing a title', i;
    end if;
    insert into bracket_tracks
      (bracket_id, seed, position, title, album, artist, artwork_url, spotify_url, apple_url, preview_url, playcount)
    values (
      v_bracket.id, i, v_pos[i],
      trim(t ->> 'title'), coalesce(t ->> 'album', ''), coalesce(trim(t ->> 'artist'), ''),
      nullif(t ->> 'artwork_url', ''), nullif(t ->> 'spotify_url', ''),
      nullif(t ->> 'apple_url', ''), nullif(t ->> 'preview_url', ''),
      coalesce((t ->> 'playcount')::bigint, 0)
    );
  end loop;

  -- Solo runs are silent; only club brackets announce. artist_name carries the
  -- theme text for theme brackets — the copy reads the same either way.
  if p_scope = 'club' then
    perform public.publish_activity_event(
      p_club, 'bracket_started',
      jsonb_build_object('artist_name', v_bracket.artist_name, 'size', p_size, 'bracket_id', v_bracket.id)
    );
  end if;

  return v_bracket;
end;
$$;

revoke execute on function public.create_bracket(uuid, text, text, text, int, jsonb, text, text) from anon, public;

-- ═══════════════════════════════════════════════════════
-- Profile trophy shelf: champions now say which kind of bracket they came
-- from (and carry the collage for theme cards). Body otherwise unchanged.
-- ═══════════════════════════════════════════════════════

create or replace function public.member_studio_stats(p_club uuid, p_profile uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not public.is_club_member(p_club) then null else jsonb_build_object(
    'showdown_wins', coalesce((
      select jsonb_agg(jsonb_build_object(
        'cycle_number', c.number, 'title', ss.title, 'artist', ss.artist, 'theme', sd.theme_text
      ) order by c.number)
      from showdowns sd
      join cycles c on c.id = sd.cycle_id
      join showdown_submissions ss on ss.id = sd.winner_submission_id
      where sd.club_id = p_club and ss.profile_id = p_profile
    ), '[]'::jsonb),
    'aux_wins', coalesce((
      select jsonb_agg(jsonb_build_object('cycle_number', c.number, 'theme', ab.theme_text) order by c.number)
      from aux_battles ab
      join cycles c on c.id = ab.cycle_id
      where ab.club_id = p_club and ab.winner_profile_id = p_profile
    ), '[]'::jsonb),
    'bingo_crowns', coalesce((
      select jsonb_agg(jsonb_build_object('at', fc.resolved_at) order by fc.resolved_at)
      from (
        select distinct on (k.game_id) k.game_id, k.profile_id, cl.resolved_at
        from bingo_claims cl
        join bingo_cards k on k.id = cl.card_id
        join bingo_games g on g.id = k.game_id
        where g.club_id = p_club and cl.status = 'verified'
        order by k.game_id, cl.resolved_at asc
      ) fc
      where fc.profile_id = p_profile
    ), '[]'::jsonb),
    'blackouts', coalesce((
      select jsonb_agg(jsonb_build_object('at', bo.done_at) order by bo.done_at)
      from (
        select k.id, max(b.activated_at) as done_at
        from bingo_cards k
        join bingo_games g on g.id = k.game_id
        join bingo_boxes b on b.card_id = k.id
        where g.club_id = p_club and k.profile_id = p_profile and b.activated_at is not null
        group by k.id
        having count(*) = 24
      ) bo
    ), '[]'::jsonb),
    'champions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'bracket_id', br.id, 'artist_name', br.artist_name, 'size', br.size,
        'closed_at', br.closed_at, 'champ_title', t.title,
        'champ_artwork_url', t.artwork_url, 'champ_seed', t.seed,
        'scope', br.scope, 'kind', br.kind, 'theme_art', br.theme_art
      ) order by e.completed_at desc)
      from bracket_entries e
      join brackets br on br.id = e.bracket_id
      join bracket_tracks t on t.id = e.champion_track_id
      where br.club_id = p_club and e.profile_id = p_profile and e.completed_at is not null
        and (br.scope = 'club' or br.status = 'closed')
    ), '[]'::jsonb),
    'stats', jsonb_build_object(
      'brackets_finished', (
        select count(*) from bracket_entries e join brackets br on br.id = e.bracket_id
        where br.club_id = p_club and e.profile_id = p_profile and e.completed_at is not null
          and br.scope = 'club'
      ),
      'takes', (select count(*) from musical_takes where club_id = p_club and author_id = p_profile),
      'bars', (select count(*) from best_bars where club_id = p_club and author_id = p_profile),
      'boxes_lit', (
        select count(*) from bingo_boxes b
        join bingo_cards k on k.id = b.card_id
        join bingo_games g on g.id = k.game_id
        where g.club_id = p_club and k.profile_id = p_profile and b.activated_at is not null
      ),
      'bingos', (
        select count(*) from bingo_claims cl
        join bingo_cards k on k.id = cl.card_id
        join bingo_games g on g.id = k.game_id
        where g.club_id = p_club and k.profile_id = p_profile and cl.status = 'verified'
      ),
      'conversions', (
        select count(*) from convince_targets t
        join convince_posts cp on cp.id = t.post_id
        where cp.club_id = p_club and cp.author_id = p_profile and t.verdict = 'converted'
      )
    )
  ) end;
$$;
